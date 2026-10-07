// Run using an already installed Playwright and browser. Never opens the pet app.
const assert = require('node:assert/strict');
const path = require('node:path');
const fs = require('node:fs');
const { createTrialServer } = require('./serve.cjs');
async function main() {
  if (!process.env.TRIAL_PLAYWRIGHT_MODULE || !process.env.TRIAL_BROWSER_PATH) throw new Error('Set TRIAL_PLAYWRIGHT_MODULE and TRIAL_BROWSER_PATH to existing installations.');
  const { chromium } = require(process.env.TRIAL_PLAYWRIGHT_MODULE);
  const server = createTrialServer();
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  let browser;
  const output = path.resolve(__dirname, '../../.local/appearance-trial/behavior');
  fs.mkdirSync(output, { recursive: true });
  try {
    browser = await chromium.launch({ headless: true, executablePath: process.env.TRIAL_BROWSER_PATH });
    const context = await browser.newContext({ viewport: { width: 1100, height: 1100 }, reducedMotion: 'reduce' });
    const base = `http://127.0.0.1:${server.address().port}`;
    const remoteRequests = [];
    await context.route('**/*', route => {
      if (route.request().url().startsWith(base + '/')) return route.continue();
      remoteRequests.push(route.request().url()); return route.abort();
    });
    const page = await context.newPage();
    const errors = []; page.on('pageerror', error => errors.push(error.message));
    await page.goto(base); await page.waitForSelector('html[data-ready=true]');
    assert.equal(await page.locator('.trial').count(), 2);
    assert.equal(await page.locator('.pose-card').count(), 6);
    let combinations = 0;
    for (const size of ['73.6', '96', '144']) {
      await page.selectOption('#size', size);
      for (let i = 0; i < 2; i++) {
        const trial = page.locator('.trial').nth(i);
        for (const pose of ['stand', 'sit', 'sleep']) {
          await trial.locator(`button[data-pose=${pose}]`).click();
          for (let p = 0; p < 9; p++) {
            await trial.locator('[data-place]').nth(p).click();
            const rects = await trial.locator('canvas').evaluate(c => ['body', 'orb', 'label'].map(k => JSON.parse(c.dataset[k])));
            for (const r of rects) assert.ok(r.x >= -1e-8 && r.y >= -1e-8 && r.x + r.width <= 420 + 1e-8 && r.y + r.height <= 300 + 1e-8);
            const overlap = (a, b) => a.x < b.x + b.width && a.x + a.width > b.x && a.y < b.y + b.height && a.y + a.height > b.y;
            assert.ok(!overlap(rects[0], rects[1]) && !overlap(rects[0], rects[2]) && !overlap(rects[1], rects[2]));
            combinations++;
          }
        }
      }
    }
    await page.selectOption('#size', '73.6');
    for (const trial of await page.locator('.trial').all()) { await trial.locator('button[data-pose=stand]').click(); await trial.locator('[data-place="0.5,0.5"]').click(); }
    const first = page.locator('.trial canvas').first();
    // Find an opaque body point from the actual rendered image, then drag past the edge.
    const hit = await first.evaluate(canvas => {
      const r = JSON.parse(canvas.dataset.body), ctx = canvas.getContext('2d');
      // Central face is opaque in the approved standing asset.
      return { x: r.x + r.width * .70, y: r.y + r.height * .64 };
    });
    const box = await first.boundingBox();
    await page.mouse.click(box.x + hit.x, box.y + hit.y);
    assert.match(await page.locator('#status').innerText(), /몸 클릭 확인/);
    await page.mouse.move(box.x + hit.x, box.y + hit.y); await page.mouse.down();
    await page.mouse.move(box.x + 460, box.y + 340, { steps: 4 }); await page.mouse.up();
    const atRelease = await first.getAttribute('data-body');
    await page.waitForTimeout(250);
    assert.equal(await first.getAttribute('data-body'), atRelease, 'No delayed sliding after release');
    // A transparent corner INSIDE the PNG's bounding box must not start a drag.
    const releasedBody = JSON.parse(atRelease);
    await page.mouse.move(box.x + releasedBody.x + .5, box.y + releasedBody.y + .5); await page.mouse.down();
    await page.mouse.move(box.x + 40, box.y + 50); await page.mouse.up();
    assert.equal(await first.getAttribute('data-body'), atRelease);
    await first.focus(); await page.keyboard.press('ArrowLeft');
    assert.notEqual(await first.getAttribute('data-body'), atRelease);
    assert.equal(await page.evaluate(() => document.getAnimations().length), 0);
    assert.equal(await page.evaluate(() => typeof window.petWindow), 'undefined');
    assert.equal(await page.evaluate(() => typeof window.babyLife), 'undefined');
    assert.equal(await page.evaluate(() => localStorage.length), 0);
    // Reload always returns the two deterministic fixtures, never creates a real pet.
    await page.reload(); await page.waitForSelector('html[data-ready=true]');
    assert.deepEqual(await page.locator('.trial canvas').evaluateAll(cs => cs.map(c => c.dataset.family)), ['leaf', 'wing']);
    assert.deepEqual(await page.locator('.trial canvas').evaluateAll(cs => cs.map(c => c.dataset.facing)), ['front', 'front']);
    // Explicit views select real assets (no mirroring); auto direction follows travel.
    let directionChecks = 0;
    await page.emulateMedia({ reducedMotion: 'no-preference' });
    for (let i = 0; i < 2; i++) {
      const trial = page.locator('.trial').nth(i), canvas = trial.locator('canvas');
      for (const pose of ['stand', 'sit']) {
        await trial.locator(`button[data-pose=${pose}]`).click();
        const files = [];
        for (const direction of ['left', 'front', 'right']) {
          await trial.locator(`button[data-facing=${direction}]`).click();
          assert.equal(await canvas.getAttribute('data-facing'), direction);
          files.push(await canvas.getAttribute('data-asset')); directionChecks++;
        }
        assert.equal(new Set(files).size, 3);
      }
      await trial.locator('button[data-pose=stand]').click();
      await trial.locator('[data-place="0.5,0.5"]').click();
      await trial.locator('button[data-facing=front]').click();
      const body = JSON.parse(await canvas.getAttribute('data-body')), cb = await canvas.boundingBox();
      const x = cb.x + body.x + body.width * .55, y = cb.y + body.y + body.height * .70;
      await page.mouse.move(x, y); await page.mouse.down();
      await page.mouse.move(x - 35, y, { steps: 5 });
      assert.equal(await canvas.getAttribute('data-facing'), 'left');
      await page.waitForTimeout(1000);
      assert.equal(await canvas.getAttribute('data-facing'), 'left', 'held drag must not look back');
      await page.mouse.move(x + 25, y, { steps: 5 });
      assert.equal(await canvas.getAttribute('data-facing'), 'right');
      await page.mouse.up();
      const foot = await canvas.getAttribute('data-foot');
      assert.equal(await canvas.getAttribute('data-facing'), 'right');
      await page.waitForFunction(index => document.querySelectorAll('.trial canvas')[index].dataset.facing === 'front', i);
      assert.equal(await canvas.getAttribute('data-foot'), foot, 'turning in place must not slide the feet');
      await trial.locator('button[data-pose=sleep]').click();
      await canvas.focus(); await page.keyboard.press('ArrowLeft'); await page.waitForTimeout(1000);
      assert.equal(await canvas.getAttribute('data-pose'), 'sleep');
      assert.equal(await canvas.getAttribute('data-facing'), 'right');
      assert.equal(await trial.locator('button[data-facing=front]').isDisabled(), true);
      await trial.locator('button[data-pose=stand]').click();
    }
    let behaviorChecks = 0;
    for (let i = 0; i < 2; i++) {
      const trial = page.locator('.trial').nth(i), canvas = trial.locator('canvas');
      const action = name => trial.locator(`button[data-action=${name}]`).click();
      await trial.locator('[data-place="0.5,0.5"]').click(); await action('rest');
      const before = await canvas.getAttribute('data-foot');
      // Dispatch in the same browser task so the 180ms anticipation cannot be missed.
      const anticipation = await trial.evaluate(el => {
        el.querySelector('[data-action=travel]').click();
        return { ...el.querySelector('canvas').dataset };
      });
      assert.equal(anticipation.phase, 'head'); assert.match(anticipation.asset, /v003/);
      assert.equal(anticipation.foot, before); assert.equal(anticipation.moving, 'false');
      await page.waitForFunction(i => document.querySelectorAll('.trial canvas')[i].dataset.moving === 'true', i);
      await page.waitForFunction(i => { const d = document.querySelectorAll('.trial canvas')[i].dataset; return d.moving === 'false' && d.facing === 'front'; }, i);
      assert.notEqual(await canvas.getAttribute('data-foot'), before);
      await action('food'); await page.waitForTimeout(240);
      const focused = await canvas.getAttribute('data-facing'), position = await canvas.getAttribute('data-foot');
      const target = JSON.parse(await canvas.getAttribute('data-food'));
      assert.ok(target); assert.equal(focused, target.x + 9 < JSON.parse(position).x ? 'left' : 'right');
      await page.mouse.move(1, 1); await action('travel'); await page.waitForTimeout(1000);
      assert.equal(await canvas.getAttribute('data-activity'), 'food');
      assert.equal(await canvas.getAttribute('data-facing'), focused); assert.equal(await canvas.getAttribute('data-foot'), position);
      await action('orb'); await page.waitForTimeout(240);
      const orb = JSON.parse(await canvas.getAttribute('data-orb'));
      assert.equal(await canvas.getAttribute('data-facing'), orb.x + orb.width / 2 < JSON.parse(position).x ? 'left' : 'right');
      await action('rest'); await action('travel');
      await trial.locator('button[data-pose=sleep]').click();
      const asleep = await canvas.getAttribute('data-foot'); await page.waitForTimeout(1000);
      assert.equal(await canvas.getAttribute('data-foot'), asleep); assert.equal(await canvas.getAttribute('data-activity'), 'sleep');
      assert.equal(await canvas.getAttribute('data-moving'), 'false');
      assert.equal(await trial.locator('[data-action=travel]').isDisabled(), true);
      await trial.locator('button[data-pose=stand]').click();
      await page.emulateMedia({ reducedMotion: 'reduce' });
      await action('travel');
      assert.equal(await canvas.getAttribute('data-phase'), 'body'); assert.equal(await canvas.getAttribute('data-moving'), 'false');
      assert.equal(await canvas.getAttribute('data-facing'), 'front');
      await page.emulateMedia({ reducedMotion: 'no-preference' });
      behaviorChecks++;
    }
    await page.emulateMedia({ reducedMotion: 'reduce' });
    await page.screenshot({ path: path.join(output, 'trial-current-size.png'), fullPage: true });
    await page.selectOption('#background', 'dark'); await page.selectOption('#size', '96');
    await page.locator('.trial').first().locator('button[data-pose=sit]').click();
    await page.locator('.trial').nth(1).locator('button[data-pose=sleep]').click();
    await page.screenshot({ path: path.join(output, 'trial-dark-96.png'), fullPage: true });
    await page.locator('.trial').first().locator('[data-place="0,0"]').click();
    await page.locator('.trial').nth(1).locator('[data-place="1,1"]').click();
    await page.screenshot({ path: path.join(output, 'trial-corners.png'), fullPage: true });
    await page.setViewportSize({ width: 390, height: 900 });
    assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth));
    assert.deepEqual(errors, []); assert.deepEqual(remoteRequests, []);
    const result = { browser: await browser.version(), combinations, directionChecks, behaviorChecks, headBeforeTravel: true, targetFocus: true, sleepCancelsTravel: true, directionDuringDrag: true, delayedFrontReturn: true, sleepPreserved: true, clickAndDrag: true, transparentRejection: true, keyboard: true, noPostDragDrift: true, reducedMotion: true, externalRequests: 0, realPetAPIs: false, errors };
    fs.writeFileSync(path.join(output, 'browser-result.json'), JSON.stringify(result, null, 2) + '\n');
    console.log(JSON.stringify(result));
  } finally {
    if (browser) await browser.close();
    await new Promise(resolve => server.close(resolve));
  }
}
main().catch(error => { console.error(error); process.exitCode = 1; });
