import { test } from 'node:test';
import assert from 'node:assert/strict';
import { CameraSession, cameraMessage } from '../src/camera.js';

function fixture(begin = async () => {}) {
  const events = [], failures = [], samples = [];
  let listener, tick, feed, ended;
  const track = { readyState: 'live', stop() { events.push('stop-track'); this.readyState = 'ended'; }, addEventListener(_, fn) { ended = fn; } };
  const wg = {
    params: {}, saveDataAcrossSessions(v) { events.push(`persist:${v}`); return this; },
    showPredictionPoints() { return this; }, showVideoPreview() { return this; },
    setRegression() { events.push('reset-regression'); }, setGazeListener(fn) { listener = fn; },
    removeMouseEventListeners() { events.push('remove-mouse'); }, clearGazeListener() { listener = null; },
    pause() { events.push('pause'); }, end() { events.push('end'); }, recordScreenPosition() { events.push('train'); },
    async begin() { feed = { srcObject: { getTracks: () => [track] } }; await begin(); },
  };
  const camera = new CameraSession({ load: async () => wg, media: { getUserMedia() {} }, video: () => feed,
    onSample: data => samples.push(data), onFailure: m => failures.push(m),
    watch: fn => { tick = fn; return 42; }, unwatch: id => events.push(`unwatch:${id}`) });
  return { camera, events, failures, samples, track, wg, tick: () => tick?.(), emit: p => listener?.(p), end: () => ended?.() };
}
test('startup disables persistence and implicit learning, cleanup stops tracks and resets memory', async () => {
  const f = fixture(); assert.equal(await f.camera.start(), true);
  assert.ok(f.events.includes('persist:false')); assert.ok(f.events.includes('remove-mouse'));
  f.emit({ x: 1, y: 1 }); assert.equal(f.samples.length, 1);
  f.camera.stop(); assert.equal(f.track.readyState, 'ended'); assert.ok(f.events.includes('unwatch:42')); assert.ok(f.events.includes('end'));
  f.emit({ x: 2, y: 2 }); assert.equal(f.samples.length, 1);
});
test('denied permission fails closed with cleanup and actionable message', async () => {
  const f = fixture(async () => { throw Object.assign(new Error(), { name: 'NotAllowedError' }); });
  assert.equal(await f.camera.start(), false); assert.match(f.failures[0], /denied/); assert.equal(f.track.readyState, 'ended');
  assert.equal(f.camera.pending, false);
});
test('late camera grant after cancellation is stopped and never emits gaze', async () => {
  let resolve; const f = fixture(() => new Promise(r => { resolve = r; }));
  const starting = f.camera.start(); await new Promise(r => setImmediate(r));
  f.camera.stop(); f.tick(); f.emit({ x: 4, y: 5 }); resolve();
  assert.equal(await starting, false); assert.equal(f.samples.length, 0); assert.equal(f.track.readyState, 'ended');
});
test('unsupported API, no camera and busy camera errors are explicit', async () => {
  const f = fixture(); f.camera.media = undefined; assert.equal(await f.camera.start(), false);
  assert.match(f.failures[0], /unavailable/);
  assert.match(cameraMessage({ name: 'NotFoundError' }), /No camera/);
  assert.match(cameraMessage({ name: 'NotReadableError' }), /another app/);
});
test('camera track ended shuts down session; repeated stop is safe', async () => {
  const f = fixture(); await f.camera.start(); f.end();
  assert.equal(f.camera.cancelled, true); assert.match(f.failures[0], /disconnected/);
  f.camera.stop(); f.camera.stop();
});
