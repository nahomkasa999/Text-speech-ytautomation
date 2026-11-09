# CPU export handoff

Work branch: fix/cpu-native-export. Base: ec7f123 on fix/long-video-export. Do not merge main or publish releases. User requested this branch be pushed for safekeeping.

Implemented native FFmpeg CPU export with streaming narration processing, speed/pitch/volume and looping BGM; bounded RGBA uploads; destination-first desktop dialog; sibling partial output and atomic replacement; cancellation, disk checks, lease cleanup and crash recovery journal. Added frozen scene renderer with 64 MiB bitmap cache, text layout memoization, static frame repetition, lazy media loading and awaited video seeks. Added progress UI. Desktop uses native export; browser legacy export is restricted to short MP4 and never silently records in real time.

Packaging pins imageio-ffmpeg 0.6.0, includes native binary/licenses in PyInstaller, validates CPU codecs. Added nonpublishing CPU export CI workflow. Windows build/run is NOT verified locally. Corresponding-source distribution obligations remain a prerequisite before releasing the GPL FFmpeg binary, as licenses/FFMPEG-NOTICE.txt explains.

Verification: 22 native/runtime integration tests passed repeatedly. Mock renderer tests pass. A real two-hour 160x90 static export produced216000 frames, duration7200.021354s, audio/video start0, elapsed77.55s and sampled peak process-tree RSS108351488 bytes. This low-resolution synthetic test excludes browser work and is not a Windows or1080p speed claim. Results at /tmp/book-narrator-cpu-two-hours/results.json. Several720p measurements exist under /tmp/book-narrator-cpu-* but should not be presented as final benchmarks. A later benchmark failed when a sibling partial vanished; investigate journal recovery or reaper concurrency before relying on that harness.

Open browser check: tests/test_export_browser.py sees61 decoded frames for a nominal60-frame MP4 although ffprobe -count_frames reports60. Current production command includes -frames:v total_frames, -bf0 and fragmented MP4 skip_trailer. The raw decode command lacks -fps_mode passthrough; investigate FFmpeg output CFR duplication caused by AAC padding before assuming encoder added a frame. Last artifact /tmp/pytest-of-nahomkasa/pytest-11/test_browser_native_export0/test.mp4. Do not remove the check without proving actual timestamps and decoded pixels. Browser pipeline pixel assertions and cancellation checks have not yet completed because frame-count assertion stops the test.

Commands:

```
.venv/bin/python -m pytest tests/test_native_export.py tests/test_ffmpeg_runtime.py -q
node tests/render-export.mjs --mock
PLAYWRIGHT_BROWSERS_PATH=/tmp/book-narrator-browsers .venv/bin/python -m pytest tests/test_export_browser.py -q
EXPORT_TEST_BROWSER=playwright PLAYWRIGHT_BROWSERS_PATH=/tmp/book-narrator-browsers node tests/render-export.mjs
.venv/bin/python scripts/benchmark_cpu_export.py --seconds 20 --width 1280 --height 720 --runs 5
```

Correct benchmark CLI spelling uses spaces, e.g. --seconds 20 --width 1280 --height 720 --runs 5. Browser binaries installed in /tmp/book-narrator-browsers. Test dependencies in requirements-test.txt. Main code paths: src/services/native_export.py, src/routes/native_export.py, src/desktop_api.py, static/js/video/{nativeExporter,exportRenderer}.js and static/js/modules/studio/exporter/exportManager.js. Audit artifacts under .audit need final verification updates. Existing outputs/settings.json belongs to user and must not be committed. No installer build or release has been published.

## Latest verified correction

The browser frame mismatch was test-side CFR duplication. Adding -fps_mode passthrough to the raw decode command yielded the actual60 frames. The complete browser native-export test now passes, including static captions, animated MP4/WebM, pixel comparisons, progress values and cancellation. Command: PLAYWRIGHT_BROWSERS_PATH=/tmp/book-narrator-browsers .venv/bin/python -m pytest tests/test_export_browser.py -q. Result:1 passed in8.70s. This supersedes the open frame-count concern above. Remaining work is renderer parity matrix, benchmark scratch-file race, final reproducible benchmark/report, and Windows validation.

Renderer pixel/timing matrix also passed with Chromium using EXPORT_TEST_BROWSER=playwright PLAYWRIGHT_BROWSERS_PATH=/tmp/book-narrator-browsers node tests/render-export.mjs. Includes seven wave styles, rotated/stroked text, clipping, fades and scaled output. First git push failed because github.com could not resolve; local commits are safe. Retry git push -u origin fix/cpu-native-export when network DNS works.

## Benchmark partial race: resolved (d071a2b)

Root cause: crash recovery treated "owner PID not visible" as "owner dead". Importing `src.services.native_export` builds the module-level `ExportManager`, which runs `_recover()` on the shared journal. A process that could not see the exporter's PID, for example one in another PID namespace, deleted the live `.partial`, and `finish()` failed with `No such file or directory`. Reproduced by importing the module with `os.kill` patched to report other PIDs as gone while a benchmark ran.

Fix: each job holds an exclusive lock on its journal record (`fcntl.flock` on POSIX, `msvcrt.locking` on Windows) for its lifetime. Recovery removes a record's scratch files only if it can take that lock. `_process_alive` is gone. The benchmark now uses `<output>/jobs` as its journal and records the commit and arguments. The same repro now completes with exit 0. `test_second_manager_keeps_running_export` fails if a job releases its claim early (mutation checked). The Windows lock path is unverified until the CPU export workflow runs on windows-latest, which needs a PR because `workflow_dispatch` only works once the workflow is on the default branch.

## Final benchmark attempt at d071a2b: correctness reproducible, speed inconclusive

Command: `.venv/bin/python scripts/benchmark_cpu_export.py --seconds 60 --width 1280 --height 720 --runs 5`. All 10 runs (5 changing, 5 static, alternating) passed the harness checks: 1800 frames, duration 60.021 s, audio and video start aligned, decoded pixel colour correct, peak process-tree RSS 225 to 236 MiB. Wall time rose steadily from 10.7 s to 29.1 s across the run while encoder CPU stayed at about 41 to 61 CPU-seconds per export and the share of the machine the export got fell from about 4.5 to 2.2 cores. An unrelated CPU-heavy job (another project's worker plus FFmpeg bursts) was running and load rose to 18 on 8 threads, so this run measured contention, not the exporter. The limiter is software x264 encoding on CPU. Rerun on an idle machine before quoting a speed. Do not quote the medians from this run.
