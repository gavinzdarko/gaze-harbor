# Verification evidence

## Physical camera and gaze workflow

**Not performed. Zero physical participants, zero physical gaze samples, zero physical activations.** No suitable-device/explicit camera-testing permission was established. No personal images were acquired, recorded or committed. Manual mouse/keyboard checks and synthetic fixtures must not be interpreted as successful eye tracking.

Real-world calibration quality, completion rate, highlight correctness, intentional dwell success, false activations, face-loss behavior with a person, camera indicator shutdown, hardware compatibility, latency and accessibility usability remain unmeasured. There is no validated small-target accuracy or medical-grade capability.

## Automated evidence

- 15 Node deterministic tests pass locally. They exercise selection cores/ambiguity, time gates, stable jitter, target changes, invalid signals, stale/backwards timestamps, cancel, state transitions, cooldown/release, setting changes, calibration/poor calibration, camera permission failures, late completion and cleanup.
- The successful calibration unit fixture uses **108 synthetic training samples** and **100 synthetic validation predictions**. These are not camera samples. Dwell fixtures inject monotonic 100 ms steps and deliberate discontinuities; counts and assertions are in `tests/engine.test.js`.
- Production build passes locally. All 19 MB of model/bundle assets are copied from the installed dependency; no generated personal data is part of the build.
- Local Playwright launch is blocked by the managed macOS sandbox: Chromium's MachPortRendezvous bootstrap receives Permission denied. No browser-test success is inferred from this failed attempt. GitHub CI runs the same browser suite on Ubuntu. Final CI links/results are recorded below after execution.
- Browser fixtures explicitly identify synthetic signals. The main success fixture completes nine training points (108 recorded samples), five untrained check points, stable target highlighting, Escape cancellation, dwell activation, cooldown, pause/resume interlock, recalibration and track cleanup.
- Additional browser checks cover no dependency/camera activity on initial load, manual actions, denied permission, visibility reset, layout invalidation, mobile overflow and keyboard operation. A real WebGazer bundle is tested with mocked permission denial. A real local model processes **synthetic blank video**, verifying asset loading/face absence without physical tracking.

## Owner-run checks requiring a suitable camera and explicit permission

1. Choose the browser/device/window size; record versions, lighting and whether glasses are used if desired. Record counts only, not images or traces. Start with camera permission blocked: verify the denial message. Grant permission only when ready to test.
2. Complete the nine training points (12 fresh eye samples each) and five check points (20 predictions each). Record pass/fail, retries and point-level failure; do not translate a pass into an accuracy claim. Check a deliberately poor calibration keeps activation disabled.
3. Enable gaze, look into a neutral area, then hold each tile. Record intentional attempts, correct activations, missed attempts and wrong activations separately. Check visible selection and countdown before each action. Move rapidly between tiles and along boundaries; confirm no immediate activation.
4. Begin a countdown and look away, cover/move out of camera view, press Escape, pause, switch tabs/windows and begin recalibration. Confirm each clears pending activation. After Resume or return, confirm a new neutral-area release is required.
5. Hold a tile after activation: verify no repeat. Look away, wait out cooldown, and select again. Change dwell/sensitivity: verify pending dwell resets. Scroll/resize: verify recalibration is required.
6. Unplug/disable the camera or revoke permission: verify the session ends. End session during normal capture and during a pending permission prompt: verify eventual camera tracks stop. Check the browser/physical camera indicator goes off (another application may independently hold the device).
7. Check keyboard setup/cancellation, focus visibility, reduced motion and screen-reader announcements. Assistive-technology testing and accessibility-user research are still owner-run work; no universal usability claim is made.
8. Inspect network requests after Start: only localhost bundle/model requests should appear. Confirm no new gaze/profile records in IndexedDB/localStorage. Normal asset caching and browser permissions are separate.

## CI and manual UI results

Pending final execution. See the public repository's Actions runs; only successful completed runs count as passed evidence.
