"""Exercise real encoding, audio tempo/pitch, destination safety, and cancellation."""
import array
import json
import math
from pathlib import Path
import shutil
import subprocess
import threading
import time
import wave

import pytest

from src.services import native_export as native


@pytest.fixture
def manager(tmp_path, monkeypatch):
    executable = native.validate_ffmpeg()
    monkeypatch.setattr(native, 'AUDIO_DIR', str(tmp_path))
    monkeypatch.setattr(native, 'validate_ffmpeg', lambda: executable)
    samples = array.array('h', (int(10000 * math.sin(2 * math.pi * 440 * i / 48000)) for i in range(96000)))
    with wave.open(str(tmp_path / 'narration.wav'), 'wb') as audio:
        audio.setparams((1, 2, 48000, 0, 'NONE', 'not compressed'))
        audio.writeframes(samples.tobytes())
    instance = native.ExportManager(lease_seconds=10, journal_dir=tmp_path / 'journal')
    yield instance
    instance.shutdown()


def settings(**extra):
    return dict(audio_url='/audio/narration.wav', width=64, height=48, fps=10, **extra)


def encode(manager, tmp_path, **extra):
    info = manager.prepare(tmp_path / ('video.' + extra.get('format', 'mp4')), settings(**extra))
    manager.start(info['id'])
    manager.frame(info['id'], 0, info['total_frames'], bytes([50, 100, 150, 255]) * (64 * 48))
    result = manager.finish(info['id'])
    assert result['stage'] == 'completed'
    return info, Path(result['path'])


def decoded_audio(path):
    result = subprocess.run([native.validate_ffmpeg(), '-v', 'error', '-i', str(path), '-vn', '-ac', '1', '-ar', '48000',
                             '-f', 's16le', '-'], capture_output=True, check=True)
    pcm = array.array('h')
    pcm.frombytes(result.stdout)
    return pcm


@pytest.mark.parametrize('format', ['mp4', 'webm'])
def test_real_video_and_audio(manager, tmp_path, format):
    info, path = encode(manager, tmp_path, format=format)
    assert info['total_frames'] == 20
    # Decode the actual result. This catches invalid final containers and streams.
    result = subprocess.run([native.validate_ffmpeg(), '-v', 'error', '-i', str(path), '-map', '0:v', '-f', 'rawvideo',
                             '-pix_fmt', 'rgba', '-'], capture_output=True, check=True)
    assert len(result.stdout) == 20 * 64 * 48 * 4
    assert abs(len(decoded_audio(path)) / 48000 - 2) < .05
    assert not list(tmp_path.glob('*.partial'))


@pytest.mark.parametrize('preserve_pitch,frequency', [(True, 440), (False, 880)])
def test_speed_volume_and_pitch(manager, tmp_path, preserve_pitch, frequency):
    info, path = encode(manager, tmp_path, speed=2, volume=.5, preserve_pitch=preserve_pitch)
    assert info['total_frames'] == 10
    pcm = decoded_audio(path)
    assert abs(len(pcm) / 48000 - 1) < .05
    center = pcm[4800:38400]
    crossings = sum(a <= 0 < b for a, b in zip(center, center[1:]))
    measured = crossings * 48000 / len(center)
    assert abs(measured - frequency) < 10
    rms = math.sqrt(sum(x * x for x in center) / len(center))
    assert 3000 < rms < 4000


def test_looping_music_is_unsped(manager, tmp_path):
    music_path = tmp_path / 'music.wav'
    samples = array.array('h', (int(3000 * math.sin(2 * math.pi * 220 * i / 48000)) for i in range(12000)))
    with wave.open(str(music_path), 'wb') as audio:
        audio.setparams((1, 2, 48000, 0, 'NONE', 'not compressed'))
        audio.writeframes(samples.tobytes())
    info = manager.prepare(tmp_path / 'music.mp4', settings(speed=2, volume=0, music_volume=1))
    manager.upload_music(info['id'], 0, music_path.read_bytes())
    manager.start(info['id'])
    manager.frame(info['id'], 0, 10, bytes(64 * 48 * 4))
    path = manager.finish(info['id'])['path']
    pcm = decoded_audio(path)[4800:43200]
    crossings = sum(a <= 0 < b for a, b in zip(pcm, pcm[1:]))
    assert abs(crossings * 48000 / len(pcm) - 220) < 10
    assert max(pcm[-4800:]) > 1000


def test_partial_frames_keep_the_rest_of_the_picture(manager, tmp_path):
    info = manager.prepare(tmp_path / 'boxes.mp4', settings())
    token = info['id']
    manager.start(token)
    with pytest.raises(ValueError, match='whole picture'):
        manager.frame(token, 0, 1, bytes(16 * 16 * 4), (0, 0, 16, 16))
    manager.frame(token, 0, 10, bytes([200, 30, 30, 255]) * (64 * 48))
    with pytest.raises(ValueError, match='outside the picture'):
        manager.frame(token, 10, 10, bytes(16 * 16 * 4), (56, 0, 16, 16))
    with pytest.raises(ValueError, match='byte length'):
        manager.frame(token, 10, 10, bytes(15 * 16 * 4), (32, 16, 16, 16))
    manager.frame(token, 10, 10, bytes([30, 30, 200, 255]) * (16 * 16), (32, 16, 16, 16))
    path = manager.finish(token)['path']
    decoded = subprocess.run([native.validate_ffmpeg(), '-v', 'error', '-i', path, '-map', '0:v', '-f', 'rawvideo',
                              '-pix_fmt', 'rgb24', '-'], capture_output=True, check=True).stdout

    def pixel(frame, x, y):
        start = (frame * 48 * 64 + y * 64 + x) * 3
        return decoded[start:start + 3]

    def close(actual, expected):
        return all(abs(a - e) < 30 for a, e in zip(actual, expected))

    assert close(pixel(5, 40, 24), (200, 30, 30))
    assert close(pixel(15, 40, 24), (30, 30, 200))
    assert close(pixel(15, 8, 8), (200, 30, 30))
    assert close(pixel(15, 56, 40), (200, 30, 30))


def test_reject_order_and_cancel_preserves_destination(manager, tmp_path):
    target = tmp_path / 'existing.mp4'
    target.write_bytes(b'original')
    info = manager.prepare(target, settings())
    token = info['id']
    manager.start(token)
    with pytest.raises(ValueError, match='out of order'):
        manager.frame(token, 1, 1, bytes(64 * 48 * 4))
    with pytest.raises(ValueError, match='All video frames'):
        manager.finish(token)
    manager.cancel(token)
    assert manager.get(token).stage == 'cancelled'
    assert manager.get(token).process.poll() is not None
    assert target.read_bytes() == b'original'
    assert not manager.get(token).partial.exists()
    assert manager.cancel(token)['stage'] == 'cancelled'


def test_cancel_unblocks_backpressured_writer(manager, tmp_path):
    info = manager.prepare(tmp_path / 'cancel.mp4', settings())
    token = info['id']
    manager.start(token)
    job = manager.get(token)
    # A stopped process cannot consume its pipe. The cancellation must kill it
    # without waiting for the writer's operation lock.
    if not hasattr(__import__('signal'), 'SIGSTOP'):
        pytest.skip('SIGSTOP is unavailable on Windows')
    import os
    import signal
    os.kill(job.process.pid, signal.SIGSTOP)
    failures = []
    def send():
        try:
            manager.frame(token, 0, 20, bytes(64 * 48 * 4))
        except ValueError as exc:
            failures.append(str(exc))
    writer = threading.Thread(target=send)
    writer.start()
    time.sleep(.1)
    manager.cancel(token)
    writer.join(timeout=5)
    assert not writer.is_alive()
    assert failures
    assert not job.partial.exists()


@pytest.mark.parametrize('extra', [{'fps': float('nan')}, {'width': 1919}, {'speed': 0}, {'volume': -1},
                                 {'audio_url': '/audio/../outside.wav'}])
def test_invalid_settings(manager, tmp_path, extra):
    values = settings()
    values.update(extra)
    with pytest.raises(ValueError):
        manager.prepare(tmp_path / 'bad.mp4', values)


def test_low_disk_space(manager, tmp_path, monkeypatch):
    monkeypatch.setattr(native.shutil, 'disk_usage', lambda _: type('Usage', (), {'free': 1})())
    with pytest.raises(ValueError, match='Not enough space'):
        manager.prepare(tmp_path / 'full.mp4', settings())


def test_disk_fills_during_export(manager, tmp_path, monkeypatch):
    target = tmp_path / 'original.mp4'
    target.write_bytes(b'keep me')
    info = manager.prepare(target, settings())
    manager.start(info['id'])
    monkeypatch.setattr(native.shutil, 'disk_usage', lambda _: type('Usage', (), {'free': 1})())
    with pytest.raises(ValueError, match='nearly full'):
        manager.frame(info['id'], 0, 1, bytes(64 * 48 * 4))
    assert manager.get(info['id']).stage == 'failed'
    assert target.read_bytes() == b'keep me'
    assert not manager.get(info['id']).partial.exists()


def test_retained_statuses_are_bounded(manager, tmp_path):
    for number in range(12):
        info = manager.prepare(tmp_path / f'{number}.mp4', settings())
        manager.cancel(info['id'])
    assert len(manager.jobs) == 8
    assert all(job.stage == 'cancelled' for job in manager.jobs.values())


def test_wrong_sized_frame_and_duplicate(manager, tmp_path):
    info = manager.prepare(tmp_path / 'frames.mp4', settings())
    token = info['id']
    manager.start(token)
    with pytest.raises(ValueError, match='byte length'):
        manager.frame(token, 0, 1, bytes(5))
    manager.frame(token, 0, 1, bytes(64 * 48 * 4))
    with pytest.raises(ValueError, match='out of order'):
        manager.frame(token, 0, 1, bytes(64 * 48 * 4))


def test_recovery_removes_only_unclaimed_scratch(tmp_path):
    journal = tmp_path / 'journal'
    journal.mkdir()
    target = tmp_path / 'saved.mp4'
    target.write_bytes(b'finished video')
    dead_token, alive_token = 'a' * 32, 'b' * 32
    for token in (dead_token, alive_token):
        (journal / f'{token}.json').write_text(json.dumps({'target': str(target)}))
        for suffix in ('partial', 'music'):
            (tmp_path / f'.saved.mp4.{token}.{suffix}').write_bytes(b'scratch')
    with (journal / f'{alive_token}.json').open('r+b') as owner:
        assert native._lock(owner)
        manager = native.ExportManager(journal_dir=journal)
        try:
            assert target.read_bytes() == b'finished video'
            assert not (tmp_path / f'.saved.mp4.{dead_token}.partial').exists()
            assert not (tmp_path / f'.saved.mp4.{dead_token}.music').exists()
            assert not (journal / f'{dead_token}.json').exists()
            assert (tmp_path / f'.saved.mp4.{alive_token}.partial').exists()
            assert (journal / f'{alive_token}.json').exists()
        finally:
            manager.shutdown()


def test_second_manager_keeps_running_export(manager, tmp_path):
    info = manager.prepare(tmp_path / 'live.mp4', settings())
    manager.start(info['id'])
    manager.frame(info['id'], 0, 10, bytes(64 * 48 * 4))
    in_progress = sorted(tmp_path.rglob('*'))
    native.ExportManager(journal_dir=manager.journal_dir).shutdown()
    assert sorted(tmp_path.rglob('*')) == in_progress
    manager.frame(info['id'], 10, 10, bytes(64 * 48 * 4))
    assert Path(manager.finish(info['id'])['path']).stat().st_size
    assert not list(manager.journal_dir.iterdir())


def test_stereo_music_averages_into_mono_narration(manager, tmp_path):
    path = tmp_path / 'stereo.wav'
    samples = array.array('h')
    for i in range(12000):
        sample = int(12000 * math.sin(2 * math.pi * 220 * i / 48000))
        samples.extend((sample, -sample))
    with wave.open(str(path), 'wb') as audio:
        audio.setparams((2, 2, 48000, 0, 'NONE', 'not compressed'))
        audio.writeframes(samples.tobytes())
    info = manager.prepare(tmp_path / 'mono.mp4', settings(volume=0, music_volume=1))
    manager.upload_music(info['id'], 0, path.read_bytes())
    manager.start(info['id'])
    manager.frame(info['id'], 0, 20, bytes(64 * 48 * 4))
    output = manager.finish(info['id'])['path']
    pcm = decoded_audio(output)
    assert max(abs(x) for x in pcm) < 10
    _, _, channels = native._probe(native.validate_ffmpeg(), output)
    assert channels == 1


def test_save_dialog_precedes_encoder_preparation(monkeypatch, tmp_path):
    from src.desktop_api import DesktopApi
    events = []
    api = DesktopApi()
    monkeypatch.setattr(api, '_ask_save_path', lambda name: events.append('dialog') or str(tmp_path / name))
    monkeypatch.setattr(native.export_manager, 'prepare', lambda target, values: events.append('prepare') or {'ok': True})
    assert api.prepare_video_export(settings()) == {'ok': True}
    assert events == ['dialog', 'prepare']
    events.clear()
    monkeypatch.setattr(api, '_ask_save_path', lambda name: events.append('cancel') or None)
    assert api.prepare_video_export(settings()) == {'ok': False, 'cancelled': True}
    assert events == ['cancel']


# Encoded mode: the editor sends WebCodecs chunks and FFmpeg only muxes them.
# The bundled FFmpeg stands in for the browser encoder here.

def encoded_frames(format, frames=20, width=64, height=48, fps=10):
    """Return [(keyframe, bytes)] as a WebCodecs encoder would emit them, one entry per frame."""
    source = ['-f', 'lavfi', '-i', f'testsrc=size={width}x{height}:rate={fps}', '-frames:v', str(frames), '-pix_fmt', 'yuv420p']
    if format == 'mp4':
        # Annex B with in-band SPS/PPS, like `avc: {format: 'annexb'}`. AUD NALs mark frame boundaries.
        stream = subprocess.run([native.validate_ffmpeg(), '-v', 'error', *source, '-c:v', 'libx264', '-bf', '0',
                                 '-g', str(fps * 2), '-x264-params', 'aud=1', '-f', 'h264', '-'],
                                capture_output=True, check=True).stdout
        marker = b'\x00\x00\x00\x01\x09'
        units = [marker + unit for unit in stream.split(marker)[1:]]
        return [(any((unit[i + 3] & 0x1f) == 5 for i in range(len(unit) - 3) if unit[i:i + 3] == b'\x00\x00\x01'), unit)
                for unit in units]
    stream = subprocess.run([native.validate_ffmpeg(), '-v', 'error', *source, '-c:v', 'libvpx-vp9', '-g', str(fps * 2),
                             '-lag-in-frames', '0', '-f', 'ivf', '-'], capture_output=True, check=True).stdout
    result, pos = [], 32
    while pos < len(stream):
        size = int.from_bytes(stream[pos:pos + 4], 'little')
        payload = stream[pos + 12:pos + 12 + size]
        # Profile 0 uncompressed header: frame_type bit 2 is 0 on keyframes.
        result.append((not payload[0] & 0x04, payload))
        pos += 12 + size
    return result


def batch(frames):
    return b''.join(len(data).to_bytes(4, 'little') + bytes([int(key)]) + data for key, data in frames)


def probe(path, *entries):
    return json.loads(subprocess.check_output(['ffprobe', '-v', 'error', '-count_frames', *entries, '-of', 'json', str(path)]))


@pytest.mark.parametrize('format', ['mp4', 'webm'])
def test_encoded_video_is_copied_with_exact_timestamps(manager, tmp_path, format):
    frames = encoded_frames(format)
    assert len(frames) == 20 and frames[0][0]
    info = manager.prepare(tmp_path / f'encoded.{format}', settings(format=format, video_encoding='webcodecs'))
    assert info['video_encoding'] == 'webcodecs'
    assert info['video_codec'] == ('h264' if format == 'mp4' else 'vp9')
    assert info['keyframe_interval'] == 20 and info['video_bitrate'] > 0
    token = info['id']
    assert manager.start(token)['video_encoding'] == 'webcodecs'
    assert manager.chunks(token, 0, 7, batch(frames[:7]))['frames'] == 7
    status = manager.chunks(token, 7, 13, batch(frames[7:]))
    assert status['frames'] == 20 and status['progress'] == 1
    path = Path(manager.finish(token)['path'])
    metadata = probe(path, '-show_entries', 'stream=codec_type,codec_name,start_time,duration,nb_read_frames,r_frame_rate')
    video = next(s for s in metadata['streams'] if s['codec_type'] == 'video')
    audio = next(s for s in metadata['streams'] if s['codec_type'] == 'audio')
    assert video['codec_name'] == ('h264' if format == 'mp4' else 'vp9')
    assert int(video['nb_read_frames']) == 20
    assert float(video['start_time']) == 0
    assert abs(float(audio['start_time'])) < .01
    packets = json.loads(subprocess.check_output(['ffprobe', '-v', 'error', '-select_streams', 'v', '-show_entries',
                                                  'packet=pts_time,duration_time', '-of', 'json', str(path)]))['packets']
    # Constant frame rate: frame n is shown at n / fps for exactly 1 / fps.
    assert [round(float(p['pts_time']), 6) for p in packets] == [i / 10 for i in range(20)]
    assert all(abs(float(p['duration_time']) - .1) < 1e-6 for p in packets)
    if format == 'mp4':
        assert abs(float(video['duration']) - 2) < 1e-6
    # Decoding as constant frame rate must not duplicate or drop frames either.
    decoded = subprocess.run([native.validate_ffmpeg(), '-v', 'error', '-i', str(path), '-map', '0:v', '-f', 'rawvideo',
                              '-pix_fmt', 'rgba', '-'], capture_output=True, check=True).stdout
    assert len(decoded) == 20 * 64 * 48 * 4
    assert abs(len(decoded_audio(path)) / 48000 - 2) < .05
    assert not list(tmp_path.glob('.*.partial'))
    assert not list(manager.journal_dir.iterdir())


def test_encoded_chunks_are_validated_and_cancel_cleans_up(manager, tmp_path):
    frames = encoded_frames('mp4')
    target = tmp_path / 'existing.mp4'
    target.write_bytes(b'original')
    info = manager.prepare(target, settings(video_encoding='webcodecs'))
    token = info['id']
    with pytest.raises(ValueError, match='out of order'):
        manager.chunks(token, 0, 1, batch(frames[:1]))
    manager.start(token)
    with pytest.raises(ValueError, match='not raw frames'):
        manager.frame(token, 0, 1, bytes(64 * 48 * 4))
    with pytest.raises(ValueError, match='out of order'):
        manager.chunks(token, 1, 1, batch(frames[1:2]))
    with pytest.raises(ValueError, match='keyframe'):
        manager.chunks(token, 0, 1, batch([(False, frames[0][1])]))
    with pytest.raises(ValueError, match='truncated'):
        manager.chunks(token, 0, 2, batch(frames[:1]))
    with pytest.raises(ValueError, match='trailing'):
        manager.chunks(token, 0, 1, batch(frames[:2]))
    with pytest.raises(ValueError, match='malformed'):
        manager.chunks(token, 0, 1, bytes(5))
    with pytest.raises(ValueError, match='chunk count'):
        manager.chunks(token, 0, 21, batch(frames + frames[:1]))
    # Rejected batches write nothing, so the stream continues where it was.
    manager.chunks(token, 0, 5, batch(frames[:5]))
    with pytest.raises(ValueError, match='out of order'):
        manager.chunks(token, 4, 1, batch(frames[4:5]))
    with pytest.raises(ValueError, match='All video frames'):
        manager.finish(token)
    job = manager.get(token)
    assert job.frames == 5 and job.stage == 'encoding'
    manager.cancel(token)
    assert job.stage == 'cancelled' and job.process.poll() is not None
    assert target.read_bytes() == b'original'
    assert not job.partial.exists()
    assert not list(manager.journal_dir.iterdir())


def test_encoded_export_fails_cleanly_when_ffmpeg_dies(manager, tmp_path):
    frames = encoded_frames('webm')
    info = manager.prepare(tmp_path / 'dies.webm', settings(format='webm', video_encoding='webcodecs'))
    token = info['id']
    manager.start(token)
    manager.chunks(token, 0, 3, batch(frames[:3]))
    job = manager.get(token)
    job.process.kill()
    job.process.wait()
    with pytest.raises(ValueError):
        for index in range(3, 20):
            manager.chunks(token, index, 1, batch(frames[index:index + 1]))
    assert job.stage == 'failed'
    assert not job.partial.exists()


def test_encoder_failure_before_start_falls_back_to_raw(manager, tmp_path):
    info = manager.prepare(tmp_path / 'fallback.mp4', settings(video_encoding='webcodecs'))
    with pytest.raises(ValueError, match='Invalid video encoding'):
        manager.start(info['id'], 'vp9')
    assert manager.start(info['id'], 'raw')['video_encoding'] == 'raw'
    with pytest.raises(ValueError, match='not encoded chunks'):
        manager.chunks(info['id'], 0, 1, batch(encoded_frames('mp4')[:1]))
    manager.frame(info['id'], 0, 20, bytes([50, 100, 150, 255]) * (64 * 48))
    path = manager.finish(info['id'])['path']
    assert probe(path, '-show_entries', 'stream=nb_read_frames', '-select_streams', 'v')['streams'][0]['nb_read_frames'] == '20'
    raw = manager.prepare(tmp_path / 'raw.mp4', settings())
    assert raw['video_encoding'] == 'raw'
    with pytest.raises(ValueError, match='Invalid video encoding'):
        manager.start(raw['id'], 'webcodecs')
    manager.cancel(raw['id'])
    with pytest.raises(ValueError, match='video encoding'):
        manager.prepare(tmp_path / 'bad.mp4', settings(video_encoding='gpu'))
