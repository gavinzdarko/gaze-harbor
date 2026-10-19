# Gaze Harbor

A small **experimental assistive interaction prototype**: select large tiles with webcam gaze estimates, then deliberately confirm with a visible dwell countdown. Four harmless actions change only this local page. No arbitrary website, desktop, account, form, purchase or navigation control.

**Physical eye tracking has not been tested.** Passing synthetic tests is evidence about the interaction logic, not proof of usable gaze accuracy. No medical, universal accessibility, small-target accuracy, latency or performance claims are made.

## Run locally

Use Node **22.12+** and npm, then:

```sh
git clone https://github.com/gavinzdarko/gaze-harbor.git
cd gaze-harbor
npm ci
npm run dev
```

Open **http://localhost:5173** in a current desktop Chrome or Edge. Keep the terminal running. If npm cannot write your default cache, use `npm ci --cache /tmp/gaze-harbor-npm-cache` instead. For a production build: `npm run build && npm run preview`, then open the localhost URL printed by Vite. No API key, account or paid service is needed.

A desktop/laptop webcam, browser camera permission, WebAssembly and a working browser graphics stack are required. Start with even front lighting, visible eyes, a comfortable steady head position and a large window. Glasses, glare, lighting, eyelid position and head movement may affect estimates. Chrome/Edge are the initial implementation target; Firefox, Safari, mobile cameras and specialized hardware are **unverified**. Mobile layout supports manual setup/actions, not a validated gaze experience. Keep the tiles fully visible: gaze eligibility requires at least 190 × 200 CSS pixels and the entire tile inside the viewport. The page compacts during camera sessions. Choose window size and scroll position before calibration; moving the layout requires recalibration.

## Try a session

1. Choose **Start camera**, then grant camera permission. The page never requests a camera on load. Only video is requested, not audio. Local model initialization may take a moment; a 45-second startup timeout ends an incomplete session. If a permission prompt is still open, dismiss it. A late grant is cleaned up, and another start stays disabled while initialization settles; reload if it cannot settle.
2. Follow the **nine numbered training points**. Look directly at each point, press **Space** or click it, then keep looking while 12 fresh eye-feature samples collect (at least 80 ms apart, after a 650 ms settling delay). Keyboard/mouse setup is required. Eye movement does not collect calibration points by itself.
3. Follow the **five separate check points** the same way. These are not training samples. Each requires at least 20 gaze predictions spanning 1.5 seconds. Every point must pass a coarse error gate. A failed check disables gaze activation; improve your position/lighting and choose **Recalibrate**. No bypass is offered.
4. Choose **Enable gaze activation**. Look into a neutral area, such as the instruction strip. Then look into the center of a tile. Its outline and text indicate selection. After 350 ms of stability, the ring counts down the chosen dwell duration. Holding through the countdown activates the tile once.
5. Look away into a neutral area before another action. Each activation has a **1.2-second cooldown**. Keeping your gaze on a tile never repeats it automatically.
6. **End session & turn camera off** explicitly stops all observed camera tracks, removes dependency UI and clears the regression calibration. Starting again requires new calibration.

A finite eye-feature/gaze result is only an availability signal: WebGazer does not expose a calibrated confidence score here. Its output is an estimate, not a click. Frames are not checked for liveness or identity. A coarse check cannot establish future accuracy or suitability for a particular person.

## Controls and actions

- **Escape / Cancel:** clears pending confirmation, requires a new neutral-area release and adds an 800 ms cancellation cooldown. During calibration, Escape cancels calibration and disables activation. During startup, Escape cancels startup.
- **Pause / Resume:** clears pending dwell. Resume is explicit and requires looking at a neutral area again. **Pause leaves the camera and local inference running.** Use End session to stop the camera.
- **Recalibrate:** immediately disables activation and replaces the prior calibration in memory. An incomplete or cancelled calibration cannot activate anything.
- **Dwell confirmation:** 0.8–3.0 seconds, plus the 350 ms stability period. Changing it resets pending confirmation.
- **Sensitivity:** changes the eligible central area from 50% to 90% of a tile's width/height. The nearest eligible center is used only when there is exactly one eligible tile. Edges, gaps, overlapping cores and partially visible/small tiles are ineligible. It is not an accuracy setting.
- All controls and demo tiles support mouse and keyboard, visible focus and reduced-motion preferences. Manual activations are labeled **mouse** or **keyboard**; gaze activations are labeled **gaze**. The counter distinguishes them. There is **no mouse-to-gaze fallback**.
- Tiles add a garden flower, change the local page tone, show a reminder, or increment a practice counter. Effects last only until page reload.

Tab/window focus loss pauses activation, and returning does not resume it. Changing viewport size or scrolling invalidates calibration. Losing eye features, invalid/out-of-viewport coordinates, a gap above 300 ms, or a movement above 55 CSS pixels from the stability anchor resets pending dwell. Timer/watchdog callbacks can reset progress but cannot activate a tile. Activation requires a new gaze sample. Reading the instructions and neutral areas cannot activate a tile. Reading a tile while activation is enabled can eventually dwell-activate it; pause when reading freely.

## Camera, privacy and dependencies

Camera frames, eye features and regression calibration are processed **in the browser's memory**. Application code does not upload or persist camera images, gaze traces or biometric profiles. No analytics, external fonts, backend or remote inference is used. WebGazer persistence is disabled **before** `begin()`, and its automatic mouse learning is removed; only the visible training flow calls `recordScreenPosition`. The app never calls its storage-writing/clearing API. Ending a session resets regression data; closing/reloading the page releases the remaining dependency buffers. Browser camera permission and normal static-asset caching are browser-managed, separate from biometric data.

`npm ci` downloads pinned packages from the npm registry. Its postinstall script copies WebGazer's prebuilt bundle and MediaPipe model/WASM assets into ignored `public/vendor/` (about 19 MB). After Start, those files load **from localhost**, separately from camera processing. There is no runtime CDN/model API request and no per-frame API cost. The build contains the same assets. A content policy restricts connections and images to the local origin (plus localhost development WebSocket); local WASM requires dynamic-code support. Browser extensions are outside the app's privacy boundary.

Pinned dependencies: **WebGazer 3.5.3**, **Vite 8.3.4**, **Playwright 1.64.1**, with a committed npm lockfile. WebGazer includes TensorFlow/MediaPipe and localforage. This project uses GPL-3.0-or-later in accordance with the chosen gaze dependency; see [LICENSE](LICENSE) and [dependency notes](docs/RESEARCH.md).

**Known audit limitation:** npm reports four moderate package entries caused by one `sprintf-js` denial-of-service advisory in WebGazer's TensorFlow dependency chain. The available npm fix downgrades WebGazer to 2.0.1; it is not a compatible upgrade. The registry has no newer `sprintf-js` release as of the research date. The demo does not accept formatting strings, but this is not a clean dependency audit or a guarantee of non-reachability. The bundled upstream build is unchanged. See [research](docs/RESEARCH.md).

## Verification

```sh
npm test
npm run build
npx playwright install chromium
npm run test:browser
# or, after installing Chromium:
npm run check
```

The browser suite includes explicitly **synthetic** gaze/eye-feature fixtures, a real-bundle mocked permission denial, and a real local model with a **synthetic blank video stream**. None uses a physical camera. There is no simulated user mode presented as eye tracking. See [verification evidence and owner-run checklist](docs/VERIFICATION.md), [implementation review](docs/REVIEW.md) and [GitHub CI](https://github.com/gavinzdarko/gaze-harbor/actions).

If permission is denied, allow camera access in the browser's site settings and Start again. If no camera is found, connect one; if it is busy, close the other app. If the camera disconnects or permission is revoked, the session ends. If models fail to load, run `npm ci`, confirm `public/vendor/` exists, and reload localhost. If estimates remain poor, stop: there is no supported accuracy override. No actual camera/gaze workflow is claimed as verified until the owner runs the physical checks with explicit permission.

## Project map

- `src/`: deterministic selection/dwell/calibration engine, camera lifecycle adapter, page UI and styling.
- `tests/`: synthetic unit tests and browser integration checks; no personal imagery.
- `scripts/`: copies dependency assets locally after installation and before builds.
- `docs/`: official-source research, verification boundaries and final review.
- `.github/workflows/`: automated build, unit and synthetic browser checks.
- `public/vendor/` and `dist/`: generated, ignored dependencies and production build; recreated locally.
