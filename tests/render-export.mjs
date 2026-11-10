import { createServer } from 'node:http';
import { readFile, mkdtemp, rm } from 'node:fs/promises';
import { spawn } from 'node:child_process';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';

if (process.argv.includes('--mock')) {
  const context = {
    save() {}, restore() {}, setTransform() {}, clearRect() {}, fillRect() {}, drawImage() {},
    beginPath() {}, moveTo() {}, lineTo() {}, quadraticCurveTo() {}, closePath() {}, fill() {},
    stroke() {}, rect() {}, clip() {}, translate() {}, rotate() {}, fillText() {}, strokeText() {},
    measureText(text) { return { width: text.length * 6 }; }
  };
  globalThis.document = {
    fonts: { ready: Promise.resolve(), load: async () => [], addEventListener() {}, removeEventListener() {} },
    createElement() { return { width: 0, height: 0, getContext: () => context }; }
  };
  const { Scene } = await import('../static/js/video/scene.js');
  const { measureTextLayout } = await import('../static/js/video/textMeasurement.js');
  const { createExportRenderer } = await import('../static/js/video/exportRenderer.js');
  const text = { text: 'one two three', width: 100, height: 50, fontSize: 12, _exportMemoizeLayout: true };
  const first = measureTextLayout(context, text);
  assertLayout(first === measureTextLayout(context, text), 'layout cache reuse');
  text.width = 30;
  assertLayout(first !== measureTextLayout(context, text), 'layout width invalidation');
  function assertLayout(condition, message) { if (!condition) throw Error(message); }
  const scene = new Scene({ canvas: { width: 160, height: 90 }, layers: [
    { id: 'shape', type: 'shape', startTime: 1, endTime: 2 },
    { id: 'layer_captions', type: 'transcription', width: 100, height: 20, fontSize: 12 }
  ], syncedSegments: [
    { start: 0, end: 1, text: 'first page', is_paragraph_end: true },
    { start: 1, end: 2, text: 'second page', is_paragraph_end: true }
  ] });
  const renderer = await createExportRenderer(scene, { width: 160, height: 90 });
  const assert = (condition, message) => { if (!condition) throw Error(message); };
  assert(renderer.repeatFrames(0, 90, 30, 1) === 30, 'caption page boundary');
  assert(renderer.repeatFrames(30, 90, 30, 1) === 31, 'inclusive layer end');
  await renderer.renderFrame(0);
  const draws = renderer.stats.draws;
  await renderer.renderFrame(0.5);
  assert(renderer.stats.draws === draws && renderer.stats.cacheHits > 0, 'cache reuse');
  await renderer.renderFrame(1);
  assert(renderer.stats.draws > draws, 'caption and layer invalidation');
  renderer.dispose();
  assert(renderer.stats.cachedBytes === 0, 'cache released');
  globalThis.Image = class { addEventListener() {} removeEventListener() {} };
  const controller = new AbortController();
  const loading = createExportRenderer(new Scene({layers:[{type:'image',src:'pending.png'}]}),
    {width:160,height:90,signal:controller.signal}).then(async renderer => {
      try { await renderer.renderFrame(0); } finally { renderer.dispose(); }
    });
  setTimeout(() => controller.abort(), 0);
  await loading.then(() => { throw Error('abort accepted'); }, error => assert(error.name === 'AbortError', 'abort interrupts media loading'));

  const hidden = await createExportRenderer(new Scene({layers:[{type:'image',visible:false,src:'missing.png'}]}), {width:160,height:90});
  await hidden.renderFrame(0);
  hidden.dispose();
  console.log('Export renderer cache and timing checks passed');
  process.exit(0);
}

const root = resolve('.');
const script = `
import { Scene } from '/static/js/video/scene.js';
import { renderScene } from '/static/js/video/renderer.js';
import { createExportRenderer } from '/static/js/video/exportRenderer.js';
const assert = (condition, message) => { if (!condition) throw Error(message); };
try {
  const scene = new Scene({canvas:{width:160,height:90,background:'#123456'}, layers:[
    {id:'base',type:'shape',x:0,y:0,width:160,height:90,fill:'#476589'},
    {id:'timed',type:'shape',x:10,y:10,width:45,height:30,fill:'#fff',startTime:1,endTime:2},
    {id:'words',type:'text',x:50,y:20,width:90,height:40,text:'Hello world',fontSize:14,fill:'#fff'},
    {id:'layer_captions',type:'transcription',x:0,y:60,width:100,height:20,fontSize:12,fill:'#fff'}
  ],syncedSegments:[{start:0,end:1,text:'first page',is_paragraph_end:true},{start:1,end:2,text:'second page',is_paragraph_end:true}]});
  const renderer = await createExportRenderer(scene,{width:160,height:90});
  const expected = document.createElement('canvas'); expected.width=160; expected.height=90;
  const context = expected.getContext('2d');
  for (const time of [0, .5, 1, 2, 2.1, .2]) {
    renderScene(context, scene, {currentTime:time});
    await renderer.renderFrame(time);
    const a = context.getImageData(0,0,160,90).data;
    const b = renderer.canvas.getContext('2d').getImageData(0,0,160,90).data;
    let max = 0; for (let i=0;i<a.length;i++) max=Math.max(max,Math.abs(a[i]-b[i]));
    assert(max <= 1, 'pixel difference '+max+' at '+time);
  }
  async function compareScene(testScene, width, height, times, label) {
    const testRenderer = await createExportRenderer(testScene, {width,height});
    const reference = document.createElement('canvas'); reference.width=width; reference.height=height;
    const ref = reference.getContext('2d');
    for (const time of times) {
      ref.setTransform(width / testScene.canvas.width, 0, 0, height / testScene.canvas.height, 0, 0);
      renderScene(ref, testScene, {currentTime:time});
      await testRenderer.renderFrame(time);
      const pixels = ref.getImageData(0,0,width,height).data;
      const exported = testRenderer.canvas.getContext('2d').getImageData(0,0,width,height).data;
      let max = 0; for (let i=0;i<pixels.length;i++) max=Math.max(max,Math.abs(pixels[i]-exported[i]));
      assert(max <= 1, label+' pixel difference '+max+' at '+time);
    }
    testRenderer.dispose();
  }
  const complex = new Scene({canvas:{width:160,height:90,background:'#eee'},layers:[
    {id:'frame',type:'frame',x:15,y:10,width:80,height:50,fill:'#4a7690',cornerRadius:9,clipContent:true,children:['child']},
    {id:'child',type:'shape',x:60,y:20,width:50,height:50,fill:'#e77b31',startTime:0.5,endTime:1},
    {id:'rotated',type:'text',x:70,y:25,width:70,height:35,text:'Rotated',fontSize:17,rotation:23,fill:'#fff',stroke:{width:1,color:'#222'}}
  ]});
  complex.layers[2].fadeIn = 0.5; complex.layers[2].fadeOut = 0.5; complex.layers[2].duration = 2;
  await compareScene(complex, 240, 135, [0,0.5,1,1.1,1.75,2], 'scaled frame and fade');
  for (const style of ['ambient_flow','ambient_ocean','ambient_ribbon','ambient_pulse','ambient_dots','ambient_glow','ambient_shimmer']) {
    const wave = new Scene({canvas:{width:160,height:90,background:'#fff'},layers:[
      {id:'wave',type:'audio_widget',widgetStyle:style,x:10,y:20,width:140,height:50,color:'#335577'},
      {id:'top',type:'shape',x:30,y:35,width:20,height:20,fill:'#ff5500'}
    ]});
    await compareScene(wave, 160, 90, [0,0.5,1.25], style);
    // Later frames repaint only the wave's box, so they prove the box holds the glow too.
    wave.layers[0].glow = 0.8;
    await compareScene(wave, 160, 90, [0,0.5,1.25,0.2], style+' with glow');
    await compareScene(wave, 96, 54, [0,0.5,1.25], style+' with glow, scaled down');
    wave.layers[0].glow = 0;
    const dynamic = await createExportRenderer(wave,{width:160,height:90});
    assert(dynamic.repeatFrames(0,90,30,1) === 1, style+' remains animated');
    dynamic.dispose();
  }
  assert(renderer.stats.cacheHits > 0, 'static runs reused');
  assert(renderer.repeatFrames(0,90,30,1) === 30, 'caption changes at frame 30');
  assert(renderer.repeatFrames(30,90,30,1) === 31, 'inclusive layer end');
  scene.layers[0].fill = '#ff0000';
  await renderer.renderFrame(0);
  assert(renderer.canvas.getContext('2d').getImageData(0,0,1,1).data[0] !== 255, 'snapshot isolated');
  renderer.dispose();
  await fetch('/result',{method:'POST',body:'ok'});
} catch (error) { await fetch('/result',{method:'POST',body:error.stack || String(error)}); }
`;
let finish;
const result = new Promise(resolve => { finish = resolve; });
const server = createServer(async (req, res) => {
  if (req.url === '/result') { let body=''; for await (const chunk of req) body += chunk; res.end('ok'); finish(body); return; }
  if (req.url === '/') { res.setHeader('Content-Type','text/html'); res.end(`<script type="module">${script}</script>`); return; }
  try {
    const path = resolve(root, '.' + req.url);
    if (!path.startsWith(root + '/')) throw Error('bad path');
    const data = await readFile(path); res.setHeader('Content-Type','text/javascript'); res.end(data);
  } catch { res.statusCode=404; res.end(); }
});
await new Promise(resolve => server.listen(0,'127.0.0.1',resolve));
const profile = await mkdtemp(join(tmpdir(),'render-export-firefox-'));
const url = `http://127.0.0.1:${server.address().port}/`;
const playwright = process.env.EXPORT_TEST_BROWSER === 'playwright';
const python = `from playwright.sync_api import sync_playwright
import sys, time
with sync_playwright() as p:
    browser = p.chromium.launch(headless=True)
    page = browser.new_page()
    page.goto(sys.argv[1])
    time.sleep(35)
    browser.close()`;
const browser = playwright
  ? spawn('.venv/bin/python', ['-c', python, url], {stdio:'inherit'})
  : spawn('firefox',['--headless','--no-remote','--profile',profile,url], {stdio:'inherit'});
browser.once('exit', code => finish(`Browser exited before reporting results (exit ${code})`));
const timeout = setTimeout(() => finish('Browser test timed out'),30000);
const outcome = await result;
clearTimeout(timeout); browser.kill(); server.close();
if (browser.exitCode === null) await new Promise(resolve => browser.once('exit',resolve));
await rm(profile,{recursive:true,force:true});
if (outcome !== 'ok') { console.error(outcome); process.exitCode=1; } else console.log('Export renderer pixel and timing checks passed');
