import { test } from 'node:test';
import assert from 'node:assert/strict';
import { Calibration, DwellEngine, selectTarget } from '../src/engine.js';

const targets = [{ id: 'a', x: 0, y: 0, width: 300, height: 240 }, { id: 'b', x: 340, y: 0, width: 300, height: 240 }];
const center = { x: 150, y: 120 }, neutral = { x: 320, y: 120 };
function active() { const e = new DwellEngine(); e.transition('active'); e.sample(neutral, 0, targets); return e; }
function hold(e, start = 100, end = 2200, p = center) {
  const results = [];
  for (let t = start; t <= end; t += 100) results.push(e.sample(p, t, targets));
  return results;
}
test('selection rejects edges, gaps, invalid coordinates, disabled and ambiguous targets', () => {
  assert.equal(selectTarget(center, targets), 'a');
  for (const p of [null, { x: NaN, y: 2 }, { x: 5, y: 120 }, neutral, { x: 299, y: 120 }]) assert.equal(selectTarget(p, targets), null);
  assert.equal(selectTarget(center, [{ ...targets[0], disabled: true }]), null);
  assert.equal(selectTarget(center, [targets[0], { ...targets[0], id: 'overlap' }]), null);
  assert.equal(selectTarget({ x: 40, y: 120 }, targets, .9), 'a');
  assert.equal(selectTarget({ x: 40, y: 120 }, targets, .5), null);
});
test('requires explicit active state, neutral release, stability period and full dwell', () => {
  const e = new DwellEngine();
  assert.ok(hold(e).every(x => !x.activated));
  e.transition('active'); assert.ok(hold(e).every(x => !x.activated));
  e.sample(neutral, 2300, targets);
  const views = hold(e, 2400, 4300);
  assert.ok(views.slice(0, -1).every(x => !x.activated));
  assert.equal(views.at(-1).activated, 'a');
});
test('one gaze sample never activates and a stalled stream clears pending progress', () => {
  const e = active(); e.sample(center, 100, targets); e.stale(10000);
  assert.equal(e.target, null);
  assert.equal(e.sample(center, 10001, targets).progress, 0);
});
test('modest jitter permits confirmation but large movement and target changes reset', () => {
  const e = active(); const views = [];
  for (let t = 100; t <= 2100; t += 100) views.push(e.sample({ x: 150 + (t % 200 ? 8 : -8), y: 120 }, t, targets));
  assert.equal(views.filter(x => x.activated).length, 1);
  const f = active(); hold(f, 100, 1200);
  assert.equal(f.sample({ x: 220, y: 120 }, 1300, targets).progress, 0);
  assert.equal(f.sample({ x: 490, y: 120 }, 1400, targets).progress, 0);
  assert.equal(f.sample(center, 1500, targets).progress, 0);
});
test('looking away, tracking loss, long or backwards gaps clear dwell', () => {
  for (const interruption of [null, neutral]) {
    const e = active(); hold(e, 100, 1200); e.sample(interruption, 1300, targets);
    assert.equal(e.sample(center, 1400, targets).progress, 0);
  }
  for (const time of [2000, 200]) {
    const e = active(); hold(e, 100, 1200);
    assert.equal(e.sample(center, time, targets).progress, 0);
  }
});
test('cancel, pause, hidden tab and recalibration cannot preserve pending activation', () => {
  for (const state of ['paused', 'calibrating', 'uncalibrated', 'idle']) {
    const e = active(); hold(e, 100, 1200); e.transition(state);
    assert.ok(hold(e, 1300, 3400).every(x => !x.activated));
    e.transition('active'); assert.ok(hold(e, 3500, 5600).every(x => !x.activated));
  }
  const e = active(); hold(e, 100, 1200); e.cancel(1250);
  assert.ok(hold(e, 1300, 4000).every(x => !x.activated));
});
test('cooldown plus valid look-away required, null tracking cannot rearm', () => {
  const e = active(); assert.equal(hold(e).filter(x => x.activated).length, 1);
  e.sample(null, 2300, targets);
  assert.ok(hold(e, 2400, 5000).every(x => !x.activated));
  e.sample(neutral, 5100, targets);
  assert.equal(hold(e, 5200, 7300).filter(x => x.activated).length, 1);
});
test('settings reset pending dwell and clamp unsafe values', () => {
  const e = active(); hold(e, 100, 1200); e.configure(10, 3);
  assert.equal(e.dwellMs, 800); assert.equal(e.sensitivity, .9);
  assert.equal(e.target, null); assert.equal(e.blocked, true);
});
test('calibration requires nine sampled points and five independent validation points', () => {
  const c = new Calibration(); let t = 0;
  assert.equal(c.train(t, false), false); assert.equal(c.count, 0);
  for (let point = 0; point < 9; point++) for (let i = 0; i < 12; i++) { t += 100; c.train(t, true); }
  assert.equal(c.state, 'validation'); assert.equal(c.reports.length, 0);
  for (let point = 0; point < 5; point++) for (let i = 0; i < 20; i++) { t += 100; c.validate(center, center, t, 100); }
  assert.equal(c.state, 'ready'); assert.equal(c.reports.length, 5);
  assert.equal(c.reports.reduce((n, r) => n + r.samples, 0), 100);
  c.reset(); assert.equal(c.state, 'training'); assert.equal(c.reports.length, 0);
});
test('poor calibration fails closed and duplicate timestamps cannot inflate samples', () => {
  const c = new Calibration(); let t = 0;
  c.train(0, true); for (let i = 0; i < 50; i++) c.train(0, true); assert.equal(c.count, 1);
  while (c.state === 'training') { t += 100; c.train(t, true); }
  for (let i = 0; i < 20; i++) { t += 100; c.validate({ x: 900, y: 900 }, center, t, 100); }
  assert.equal(c.state, 'poor');
});
