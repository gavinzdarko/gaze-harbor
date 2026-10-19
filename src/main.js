import { Calibration, DwellEngine, finitePoint } from './engine.js';
import { CameraSession } from './camera.js';

const $ = id => document.getElementById(id);
const engine = new DwellEngine({ sensitivity: 0.7 });
let calibration, collecting = false, collectAfter = 0, lastSample = -Infinity;
let flowers = 0, moments = 0, actions = 0, starting = false, bootTimer;
let sessionLive = false;
const trainingPoints = [[.12,.15],[.5,.15],[.88,.15],[.12,.5],[.5,.5],[.88,.5],[.12,.85],[.5,.85],[.88,.85]];
const validationPoints = [[.25,.25],[.75,.25],[.5,.5],[.25,.75],[.75,.75]];
const targetButtons = [...document.querySelectorAll('[data-target]')];

function status(title, message) {
  if ($('instruction').textContent !== title) $('instruction').textContent = title;
  if ($('status').textContent !== message) $('status').textContent = message;
}
function calibrationVisible(visible) {
  $('calibration').hidden = !visible;
  document.querySelector('main').inert = visible;
  document.querySelector('.topbar').inert = visible;
}
function clearHighlight() {
  for (const el of targetButtons) { el.classList.remove('selected'); el.querySelector('.target-state').textContent = 'LOOK & HOLD'; }
  $('ring').style.setProperty('--progress', '0%'); $('ring').setAttribute('aria-valuenow', '0'); $('ring-symbol').textContent = '·';
}
function setState(state) {
  engine.transition(state); clearHighlight();
  $('session-badge').textContent = state.toUpperCase();
  $('pause').textContent = state === 'paused' ? 'Resume' : 'Pause';
  $('pause').disabled = !['active', 'paused'].includes(state);
  $('recalibrate').disabled = !sessionLive;
  $('stop').disabled = !sessionLive && !starting;
  $('arm').hidden = state !== 'ready';
}
function bounds() {
  // Only fully visible, large first-release targets can be gaze eligible.
  return targetButtons.map(el => {
    const r = el.getBoundingClientRect();
    return { id: el.id, x: r.x, y: r.y, width: r.width, height: r.height,
      disabled: r.width < 190 || r.height < 200 || r.top < 0 || r.bottom > innerHeight || r.left < 0 || r.right > innerWidth };
  });
}
function activate(id, source) {
  actions++;
  if (id === 'bloom') { flowers = flowers % 12 + 1; $('result').textContent = `${'✳ '.repeat(flowers)} Your garden is growing.`; }
  if (id === 'light') { document.body.classList.toggle('warm'); $('result').textContent = document.body.classList.contains('warm') ? 'A little warmer. A little softer.' : 'Back to the fresh morning light.'; }
  if (id === 'note') {
    const notes = ['One small moment is enough.', 'There is no hurry. Take your time.', 'A pause is progress, too.'];
    $('result').textContent = notes[(actions - 1) % notes.length];
  }
  if (id === 'count') { moments++; $('result').textContent = `${moments} ${moments === 1 ? 'moment' : 'moments'} of practice. One at a time.`; }
  $('action-count').textContent = `${actions} ${actions === 1 ? 'action' : 'actions'} · ${source}`;
}

let loadPromise;
function loadWebgazer() {
  if (window.webgazer) return Promise.resolve(window.webgazer);
  return loadPromise ??= new Promise((resolve, reject) => {
    const script = document.createElement('script'); script.src = '/vendor/webgazer.js';
    script.onload = () => resolve(window.webgazer);
    script.onerror = () => { loadPromise = null; script.remove(); reject(new Error('Local dependency unavailable')); };
    document.head.append(script);
  });
}
const camera = new CameraSession({
  load: loadWebgazer, media: navigator.mediaDevices,
  video: () => $('webgazerVideoFeed'),
  onSample: receive,
  onFailure: message => endSession(message),
  watch: fn => {
    // init() installs mouse listeners in the same task as inserting its video.
    // MutationObserver removes them before the next user input event.
    const observer = new MutationObserver(fn); observer.observe(document.body, { childList: true, subtree: true });
    const interval = setInterval(fn, 40);
    return { observer, interval };
  },
  unwatch: ({ observer, interval }) => { observer.disconnect(); clearInterval(interval); },
});

function pointPosition() {
  const points = calibration.state === 'training' ? trainingPoints : validationPoints;
  const p = points[calibration.point];
  return p ? { x: p[0] * innerWidth, y: p[1] * innerHeight } : null;
}
function showPoint() {
  collecting = false;
  const training = calibration.state === 'training';
  const p = pointPosition(); if (!p) return;
  $('cal-phase').textContent = training ? 'CALIBRATION · 9 POINTS' : 'CHECK · 5 UNTRAINED POINTS';
  $('cal-title').textContent = training ? 'Look at the numbered point' : 'Let’s check the estimate';
  $('cal-help').textContent = 'Keep your head still. Press Space or click the point, then keep looking as samples collect. No gaze activation is possible here.';
  $('cal-count').textContent = `Point ${calibration.point + 1} of ${training ? 9 : 5}. Ready when you are.`;
  $('cal-point').textContent = `${calibration.point + 1}`;
  $('cal-point').style.left = `${p.x}px`; $('cal-point').style.top = `${p.y}px`;
  $('cal-point').classList.remove('collecting'); $('cal-point').disabled = false;
  // Keep the instructional panel away from the center calibration point.
  document.querySelector('.calibration-instructions').style.top = p.y / innerHeight === .5 ? '76%' : '50%';
  $('cal-point').focus({ preventScroll: true });
}
function recalibrate() {
  if (!sessionLive) return;
  camera.resetCalibration(); calibration = new Calibration();
  setState('calibrating'); calibrationVisible(true); showPoint();
}
function finishCalibration() {
  collecting = false; calibrationVisible(false);
  if (calibration.state === 'ready') {
    setState('ready'); status('Calibration check passed', 'Enable gaze activation when ready. Then look at a neutral area before selecting a tile.');
    $('arm').focus();
  } else {
    setState('poor'); status('The estimate needs another try', 'The coarse calibration check failed. Improve lighting, keep your head steady, then choose Recalibrate. Activation is disabled.');
    $('recalibrate').focus();
  }
}
function collect() {
  if (collecting || engine.state !== 'calibrating') return;
  collecting = true; collectAfter = performance.now() + 650;
  $('cal-point').classList.add('collecting'); $('cal-point').disabled = true;
  $('cal-count').textContent = 'Keep looking here. Waiting for fresh eye samples…';
}
function calibrationSample(data, now, eyes) {
  if (!collecting || now < collectAfter) return;
  if (!eyes || now - lastSample > 300) {
    // Never accumulate a point over a tracking interruption.
    calibration.count = 0; calibration.errors = []; calibration.first = null;
    $('cal-count').textContent = 'Eyes not reliably available. Face the camera, keep looking here, or cancel.';
    return;
  }
  const before = `${calibration.state}:${calibration.point}`;
  const p = pointPosition();
  if (calibration.state === 'training') {
    if (calibration.train(now, eyes)) camera.train(p.x, p.y);
    $('cal-count').textContent = `Collecting eye samples: ${calibration.count} / 12`;
  } else {
    calibration.validate(data, p, now, Math.min(100, innerWidth * .09, innerHeight * .12));
    $('cal-count').textContent = `Checking gaze: ${calibration.errors.length} / 20 samples`;
  }
  if (['ready', 'poor'].includes(calibration.state)) finishCalibration();
  else if (before !== `${calibration.state}:${calibration.point}`) showPoint();
}
function receive(data) {
  const now = performance.now();
  if (!sessionLive || document.hidden) return;
  const track = [...camera.tracks][0];
  const eyes = !!data?.eyeFeatures?.left && !!data?.eyeFeatures?.right && track?.readyState === 'live' && !track.muted;
  if (engine.state === 'calibrating') calibrationSample(data, now, eyes);
  const usable = eyes && finitePoint(data);
  $('tracking').innerHTML = `<span></span> ${eyes ? 'Eye features available' : 'Tracking unavailable'}`;
  const sample = usable && data.x >= 0 && data.y >= 0 && data.x <= innerWidth && data.y <= innerHeight ? data : null;
  const view = engine.sample(sample, now, bounds());
  if (engine.state === 'active') renderDwell(view);
  lastSample = eyes ? now : -Infinity;
}
function renderDwell(view) {
  clearHighlight();
  if (view.target) {
    const el = $(view.target); el.classList.add('selected');
    el.querySelector('.target-state').textContent = view.phase === 'settling' ? 'HOLD STEADY' : 'CONFIRMING…';
    const percent = Math.round(view.progress * 100);
    $('ring').style.setProperty('--progress', `${percent}%`); $('ring').setAttribute('aria-valuenow', `${percent}`);
    $('ring-symbol').textContent = view.phase === 'settling' ? '…' : `${((1 - view.progress) * engine.dwellMs / 1000).toFixed(1)}`;
  }
  const messages = {
    settling: ['Target selected · hold steady', 'Confirmation begins after a short stability check. Escape cancels.'],
    confirming: ['Keep looking to confirm', 'Let the ring fill deliberately. Look away or press Escape to cancel.'],
    'tracking-lost': ['Tracking is unavailable', 'Pending activation reset. Face the camera in even light.'],
    'look-at-target': ['Ready for your next moment', 'Look into the center of a tile and hold. Reading outside the tiles does nothing.'],
    cooldown: ['A moment between actions', 'Cooling down. Look at the instructions or the space between tiles.'],
    'look-away': ['Look away to release', 'Look at a neutral area before beginning another confirmation.'],
    activated: ['A deliberate moment, complete', 'Look away from the tiles. A 1.2 second cooldown is now active.'],
  };
  if (messages[view.phase]) status(...messages[view.phase]);
  if (view.activated) activate(view.activated, 'gaze');
}
function endSession(message = 'Camera tracks stopped. Start a new session whenever you’re ready.') {
  clearTimeout(bootTimer); sessionLive = false; starting = false; collecting = false;
  document.body.classList.remove('session');
  camera.stop(); calibration = null; calibrationVisible(false);
  setState('idle'); $('start').disabled = camera.pending; $('start').textContent = camera.pending ? 'Finishing camera request…' : 'Start camera ↗';
  $('camera-label').textContent = 'Camera is off'; $('camera-help').textContent = camera.pending ? 'If permission is still open, dismiss it. Late camera tracks will be stopped.' : 'No session is running.';
  $('tracking').innerHTML = '<span></span> Camera off';
  status('Session ended', message);
}
async function start() {
  if (starting || camera.pending) return;
  document.body.classList.add('session'); window.scrollTo(0, 0);
  starting = true; $('start').disabled = true; $('start').textContent = 'Starting…'; $('stop').disabled = false;
  status('Waiting for your camera', 'Grant permission when prompted. Local models may take a moment to initialize. End session cancels.');
  $('camera-label').textContent = 'Requesting camera';
  // Do not let a silent initialization failure leave a running session indefinitely.
  bootTimer = setTimeout(() => endSession('Startup timed out. Dismiss any camera prompt, then reload and check localhost model files.'), 45000);
  const ok = await camera.start();
  clearTimeout(bootTimer); starting = false;
  if (!ok || document.hidden) {
    document.body.classList.remove('session');
    if (ok) endSession('Start was interrupted by a tab change. Start again when ready.');
    $('start').disabled = camera.pending; $('start').textContent = 'Start camera ↗'; return;
  }
  sessionLive = true; lastSample = -Infinity;
  $('camera-label').textContent = 'Camera is on'; $('camera-help').textContent = 'Frames are processed locally. Pause keeps the camera on; End session stops it.';
  $('start').textContent = 'Camera running'; $('stop').disabled = false;
  recalibrate();
}
function cancel() {
  if (engine.state === 'calibrating') {
    collecting = false; calibration = null; calibrationVisible(false); setState('uncalibrated');
    status('Calibration cancelled', 'Activation is disabled. Choose Recalibrate to begin again.'); $('recalibrate').focus();
  } else {
    engine.cancel(performance.now()); clearHighlight();
    status('Confirmation cancelled', 'Look at a neutral area before trying another tile.');
  }
}
function pause(message = 'Pending confirmation cleared. Resume explicitly when ready.') {
  if (engine.state === 'calibrating') cancel();
  else if (['active', 'ready', 'paused'].includes(engine.state)) setState('paused');
  status('Session paused · camera stays on', message);
}
$('start').addEventListener('click', start);
$('stop').addEventListener('click', () => endSession());
$('recalibrate').addEventListener('click', recalibrate);
$('cal-point').addEventListener('click', collect);
$('cal-cancel').addEventListener('click', cancel);
$('cancel').addEventListener('click', cancel);
$('arm').addEventListener('click', () => { setState('active'); status('Gaze activation enabled', 'Look at a neutral area first, then hold your gaze in the center of a tile.'); });
$('pause').addEventListener('click', () => {
  if (engine.state === 'paused') { setState('active'); status('Session resumed', 'Look at a neutral area before selecting a tile.'); }
  else pause();
});
for (const el of targetButtons) el.addEventListener('click', event => {
  engine.cancel(performance.now()); clearHighlight(); activate(el.id, event.detail === 0 ? 'keyboard' : 'mouse');
});
for (const id of ['dwell', 'sensitivity']) $(id).addEventListener('input', () => {
  engine.configure(Number($('dwell').value), Number($('sensitivity').value) / 100); clearHighlight();
  $('dwell-value').textContent = `${(engine.dwellMs / 1000).toFixed(1)} s`;
  $('sensitivity-value').textContent = engine.sensitivity < .65 ? 'Precise' : engine.sensitivity > .75 ? 'Wider' : 'Balanced';
  status('Settings updated', 'Pending confirmation cleared. Look away from the tiles before trying again.');
});
document.addEventListener('keydown', event => {
  if (event.key === 'Tab' && engine.state === 'calibrating') {
    event.preventDefault();
    const point = $('cal-point');
    (document.activeElement === point || point.disabled ? $('cal-cancel') : point).focus();
  }
  if (event.key === 'Escape') { event.preventDefault(); if (starting) endSession(); else cancel(); }
  if (event.code === 'Space' && engine.state === 'calibrating') { event.preventDefault(); collect(); }
});
document.addEventListener('visibilitychange', () => {
  if (document.hidden) { if (starting) endSession(); else if (sessionLive) pause('The tab was hidden. Return and resume explicitly; no pending dwell survives.'); }
});
window.addEventListener('pagehide', () => endSession());
window.addEventListener('blur', () => { if (sessionLive) pause('Window focus changed. Resume explicitly when ready.'); });
for (const event of ['resize', 'scroll']) window.addEventListener(event, () => {
  if (sessionLive) {
    collecting = false; calibration = null; calibrationVisible(false); setState('uncalibrated');
    status('Layout changed · recalibrate', 'Screen positions changed. Activation is disabled until a new calibration passes.');
  }
}, { passive: true });
setInterval(() => {
  if (!sessionLive || performance.now() - lastSample <= 300) return;
  engine.stale(performance.now()); clearHighlight();
  $('tracking').innerHTML = '<span></span> Tracking unavailable';
  if (engine.state === 'active') status('Tracking is unavailable', 'Pending activation reset. Face the camera in even light.');
}, 100);
