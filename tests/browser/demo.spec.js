import { test, expect } from '@playwright/test';

// SYNTHETIC FIXTURE ONLY: does not open a camera or estimate gaze from images.
async function syntheticCamera(page, { denied = false } = {}) {
  await page.clock.install();
  await page.addInitScript(({ denied }) => {
    window.__synthetic = { gaze: null, stopped: 0, trained: 0 };
    let callback, timer;
    const track = { readyState: 'live', muted: false, stop() { this.readyState = 'ended'; window.__synthetic.stopped++; }, addEventListener() {} };
    const wg = {
      params: {}, saveDataAcrossSessions(v) { window.__synthetic.persistence = v; return this; },
      showPredictionPoints() { return this; }, showVideoPreview() { return this; },
      setRegression() {}, removeMouseEventListeners() {}, pause() {}, end() { clearInterval(timer); document.getElementById('webgazerVideoFeed')?.remove(); },
      clearGazeListener() { callback = null; }, setGazeListener(fn) { callback = fn; },
      recordScreenPosition() { window.__synthetic.trained++; },
      async begin() {
        if (denied) throw Object.assign(new Error('Synthetic denial'), { name: 'NotAllowedError' });
        const video = document.createElement('video'); video.id = 'webgazerVideoFeed';
        Object.defineProperty(video, 'srcObject', { value: { getTracks: () => [track] } });
        document.body.append(video);
        timer = setInterval(() => {
          const p = window.__synthetic.gaze;
          callback?.(p ? { ...p, eyeFeatures: { left: {}, right: {} } } : { eyeFeatures: { left: {}, right: {} } });
        }, 100);
      },
    };
    window.webgazer = wg;
  }, { denied });
}
async function calibrate(page) {
  for (let i = 0; i < 14; i++) {
    const button = page.locator('#cal-point');
    const box = await button.boundingBox();
    await page.evaluate(p => { window.__synthetic.gaze = p; }, { x: box.x + box.width / 2, y: box.y + box.height / 2 });
    await page.keyboard.press('Space'); await page.clock.runFor(i < 9 ? 2200 : 2900);
  }
  await expect(page.locator('#arm')).toBeVisible();
}
async function gaze(page, id, duration) {
  const box = await page.locator(id).boundingBox();
  await page.evaluate(p => { window.__synthetic.gaze = p; }, { x: box.x + box.width / 2, y: box.y + box.height / 2 });
  await page.clock.runFor(duration);
}
test('setup never loads camera dependency or requests camera on page load', async ({ page }) => {
  const requests = []; page.on('request', req => requests.push(req.url()));
  await page.goto('/'); await expect(page.locator('#camera-label')).toHaveText('Camera is off');
  expect(requests.some(url => /vendor|googleapis|jsdelivr/.test(url))).toBe(false);
  await page.screenshot({ path: 'test-results/demo-desktop.png', fullPage: true });
  await page.getByRole('button', { name: /Grow a little/ }).click();
  await expect(page.locator('#action-count')).toHaveText('1 action · mouse');
});
test('SYNTHETIC: calibrate, dwell, cancel, pause, recalibrate, stop', async ({ page }) => {
  await syntheticCamera(page); await page.goto('/'); await page.locator('#start').click();
  await calibrate(page);
  expect(await page.evaluate(() => window.__synthetic.trained)).toBe(108);
  expect(await page.evaluate(() => window.__synthetic.persistence)).toBe(false);
  await page.locator('#arm').click();
  await gaze(page, '#instruction', 200); await gaze(page, '#bloom', 1000);
  await expect(page.locator('#bloom')).toHaveClass(/selected/);
  await expect(page.locator('#ring')).not.toHaveAttribute('aria-valuenow', '0');
  await page.keyboard.press('Escape'); await page.clock.runFor(3000);
  await expect(page.locator('#action-count')).toHaveText('0 actions');
  await gaze(page, '#instruction', 200); await gaze(page, '#bloom', 2100);
  await expect(page.locator('#action-count')).toHaveText('1 action · gaze');
  await page.clock.runFor(5000); await expect(page.locator('#action-count')).toHaveText('1 action · gaze');
  await page.locator('#pause').click(); await gaze(page, '#count', 4000);
  await expect(page.locator('#action-count')).toHaveText('1 action · gaze');
  await page.locator('#pause').click(); await gaze(page, '#count', 2200);
  await expect(page.locator('#action-count')).toHaveText('1 action · gaze');
  await page.locator('#recalibrate').click(); await page.clock.runFor(4000);
  await expect(page.locator('#calibration')).toBeVisible();
  await page.keyboard.press('Escape'); await page.locator('#stop').click();
  expect(await page.evaluate(() => window.__synthetic.stopped)).toBeGreaterThan(0);
});
test('SYNTHETIC: denied camera permission leaves activation disabled', async ({ page }) => {
  await syntheticCamera(page, { denied: true }); await page.goto('/'); await page.locator('#start').click();
  await expect(page.locator('#status')).toContainText('denied');
  await expect(page.locator('#calibration')).toBeHidden(); await expect(page.locator('#pause')).toBeDisabled();
});
test('real WebGazer bundle handles mocked permission denial without camera hardware', async ({ page }) => {
  const requests = []; page.on('request', r => requests.push(r.url()));
  await page.addInitScript(() => {
    navigator.mediaDevices.getUserMedia = async () => { throw Object.assign(new Error('Mock permission denial'), { name: 'NotAllowedError' }); };
  });
  await page.goto('/'); await page.locator('#start').click();
  await expect(page.locator('#status')).toContainText('denied');
  expect(requests.some(url => url.endsWith('/vendor/webgazer.js'))).toBe(true);
  expect(requests.every(url => new URL(url).hostname === 'localhost')).toBe(true);
  expect(await page.evaluate(() => window.webgazer.params.saveDataAcrossSessions)).toBe(false);
});
test('real local model processes SYNTHETIC blank video and keeps activation disabled', async ({ page }) => {
  test.setTimeout(60000);
  const requests = []; page.on('request', r => requests.push(r.url()));
  await page.addInitScript(() => {
    navigator.mediaDevices.getUserMedia = async () => {
      const canvas = document.createElement('canvas'); canvas.width = 640; canvas.height = 480;
      const ctx = canvas.getContext('2d');
      const draw = () => { ctx.fillStyle = '#cccccc'; ctx.fillRect(0, 0, 640, 480); };
      draw(); const stream = canvas.captureStream(15);
      const timer = setInterval(draw, 66);
      stream.getTracks()[0].addEventListener('ended', () => clearInterval(timer));
      return stream;
    };
  });
  await page.goto('/'); await page.locator('#start').click();
  await expect(page.locator('#calibration')).toBeVisible({ timeout: 45000 });
  await page.keyboard.press('Space');
  await expect(page.locator('#cal-count')).toContainText('Eyes not reliably available', { timeout: 10000 });
  await expect(page.locator('#arm')).toBeHidden();
  expect(requests.some(url => url.includes('/vendor/mediapipe/face_mesh/') && url.includes('wasm'))).toBe(true);
  expect(requests.every(url => new URL(url).hostname === 'localhost')).toBe(true);
  await page.keyboard.press('Escape'); await page.locator('#stop').click();
  await expect(page.locator('#camera-label')).toHaveText('Camera is off');
});
test('SYNTHETIC: tab visibility and viewport changes clear pending dwell', async ({ page }) => {
  await syntheticCamera(page); await page.goto('/'); await page.locator('#start').click(); await calibrate(page);
  await page.locator('#arm').click(); await gaze(page, '#instruction', 200); await gaze(page, '#bloom', 1100);
  await page.evaluate(() => {
    Object.defineProperty(document, 'hidden', { configurable: true, get: () => true });
    document.dispatchEvent(new Event('visibilitychange'));
  });
  await page.clock.runFor(4000); await expect(page.locator('#session-badge')).toHaveText('PAUSED');
  await expect(page.locator('#action-count')).toHaveText('0 actions');
  await page.evaluate(() => {
    Object.defineProperty(document, 'hidden', { configurable: true, get: () => false });
    document.dispatchEvent(new Event('visibilitychange'));
  });
  await page.locator('#pause').click(); await gaze(page, '#bloom', 2200);
  await expect(page.locator('#action-count')).toHaveText('0 actions');
  await page.setViewportSize({ width: 1400, height: 1050 });
  await expect(page.locator('#session-badge')).toHaveText('UNCALIBRATED');
});
test('mobile setup and reduced motion keep keyboard controls readable', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 }); await page.goto('/');
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  await expect(page.locator('#start')).toBeVisible();
  await page.locator('#bloom').focus(); await page.keyboard.press('Enter');
  await expect(page.locator('#action-count')).toHaveText('1 action · keyboard');
});
