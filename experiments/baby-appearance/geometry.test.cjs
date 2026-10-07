const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const G = require('./geometry');
const families = require('./assets');
const { createTrialServer } = require('./serve.cjs');
const area = { width: 420, height: 300 };
function inside(rect) {
  assert.ok(rect.x >= -1e-8 && rect.y >= -1e-8);
  assert.ok(rect.x + rect.width <= 420 + 1e-8 && rect.y + rect.height <= 300 + 1e-8);
}
test('two fixed fixtures, six local assets and no duplicate pose files', () => {
  assert.deepEqual(families.map(f => f.id), ['leaf', 'wing']);
  const files = families.flatMap(f => Object.values(f.poses).map(p => p.file));
  assert.equal(new Set(files).size, 6);
  for (const file of files) assert.ok(fs.existsSync(path.join(__dirname, file)));
});
test('162 pose/size/edge combinations keep body, orb and name visible without overlap', () => {
  let count = 0;
  for (const family of families) for (const pose of ['stand', 'sit', 'sleep']) {
    for (const height of [73.6, 96, 144]) for (const x of [0, .5, 1]) for (const y of [0, .5, 1]) {
      const size = G.dimensions(family, pose, height);
      const body = G.bodyAt({ x: x * 600 - 90, y: y * 500 - 60 }, size, area);
      const { orb, label } = G.accessories(body, area, 120);
      [body, orb, label].forEach(inside);
      assert.ok(!G.intersects(body, orb)); assert.ok(!G.intersects(body, label)); assert.ok(!G.intersects(orb, label));
      if (x === 0) assert.equal(body.x, 0);
      if (x === 1) assert.ok(Math.abs(body.x + body.width - 420) < 1e-8);
      if (y === 0) assert.equal(body.y, 0);
      if (y === 1) assert.ok(Math.abs(body.y + body.height - 300) < 1e-8);
      count++;
    }
  }
  assert.equal(count, 162);
});
test('pose changes preserve foot point and sleeping stays lower, not enlarged to standing height', () => {
  for (const family of families) {
    const foot = { x: 210, y: 210 };
    const standing = G.dimensions(family, 'stand', 73.6);
    assert.ok(Math.abs(standing.height - 73.6) < 1e-8);
    for (const pose of ['stand', 'sit', 'sleep']) {
      const size = G.dimensions(family, pose, 73.6), body = G.bodyAt(foot, size, area);
      assert.equal(body.x + body.width / 2, foot.x); assert.equal(body.y + body.height, foot.y);
      assert.ok(Math.abs(size.width - standing.width) < 1e-8);
      if (pose === 'sleep') assert.ok(size.height < standing.height * .8);
    }
  }
});
test('direction variants preserve pose height, footprint, safe placement and local image sources', () => {
  for (const family of families) for (const pose of ['stand', 'sit']) for (const direction of (pose === 'stand' ? ['left', 'front', 'right', 'head-left', 'head-right'] : ['left', 'front', 'right'])) {
    if (direction !== 'right') assert.ok(family.views?.[pose]?.[direction], 'a real directional drawing is required');
    const asset = G.assetFor(family, pose, direction);
    assert.ok(fs.existsSync(path.join(__dirname, asset.file)));
    const size = G.dimensions(family, pose, 96, direction);
    assert.equal(size.height, G.dimensions(family, pose, 96).height);
    for (const x of [-100, 210, 600]) for (const y of [-100, 210, 600]) {
      const body = G.bodyAt({ x, y }, size, area), { orb, label } = G.accessories(body, area, 120);
      [body, orb, label].forEach(inside);
      assert.ok(!G.intersects(body, orb) && !G.intersects(body, label) && !G.intersects(orb, label));
    }
  }
});
test('transparent pixels reject clicks while rendered opaque pixels accept, also after resize', () => {
  const pixels = new Uint8ClampedArray(4 * 4 * 4); pixels[(2 * 4 + 2) * 4 + 3] = 255;
  for (const scale of [1, 2, 10]) {
    const body = { x: 20, y: 30, width: 4 * scale, height: 4 * scale };
    assert.equal(G.alphaHit(20 + 2.5 * scale, 30 + 2.5 * scale, body, [0, 0, 4, 4], pixels, 4), true);
    assert.equal(G.alphaHit(20 + .5 * scale, 30 + .5 * scale, body, [0, 0, 4, 4], pixels, 4), false);
    assert.equal(G.alphaHit(20 + 4 * scale, 30, body, [0, 0, 4, 4], pixels, 4), false);
  }
});
test('static server serves allowlisted assets only, refuses writes and project/private paths', async () => {
  const server = createTrialServer();
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  const base = `http://127.0.0.1:${server.address().port}`;
  try {
    assert.equal((await fetch(base)).status, 200);
    assert.equal((await fetch(base + '/index.html', { method: 'POST' })).status, 405);
    for (const file of ['/README.md', '/materials/raw/reference.png', '/%2e%2e%2f%2e%2e%2fAGENTS.md', '/pet/pet.sqlite3']) {
      assert.equal((await fetch(base + file)).status, 404);
    }
  } finally { await new Promise(resolve => server.close(resolve)); }
});
