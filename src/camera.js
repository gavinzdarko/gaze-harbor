export function cameraMessage(error) {
  return ({ NotAllowedError: 'Camera permission was denied. Allow it in your browser site settings, then start again.',
    NotFoundError: 'No camera was found. Connect a webcam, then start again.',
    NotReadableError: 'Camera is unavailable or in use by another app. Close that app and try again.',
    OverconstrainedError: 'This camera cannot meet the requested settings. Try another webcam.',
    UnsupportedError: 'Camera APIs are unavailable. Open localhost in a current desktop browser.'
  })[error?.name] || 'Camera or local gaze model could not start. Stop, reload, and try again. See README troubleshooting.';
}

// Dependency injection allows camera lifecycle verification without using a camera.
export class CameraSession {
  constructor({ load, media, video, onSample, onFailure, watch = (fn) => setInterval(fn, 40), unwatch = clearInterval }) {
    Object.assign(this, { load, media, video, onSample, onFailure, watch, unwatch });
    this.cancelled = true; this.pending = false; this.tracks = new Set();
  }
  capture() {
    const stream = this.video()?.srcObject;
    for (const track of stream?.getTracks() || []) {
      if (!this.tracks.has(track)) {
        this.tracks.add(track);
        track.addEventListener?.('ended', () => {
          if (!this.cancelled) { this.stop(); this.onFailure('Camera disconnected or permission was revoked. Start a new session.'); }
        }, { once: true });
      }
      if (this.cancelled) track.stop();
    }
    // begin() installs implicit mouse learning. Remove it as soon as the video exists.
    this.wg?.removeMouseEventListeners();
  }
  async start() {
    if (this.pending || !this.cancelled) return false;
    if (!this.media?.getUserMedia) { this.onFailure(cameraMessage({ name: 'UnsupportedError' })); return false; }
    this.cancelled = false; this.pending = true;
    try {
      this.wg = await this.load();
      if (this.cancelled) return false;
      const wg = this.wg;
      wg.saveDataAcrossSessions(false).showPredictionPoints(false).showVideoPreview(false);
      wg.params.faceMeshSolutionPath = '/vendor/mediapipe/face_mesh';
      wg.params.camConstraints = { audio: false, video: { facingMode: 'user', width: { ideal: 640 }, height: { ideal: 480 } } };
      // Reset memory only. clearData() also touches localforage; we never enable storage.
      wg.setRegression('ridge');
      wg.setGazeListener((data) => {
        this.capture();
        if (!this.cancelled) this.onSample(data);
      });
      this.watcher = this.watch(() => this.capture());
      await wg.begin();
      this.capture();
      if (this.cancelled) { this.dispose(); return false; }
      wg.removeMouseEventListeners();
      return true;
    } catch (error) {
      const wasCancelled = this.cancelled;
      this.stop();
      if (!wasCancelled) this.onFailure(cameraMessage(error));
      return false;
    } finally {
      this.pending = false;
      if (this.cancelled) this.dispose();
    }
  }
  resetCalibration() { this.wg?.setRegression('ridge'); }
  train(x, y) { if (!this.cancelled) this.wg.recordScreenPosition(x, y, 'click'); }
  dispose() {
    this.capture();
    this.wg?.clearGazeListener();
    this.wg?.removeMouseEventListeners();
    this.wg?.pause();
    // WebGazer end() removes elements but deliberately leaves the camera running.
    for (const track of this.tracks) track.stop();
    if (!this.pending) {
      if (this.watcher !== undefined) this.unwatch(this.watcher);
      this.watcher = undefined;
      try { this.wg?.end(); } catch { /* begin may have failed before DOM creation */ }
      this.wg?.setRegression('ridge');
      this.tracks.clear();
    }
  }
  stop() { this.cancelled = true; this.dispose(); }
}
