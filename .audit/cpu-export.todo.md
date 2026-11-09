- [x] Read the Principles section of poteto-mode.
- [x] Phase A: Frame.
- [ ] Phase B: Design the workflow.
- [ ] Phase C: Run the loop.
- [ ] Build a reproducible native export verification harness.
- [ ] Implement a bounded FFmpeg job with selected-drive staging and cancellation.
- [ ] Integrate browser rendering, static caches, sparse redraw and progress.
- [ ] Bundle and validate FFmpeg for installed Windows builds.
- [ ] Test real output duration, sync, audio effects, pixels, resource usage and cancellation.
- [ ] Independent review and corrections.
- [ ] Phase D: Keep the audit trail.
- [ ] Phase E: Verify and hand back.

Done means actual MP4 and WebM files pass duration/audio/pixel checks, bounded transport rejects oversized work, cancellation removes staging and stops FFmpeg, static scenes avoid redraw, output is selected first, and packaging includes the CPU encoders. Windows installer execution needs a Windows runner and is reported separately.

Throughput checkpoint: three seams (native jobs, canvas/client, packaging), then one integration/benchmark/review gate. No GPU encoders. Preserve canvas renderer rather than rewrite text and waves. Export job owns destination, stage, process, counters and cleanup. At most one active job; one bounded acknowledged frame request at a time. No real-time fallback.
