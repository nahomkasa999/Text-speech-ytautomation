"""Run the real browser frame transport and inspect the saved media."""
import array
import base64
import json
import math
import os
from pathlib import Path
import socket
import subprocess
import threading
import time
import wave

import numpy as np
import pytest
import psutil
from fastapi import FastAPI, Request
from fastapi.responses import HTMLResponse
from fastapi.staticfiles import StaticFiles
import uvicorn

from src.routes import native_export as routes
from src.services import native_export as native


SCRIPT = '''
import {Scene} from '/static/js/video/scene.js';
import {exportVideoNative, webCodecsConfigs} from '/static/js/video/nativeExporter.js';
import {renderScene} from '/static/js/video/renderer.js';
window.pywebview = {api:{prepare_video_export: async settings => {
  const response = await fetch('/prepare', {method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(settings)});
  return response.json();
}}};
window.encoderSupport = async format => (await webCodecsConfigs({format,width:160,height:90,fps:30,bitrate:500000})).length > 0;
// Replace VideoEncoder with one that reports an error on its `failAt`th frame.
window.injectEncoderFailure = failAt => {
  const Real = window.VideoEncoder;
  window.VideoEncoder = class extends Real {
    constructor(init) { super(init); this.onFailure = init.error; this.count = 0; }
    encode(frame, options) {
      if (this.count++ === failAt) { setTimeout(() => this.onFailure(new DOMException('Injected encoder failure', 'EncodingError'))); return; }
      return super.encode(frame, options);
    }
  };
  return () => { window.VideoEncoder = Real; };
};
window.runExport = async (animated, format, cancel=false, videoEncoding='auto', filename=null) => {
  const scene = new Scene({canvas:{width:160,height:90,background:'#264e74'},layers:[
    {id:'heading',type:'text',x:8,y:4,width:140,height:20,text:'CPU export',fontSize:14,fill:'#ffffff'},
    {id:'layer_captions',type:'transcription',x:8,y:52,width:145,height:30,fontSize:12,fill:'#ffffff'},
    ...(animated ? [{id:'wave',type:'audio_widget',widgetStyle:'ambient_flow',x:8,y:25,width:140,height:24,color:'#eeeeee',syncToVoice:true}] : [])
  ],syncedSegments:[{start:0,end:1.5,text:'First caption.',is_paragraph_end:true},{start:1.5,end:3,text:'Second caption.',is_paragraph_end:true}]});
  scene.voiceEnvelope={fps:30,levels:Uint8Array.from({length:90},(_,i)=>(i*7)%256)};
  const controller=new AbortController();
  const progress=[];
  const start=performance.now();
  const result=await exportVideoNative({scene,videoEncoding,settings:{filename:filename||('test.'+format),format,width:160,height:90,fps:30,audio_url:'/audio/fixture.wav',speed:1.5,volume:1,preserve_pitch:true},signal:controller.signal,onProgress:s=>{
    progress.push(s.stage);
    if(cancel && s.frames>0)controller.abort();
  }});
  const expected=[];
  const canvas=document.createElement('canvas');canvas.width=160;canvas.height=90;
  const ctx=canvas.getContext('2d');
  for(const index of [0,15,30,45]){
    renderScene(ctx,scene,{currentTime:index/30*1.5});
    const pixels=ctx.getImageData(0,0,160,90).data;
    let binary='';for(const value of pixels)binary+=String.fromCharCode(value);
    expected.push(btoa(binary));
  }
  return {result,progress,expected,wall_seconds:(performance.now()-start)/1000};
};
'''


@pytest.fixture
def browser_server(tmp_path, monkeypatch):
    monkeypatch.setattr(native, 'AUDIO_DIR', str(tmp_path))
    manager = native.ExportManager(journal_dir=tmp_path/'jobs')
    monkeypatch.setattr(routes, 'export_manager', manager)
    samples = array.array('h', (int(9000*math.sin(2*math.pi*440*i/48000)) for i in range(144000)))
    with wave.open(str(tmp_path/'fixture.wav'), 'wb') as out:
        out.setparams((1,2,48000,0,'NONE','not compressed'))
        out.writeframes(samples.tobytes())
    app = FastAPI()
    app.include_router(routes.router)
    @app.get('/')
    def index():
        return HTMLResponse('<script type="module">'+SCRIPT+'</script>')
    @app.post('/prepare')
    async def prepare(request: Request):
        settings = await request.json()
        return manager.prepare(tmp_path/settings['filename'], settings)
    app.mount('/static', StaticFiles(directory=Path(__file__).resolve().parents[1]/'static'))
    sock = socket.socket()
    sock.bind(('127.0.0.1',0))
    port=sock.getsockname()[1]
    server=uvicorn.Server(uvicorn.Config(app, log_level='warning'))
    thread=threading.Thread(target=lambda:server.run(sockets=[sock]),daemon=True)
    thread.start()
    for _ in range(200):
        if server.started:break
        time.sleep(.025)
    assert server.started
    yield f'http://127.0.0.1:{port}', manager, tmp_path
    manager.shutdown()
    server.should_exit=True
    thread.join(timeout=5)
    sock.close()


def test_browser_native_export(browser_server):
    from playwright.sync_api import sync_playwright
    url,manager,tmp_path=browser_server
    reports=[]
    with sync_playwright() as playwright:
        browser=playwright.chromium.launch(headless=True,args=['--disable-gpu'])
        page=browser.new_page()
        page.goto(url)
        page.wait_for_function('typeof window.runExport === "function"')
        support={container:page.evaluate('f=>window.encoderSupport(f)',container) for container in ('mp4','webm')}
        print('WebCodecs encoder support', support)
        cases=[(animated,container,encoding) for animated,container in [(False,'mp4'),(True,'mp4'),(True,'webm')] for encoding in ('raw','auto')]
        for animated,container,encoding in cases:
            stop=threading.Event()
            peak=[0]
            def sample():
                process=psutil.Process()
                while not stop.wait(.05):
                    total=0
                    for child in [process]+process.children(recursive=True):
                        try:total+=child.memory_info().rss
                        except psutil.Error:pass
                    peak[0]=max(peak[0],total)
            sampler=threading.Thread(target=sample,daemon=True)
            sampler.start()
            try:report=page.evaluate('([a,f,e])=>window.runExport(a,f,false,e)',[animated,container,encoding])
            finally:
                stop.set()
                sampler.join()

            result=report['result']
            assert result['stage']=='completed'
            assert result['rendered_frames']==(60 if animated else 2)
            # Only the first frame and the caption change repaint the whole picture.
            assert result['renderer_stats']['fullFrames']==2
            assert 'encoding' in report['progress']
            encoded=encoding=='auto' and support[container]
            assert result['video_path']==('webcodecs' if encoded else 'raw'),result
            path=Path(result['path'])
            metadata=json.loads(subprocess.check_output(['ffprobe','-v','error','-show_streams','-show_format','-of','json',str(path)]))
            streams=metadata['streams']
            video=next(s for s in streams if s['codec_type']=='video')
            audio=next(s for s in streams if s['codec_type']=='audio')
            assert abs(float(video.get('start_time',0))-float(audio.get('start_time',0)))<.035
            if encoded:
                assert video['codec_name']==('h264' if container=='mp4' else 'vp9')
                assert float(video['start_time'])==0 and abs(float(audio['start_time']))<.01
                packets=json.loads(subprocess.check_output(['ffprobe','-v','error','-select_streams','v','-show_entries','packet=pts_time','-of','json',str(path)]))['packets']
                # Exactly one frame every 1/30 s, including repeated (unchanged) frames.
                # WebM stores milliseconds, so allow its rounding.
                assert len(packets)==60
                assert all(abs(float(p['pts_time'])-i/30)<=.0005+1e-9 for i,p in enumerate(packets)),packets
            decoded=subprocess.check_output([native.validate_ffmpeg(),'-v','error','-i',str(path),'-an','-fps_mode','passthrough','-f','rawvideo','-pix_fmt','rgba','pipe:1'])
            frames=np.frombuffer(decoded,dtype=np.uint8).reshape(-1,90,160,4)
            assert len(frames)==60
            differences=[]
            for index,expected in zip([0,15,30,45],report.pop('expected')):
                original=np.frombuffer(base64.b64decode(expected),dtype=np.uint8).reshape(90,160,4)
                mae=float(np.abs(frames[index,:,:,:3].astype(float)-original[:,:,:3]).mean())
                differences.append(mae)
                assert mae<12, (animated,container,index,mae)
            reports.append(dict(animated=animated,container=container,video_path=result['video_path'],wall_seconds=report['wall_seconds'],
                                rendered_frames=result['rendered_frames'],decoded_frames=len(frames),pixel_mae=differences,peak_process_tree_rss_bytes=peak[0]))
        progress_values=page.evaluate('''async()=>{
            const {ExportProgress}=await import('/static/js/modules/studio/exporter/exportProgress.js');
            let cancelled=false;const panel=new ExportProgress(()=>{cancelled=true;});
            panel.update({stage:'encoding',progress:0.5,elapsed_seconds:10,encoded_seconds:20,speed:2,eta_seconds:10});
            const text=panel.element.textContent;panel.element.querySelector('[data-cancel]').click();
            const result={text,cancelled,disabled:panel.element.querySelector('[data-cancel]').disabled};
            panel.close();return result;
        }''')
        assert '2.00× real time' in progress_values['text']
        assert '0:00:10' in progress_values['text']
        assert progress_values['cancelled'] and progress_values['disabled']
        error=page.evaluate('async()=>{try{await window.runExport(true,"mp4",true,"raw");return null;}catch(e){return e.name;}}')
        assert error=='ExportCancelledError'
        assert not list(tmp_path.glob('.*.partial'))
        assert all(job.stage in native.TERMINAL for job in manager.jobs.values())
        if support['mp4']:
            # The encoder fails before any encoded video reached the server: raw frames take over.
            report=page.evaluate('''async()=>{const restore=window.injectEncoderFailure(0);
                try{return await window.runExport(true,'mp4',false,'auto','fallback.mp4');}finally{restore();}}''')
            result=report['result']
            assert result['stage']=='completed' and result['video_path']=='raw'
            assert 'Injected encoder failure' in result['video_fallback_reason']
            assert result['rendered_frames']==60
            frames=np.frombuffer(subprocess.check_output([native.validate_ffmpeg(),'-v','error','-i',result['path'],'-an','-fps_mode','passthrough',
                                                          '-f','rawvideo','-pix_fmt','rgba','pipe:1']),dtype=np.uint8).reshape(-1,90,160,4)
            assert len(frames)==60
            for index,expected in zip([0,15,30,45],report['expected']):
                original=np.frombuffer(base64.b64decode(expected),dtype=np.uint8).reshape(90,160,4)
                assert float(np.abs(frames[index,:,:,:3].astype(float)-original[:,:,:3]).mean())<12
            # The encoder fails after encoded video was committed: the export fails cleanly.
            (tmp_path/'broken.mp4').write_bytes(b'keep me')
            error=page.evaluate('''async()=>{const restore=window.injectEncoderFailure(58);
                try{await window.runExport(true,'mp4',false,'auto','broken.mp4');return null;}catch(e){return e.message;}finally{restore();}}''')
            assert error and 'Injected encoder failure' in error, error
            assert (tmp_path/'broken.mp4').read_bytes()==b'keep me'
            assert not list(tmp_path.glob('.*.partial'))
            assert all(job.stage in native.TERMINAL for job in manager.jobs.values())
            assert list(manager.jobs.values())[-1].frames>0
        # Cancel while encoded chunks are streaming (auto uses WebCodecs where supported).
        error=page.evaluate('async()=>{try{await window.runExport(true,"webm",true);return null;}catch(e){return e.name;}}')
        assert error=='ExportCancelledError'
        if support['webm']:
            assert list(manager.jobs.values())[-1].video=='webcodecs'
        assert not list(tmp_path.glob('.*.partial'))
        browser.close()
    artifact=Path(os.environ.get('EXPORT_BROWSER_REPORT',str(tmp_path/'browser-report.json')))
    artifact.write_text(json.dumps(reports,indent=2))
    print(json.dumps(reports))
