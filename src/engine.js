// All times are monotonic milliseconds. No timers can activate a target.
export const finitePoint = p => !!p && Number.isFinite(p.x) && Number.isFinite(p.y);

export function selectTarget(point, targets, sensitivity = 0.72) {
  if (!finitePoint(point)) return null;
  const eligible = targets.filter(t => {
    const insetX = t.width * (1 - sensitivity) / 2;
    const insetY = t.height * (1 - sensitivity) / 2;
    return !t.disabled && point.x > t.x + insetX && point.x < t.x + t.width - insetX &&
      point.y > t.y + insetY && point.y < t.y + t.height - insetY;
  });
  // Ambiguous/overlapping cores never select a target.
  return eligible.length === 1 ? eligible[0].id : null;
}

export class DwellEngine {
  constructor({ dwellMs = 1500, sensitivity = 0.72 } = {}) {
    this.dwellMs = dwellMs;
    this.sensitivity = sensitivity;
    this.state = 'idle';
    this.cooldownUntil = 0;
    this.blocked = false;
    this.clear();
  }
  clear() { this.target = null; this.anchor = null; this.started = null; this.last = null; }
  transition(state) { this.state = state; this.clear(); this.blocked = true; }
  configure(dwellMs, sensitivity) {
    this.dwellMs = Math.max(800, Math.min(3000, dwellMs));
    this.sensitivity = Math.max(0.5, Math.min(0.9, sensitivity));
    this.cancel(0);
  }
  cancel(now) { this.clear(); this.blocked = true; this.cooldownUntil = now + 800; }
  sample(point, now, targets) {
    const empty = { target: null, progress: 0, phase: this.state, activated: null };
    if (this.state !== 'active') { this.clear(); return empty; }
    const target = selectTarget(point, targets, this.sensitivity);
    if (!target) {
      this.clear();
      // A valid look into a neutral area releases the interlock; lost tracking does not.
      if (finitePoint(point)) this.blocked = false;
      return { ...empty, phase: finitePoint(point) ? 'look-at-target' : 'tracking-lost' };
    }
    if (now < this.cooldownUntil || this.blocked) {
      this.clear();
      return { ...empty, phase: now < this.cooldownUntil ? 'cooldown' : 'look-away' };
    }
    const gap = this.last === null ? 0 : now - this.last;
    if (target !== this.target || gap > 300 || gap < 0 ||
      !this.anchor || Math.hypot(point.x - this.anchor.x, point.y - this.anchor.y) > 55) {
      this.target = target; this.anchor = { ...point }; this.started = now;
    }
    this.last = now;
    const elapsed = now - this.started;
    const progress = Math.max(0, Math.min(1, (elapsed - 350) / this.dwellMs));
    if (progress >= 1) {
      this.clear(); this.blocked = true; this.cooldownUntil = now + 1200;
      return { ...empty, phase: 'activated', activated: target };
    }
    return { ...empty, target, progress, phase: elapsed < 350 ? 'settling' : 'confirming' };
  }
  stale(now) {
    if (this.last !== null && now - this.last > 300) this.clear();
  }
}

export class Calibration {
  constructor() { this.reset(); }
  reset() { this.state = 'training'; this.point = 0; this.count = 0; this.last = -Infinity; this.errors = []; this.reports = []; this.first = null; }
  train(now, hasEyes) {
    if (this.state !== 'training' || !hasEyes || now - this.last < 80) return false;
    this.last = now; this.count++;
    if (this.count === 12) { this.point++; this.count = 0; this.last = -Infinity; }
    if (this.point === 9) { this.state = 'validation'; this.point = 0; }
    return true;
  }
  validate(point, expected, now, limit) {
    if (this.state !== 'validation' || !finitePoint(point) || now - this.last < 80) return false;
    this.last = now; this.first ??= now;
    this.errors.push(Math.hypot(point.x - expected.x, point.y - expected.y));
    if (this.errors.length < 20 || now - this.first < 1500) return false;
    const sorted = [...this.errors].sort((a, b) => a - b);
    const report = { samples: this.errors.length, median: sorted[Math.floor(sorted.length / 2)], p80: sorted[Math.floor(sorted.length * 0.8)] };
    this.reports.push(report);
    this.errors = []; this.first = null; this.last = -Infinity; this.point++;
    if (report.median > limit || report.p80 > limit * 1.4) this.state = 'poor';
    else if (this.point === 5) this.state = 'ready';
    return true;
  }
}
