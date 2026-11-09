#!/usr/bin/env python3
"""Measure the native CPU pipeline with real output and bounded synthetic input."""
import argparse
import json
import math
import os
from pathlib import Path
import platform
import statistics
import subprocess
import sys
import tempfile
import threading
import time
import wave

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT))

import psutil
from src.services import native_export


def make_audio(path, seconds):
    with wave.open(str(path), 'wb') as output:
        output.setnchannels(1)
        output.setsampwidth(2)
        output.setframerate(16000)
        samples = bytes(32000)
        whole = int(seconds)
        for _ in range(whole):
            output.writeframesraw(samples)
        output.writeframesraw(bytes(round((seconds - whole) * 16000) * 2))


def inspect(path):
    command = ['ffprobe', '-v', 'error', '-count_packets', '-show_streams', '-show_format', '-of', 'json', str(path)]
    metadata = json.loads(subprocess.check_output(command))
    video = next(s for s in metadata['streams'] if s['codec_type'] == 'video')
    audio = next(s for s in metadata['streams'] if s['codec_type'] == 'audio')
    duration = float(metadata['format'].get('duration') or video.get('duration') or 0)
    if not duration:
        packets = subprocess.check_output(['ffprobe', '-v', 'error', '-select_streams', 'v:0',
                    '-show_entries', 'packet=pts_time,duration_time', '-of', 'csv=p=0', str(path)], text=True)
        duration = max(float(row.split(',')[0]) + float(row.split(',')[1])
                       for row in packets.splitlines() if row and 'N/A' not in row)
    return dict(duration=duration, video_packets=int(video['nb_read_packets']), video_codec=video['codec_name'], audio_codec=audio['codec_name'],
                video_start=float(video.get('start_time', 0)), audio_start=float(audio.get('start_time', 0)))


def run_case(directory, seconds, width, height, mode, repeat, iteration, container):
    target = directory / f'{mode}-{iteration}.{container}'
    manager = native_export.ExportManager()
    proc = psutil.Process()
    stop = threading.Event()
    peak = dict(rss=0)
    cpu_by_pid = {}
    start_cpu = proc.cpu_times()
    samples = []
    def sample():
        while not stop.wait(.05):
            rss = 0
            cpu = 0
            for item in [proc] + proc.children(recursive=True):
                try:
                    rss += item.memory_info().rss
                    times = item.cpu_times()
                    cpu += times.user + times.system
                    cpu_by_pid[item.pid] = max(cpu_by_pid.get(item.pid, 0), times.user + times.system)
                except psutil.Error:
                    pass
            peak['rss'] = max(peak['rss'], rss)
            samples.append([round(time.perf_counter() - started, 3), rss])
    started = time.perf_counter()
    sampler = threading.Thread(target=sample, daemon=True)
    sampler.start()
    try:
        prepared = manager.prepare(target, dict(audio_url='/audio/fixture.wav', width=width, height=height,
                        fps=30, speed=1, volume=1, preserve_pitch=True, format=container))
        manager.start(prepared['id'])
        pixels = bytearray(bytes([38, 78, 116, 255]) * (width * height))
        index = 0
        requests = 0
        while index < prepared['total_frames']:
            count = min(repeat if mode == 'static' else 1, prepared['total_frames'] - index)
            if mode == 'changing':
                pixels[0:4] = bytes([index % 256, 78, 116, 255])
            manager.frame(prepared['id'], index, count, pixels)
            index += count
            requests += 1
        result = manager.finish(prepared['id'])
        elapsed = time.perf_counter() - started
        stop.set()
        sampler.join()
        data = inspect(target)
        assert abs(data['duration'] - seconds) < .12, data
        assert abs(data['video_start'] - data['audio_start']) <= 1/30 + .001, data
        assert data['video_packets'] == index, data
        decoded = subprocess.run([native_export.validate_ffmpeg(), '-v', 'error', '-i', str(target),
                    '-map', '0:v:0', '-frames:v', '1', '-f', 'rawvideo', '-pix_fmt', 'rgb24', 'pipe:1'],
                    stdout=subprocess.PIPE, stderr=subprocess.PIPE, check=True).stdout
        assert len(decoded) == width * height * 3
        assert abs(decoded[3] - 38) < 12 and abs(decoded[4] - 78) < 12 and abs(decoded[5] - 116) < 12
        return dict(mode=mode, seconds=seconds, width=width, height=height, fps=30, frames=index,
                    frame_requests=requests, elapsed_seconds=elapsed, speed=seconds/elapsed,
                    peak_process_tree_rss_bytes=peak['rss'],
                    sampled_cpu_seconds=max(0, sum(cpu_by_pid.values())-start_cpu.user-start_cpu.system),
                    sampled_encoder_cpu_seconds=sum(value for pid,value in cpu_by_pid.items() if pid != proc.pid), bytes=target.stat().st_size,
                    metadata=data, rss_samples=samples, errors=0, path=str(target), status=result['stage'])
    finally:
        stop.set()
        sampler.join()
        manager.shutdown()


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--seconds', type=float, default=20)
    parser.add_argument('--width', type=int, default=1280)
    parser.add_argument('--height', type=int, default=720)
    parser.add_argument('--runs', type=int, default=5)
    parser.add_argument('--format', choices=['mp4', 'webm'], default='mp4')
    parser.add_argument('--mode', choices=['static', 'changing', 'both'], default='both')
    parser.add_argument('--output', type=Path, default=Path(tempfile.gettempdir()) / 'book-narrator-cpu-benchmark')
    args = parser.parse_args()
    args.output.mkdir(parents=True, exist_ok=True)
    report = dict(platform=platform.platform(), processor=platform.processor(), logical_cpus=os.cpu_count(),
                  load_average=os.getloadavg() if hasattr(os, 'getloadavg') else None,
                  ffmpeg=subprocess.check_output([native_export.validate_ffmpeg(), '-version'], text=True).splitlines()[0],
                  scope='Native writer + software encoder + streaming audio. Excludes Canvas, WebView and HTTP transport.',
                  runs=[])
    try:
        with tempfile.TemporaryDirectory(prefix='cpu-export-audio-') as scratch:
            source = Path(scratch) / 'fixture.wav'
            make_audio(source, args.seconds)
            native_export.AUDIO_DIR = scratch
            modes = ['changing', 'static'] if args.mode == 'both' else [args.mode]
            for iteration in range(args.runs):
                for mode in modes:
                    result = run_case(args.output, args.seconds, args.width, args.height, mode, 300, iteration, args.format)
                    report['runs'].append(result)
                    print(json.dumps({k:v for k,v in result.items() if k != 'rss_samples'}), flush=True)
    except Exception as error:
        report['failure'] = str(error)
        (args.output / 'results.json').write_text(json.dumps(report, indent=2))
        raise
    report['summary'] = {}
    for mode in modes:
        rows = [r for r in report['runs'] if r['mode'] == mode]
        times = [r['elapsed_seconds'] for r in rows]
        report['summary'][mode] = dict(runs=len(rows), median_seconds=statistics.median(times),
                                      min_seconds=min(times), max_seconds=max(times),
                                      peak_rss_bytes=max(r['peak_process_tree_rss_bytes'] for r in rows))
    (args.output / 'results.json').write_text(json.dumps(report, indent=2))
    print(json.dumps(report['summary'], indent=2))


if __name__ == '__main__':
    main()
