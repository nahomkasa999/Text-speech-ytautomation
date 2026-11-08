/**
 * Fallback Real-time MediaRecorder Video Exporter (for environments lacking WebCodecs).
 */

import { showToast } from '../../ui/toast.js';

export function runRealtimeExport({
  audioUrl,
  canvasEl,
  audioSpeed,
  audioVolume,
  preservePitch,
  getExportFilename,
  downloadBlob,
  renderVideoFrame,
  updatePlayheadPosition,
  state,
  exportBtnLabel
}) {
  return new Promise((resolve, reject) => {
    exportBtnLabel.textContent = 'Recording (real time)…';
    const stream = canvasEl.captureStream(30);
    const exportAudio = new Audio(audioUrl);
    exportAudio.crossOrigin = 'anonymous';
    exportAudio.playbackRate = audioSpeed;
    exportAudio.preservesPitch = preservePitch;

    const audioCtx = new (window.AudioContext || window.webkitAudioContext)();
    const source = audioCtx.createMediaElementSource(exportAudio);
    const gainNode = audioCtx.createGain();
    gainNode.gain.value = audioVolume;
    const dest = audioCtx.createMediaStreamDestination();
    source.connect(gainNode);
    gainNode.connect(dest);
    gainNode.connect(audioCtx.destination);

    const combinedStream = new MediaStream([
      ...stream.getVideoTracks(),
      ...dest.stream.getAudioTracks()
    ]);

    const mimeType = MediaRecorder.isTypeSupported('video/mp4;codecs=avc1')
      ? 'video/mp4;codecs=avc1'
      : (MediaRecorder.isTypeSupported('video/mp4') ? 'video/mp4' : 'video/webm');

    const recorder = new MediaRecorder(combinedStream, { mimeType, videoBitsPerSecond: 6000000 });
    const chunks = [];
    recorder.ondataavailable = (e) => { if (e.data.size > 0) chunks.push(e.data); };
    recorder.onstop = () => {
      exportAudio.pause();
      audioCtx.close().catch(() => {});
      const ext = mimeType.includes('mp4') ? 'mp4' : 'webm';
      const filename = `${getExportFilename()}.${ext}`;
      downloadBlob(new Blob(chunks, { type: mimeType }), filename);
      showToast('Video rendered. Choose where to save it.', 'success');
      resolve();
    };

    recorder.start();
    exportAudio.play().then(() => {
      state.video.isPlaying = true;
      const exportSyncLoop = () => {
        if (!state.video.isExporting) return;
        const cur = exportAudio.currentTime;
        const dur = exportAudio.duration || 1;
        renderVideoFrame(cur);
        updatePlayheadPosition(cur, dur);
        if (cur < dur) requestAnimationFrame(exportSyncLoop);
      };
      requestAnimationFrame(exportSyncLoop);
    }).catch(reject);

    exportAudio.onended = () => recorder.stop();
  });
}
