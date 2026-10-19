# Implementation research — 2026-10-19

Research preceded implementation. Sources were checked in the upstream documentation, published npm package and source. No external accuracy/latency figures are adopted as product claims.

## Browser camera lifecycle

[Mozilla's getUserMedia documentation](https://developer.mozilla.org/en-US/docs/Web/API/MediaDevices/getUserMedia) describes permission-gated capture and secure-context requirements. The implementation targets top-level localhost or HTTPS, requests video only after Start, checks API availability and maps permission/device errors to recovery instructions. Permission requests can remain unresolved; cancellation gates all subsequent callbacks and watches for late tracks rather than pretending the prompt can be programmatically dismissed.

[MediaStreamTrack.stop](https://developer.mozilla.org/en-US/docs/Web/API/MediaStreamTrack/stop) documents stopping individual tracks. The app explicitly stops every observed track. This does not revoke browser-managed permission. [Visibility changes](https://developer.mozilla.org/en-US/docs/Web/API/Document/visibilitychange_event) provide a signal to cancel pending interaction when leaving the tab. Blur also pauses; pagehide ends the session.

## Gaze dependency choice and inspected behavior

[Brown's WebGazer project](https://webgazer.cs.brown.edu/) provides gaze estimates from a normal webcam and a calibration-capable regression pipeline. [Upstream API documentation](https://github.com/brownhci/WebGazer/wiki/Top-Level-API) covers start, gaze listeners, regression selection and persistence controls. This is simpler than building an unvalidated pupil-to-screen regression on a general face-landmark library. The exact published npm artifact is `webgazer@3.5.3` and is pinned in the lockfile, including integrity metadata. [Repository source](https://github.com/brownhci/WebGazer) and `node_modules/webgazer/src/{index,params,facemesh,ridgeReg}.mjs` were inspected.

Specific integration decisions from the published source:

- `saveDataAcrossSessions` defaults true. The adapter sets false before `begin()` to prevent loading/saving calibration profiles.
- `begin()` installs mouse click/movement learning listeners. A MutationObserver removes these as soon as dependency DOM appears, before another input event, and the gaze callback/start completion remove them again. Only the nine training points explicitly record eye features. Mouse position never supplies the gaze estimate.
- Before regression is trained, predictions may lack finite x/y while still carrying eye features. Training uses fresh left/right eye-feature availability; validation/activation require finite gaze coordinates as well.
- `end()` pauses and removes dependency DOM, but does not stop capture. The adapter retains track references and calls `stop()` explicitly, including errors, cancelled startup, pagehide and disconnected tracks.
- `clearData()` touches localforage. The app instead uses `setRegression('ridge')` to reset in-memory training without enabling storage.
- Version 3.5.3 ships MediaPipe assets and a local `faceMeshSolutionPath`. The copy script serves them at `/vendor/mediapipe/face_mesh`. No CDN fallback is configured. The prebuilt dependency is copied unchanged.
- The callback does not provide a calibrated tracking confidence or exact per-frame capture timestamp. Availability, freshness gaps, spatial stability and a coarse calibration gate are conservative heuristics. They cannot guarantee that a prediction is correct or measure end-to-end capture latency.

## Parameters are prototype policy, not measured accuracy

Nine points × 12 eye samples train the regression. Five separate points × at least 20 predictions check it, without updating regression. The gate requires every point's median error ≤ `min(100, viewportWidth × .09, viewportHeight × .12)` CSS pixels and its 80th percentile ≤ 1.4 times that limit. These are coarse engineering cutoffs for large targets, not a validated accuracy benchmark. Failure keeps activation disabled. Head movement or layout changes can invalidate results after a pass.

The deterministic interaction engine requires 350 ms of stable selection and 800–3000 ms of dwell; a sample gap over 300 ms or movement over 55 CSS pixels resets it. Only one eligible central tile can be selected. A 1200 ms activation cooldown and a valid neutral-area release prevent automatic repeats. These values are first-release design choices requiring owner evaluation.

## Licensing and dependency advisory

WebGazer 3.5.3 declares GPL-3.0-or-later. Project source is released under GPL-3.0-or-later; dependency source is available from its published npm package and upstream repository. Copied bundles and model assets retain upstream notices; they are generated locally, not committed. MediaPipe assets have their own included package metadata and notices in the upstream distribution.

`npm audit` on 2026-10-19 reports four moderate affected package entries (`webgazer`, `@tensorflow/tfjs`, `argparse`, `sprintf-js`) from [GHSA-hp3w-g68c-fv3c](https://github.com/advisories/GHSA-hp3w-g68c-fv3c), an unbounded precision formatting denial of service. `sprintf-js` latest is 1.1.3, which is affected. npm's suggested WebGazer 2.0.1 downgrade changes the gaze stack and is not applied. No arbitrary formatting input is exposed by this app. A clean audit and non-reachability have **not** been established. Updated Vite/Playwright versions eliminated the initial build-tool advisories.
