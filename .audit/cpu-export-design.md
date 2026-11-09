# CPU export design

The user needs multi-hour Windows exports without GPU hardware, full-audio RAM allocations, or a second completed video copy.

Two designs were inspected independently. A full FFmpeg scene graph would replace browser font layout, caption pagination, wave equations, and canvas composition. It offers less browser work but risks visual regressions. The selected design retains Canvas and streams bounded RGBA states into a CPU FFmpeg process. It also repeats unchanged states in the native writer. Full native scene rendering is rejected for this change.

The data shape is an export job. It owns one user-selected destination, a sibling partial file, an optional compressed music scratch file, native process, input counters, status, and cleanup. It never accepts an output path through HTTP. A native Save As dialog creates the job token first. One acknowledged upload is in flight. One job can run. The browser scene is frozen for export. Caches have a fixed byte budget and retain only the current caption layout or bitmap. Source time remains frameIndex / fps * narrationSpeed.

The browser exports images, text, captions, video, shapes, transitions, and waves with the shared renderer. Native FFmpeg streams narration decoding, tempo or resampling, volume, music looping and mixing, CPU H.264/AAC or VP9/Opus encoding. Output uses bounded muxing metadata. Finalization atomically replaces the target on its own filesystem. Existing destination content survives failures and cancellation.

Verification runs in three units. Native job tests inspect real output streams, duration, frequency and cancellation. Canvas tests compare uncached and cached pixels and caption boundaries. A reproducible benchmark reports actual CPU output, elapsed time, size, frame count and sampled process-tree RSS. Linux results are not Windows benchmarks; the Windows installer must be exercised on Windows before distribution.

Rubric for review is bounded working memory, visual/audio behavior, deterministic cancellation and file ownership, measured throughput, and installed-runtime completeness. The two design explorations converged on Canvas plus native FFmpeg. Static-state repetition and painter-order caches are incorporated. No claim of CapCut-level performance or Windows throughput follows from a Linux run.
