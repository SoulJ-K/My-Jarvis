import assert from 'node:assert/strict';
import test from 'node:test';
import { mkdtempSync, rmSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { DatabaseSync } from 'node:sqlite';
import { advanceEggLife, careForEgg } from '../src/pet/egg-life';
import { EggGesture } from '../src/main/egg-gesture';
import { openEggLife } from '../src/storage/egg-life-repository';
import { loadOrCreateEgg, petDatabasePath } from '../src/storage/pet-repository';

const origin = { x: 100, y: 100 };
test('fake time: absence, reversal and catch-up preserve monotonic elapsed without care requirements', () => {
  const initial = { observedAtMs: 1000, elapsedMs: 0 };
  const month = advanceEggLife(initial, 1000 + 30 * 86400000);
  assert.equal(month.elapsedMs, 30 * 86400000);
  assert.deepEqual(advanceEggLife(month, 0), month);
  assert.deepEqual(advanceEggLife(month, month.observedAtMs), month);
  const care = careForEgg(month, 'stroke', month.observedAtMs + 100);
  assert.equal(care.life.elapsedMs, month.elapsedMs + 100);
  assert.equal(care.event.kind, 'stroke');
  assert.throws(() => advanceEggLife(month, NaN));
});
test('gesture boundaries: 6 DIP, hold at 350ms, travel 24 DIP and reversal; drag mode stays locked', () => {
  const click = new EggGesture(origin, origin, 0);
  click.move({ x: 105, y: 100 }, 100);
  assert.equal(click.finish(), 'touch');
  const drag = new EggGesture(origin, origin, 0);
  drag.move({ x: 106, y: 100 }, 349);
  drag.move({ x: 100, y: 100 }, 1000);
  assert.equal(drag.stroking, false);
  assert.equal(drag.finish(), undefined);
  const stroke = new EggGesture(origin, origin, 0);
  stroke.move({ x: 112, y: 100 }, 350);
  stroke.move(origin, 400);
  assert.equal(stroke.finish(), 'stroke');
});
test('one-way movement, tiny jitter, hold only and large departure cannot count as stroke', () => {
  for (const points of [[], [{ x: 125, y: 100 }], [{ x: 103, y: 100 }, origin],
    [{ x: 173, y: 100 }, origin], [{ x: 112, y: 173 }, origin]]) {
    const gesture = new EggGesture(origin, origin, 0);
    gesture.arm(350);
    for (const point of points) gesture.move(point, 400);
    assert.equal(gesture.finish(), undefined);
  }
});
function workspace(t: test.TestContext) {
  const dir = mkdtempSync(path.join(tmpdir(), 'jarvis-life-'));
  t.after(() => rmSync(dir, { recursive: true, force: true }));
  return dir;
}
test('v1 migration preserves identity; care and elapsed resume with a fake clock across repository restart', t => {
  const dir = workspace(t);
  const pet = loadOrCreateEgg(dir);
  const originalBytes = readFileSync(petDatabasePath(dir));
  let now = Date.parse(pet.createdAt) + 1000;
  let store = openEggLife(dir, () => now);
  assert.equal(store.read().elapsedMs, 1000);
  assert.deepEqual(readFileSync(`${petDatabasePath(dir)}.v1-backup`), originalBytes);
  store.care('touch');
  now += 1000;
  store.care('stroke');
  store.close();
  now += 86400000;
  store = openEggLife(dir, () => now);
  assert.equal(store.checkpoint().elapsedMs, 86402000);
  now -= 86400000;
  assert.equal(store.checkpoint().elapsedMs, 86402000);
  store.close();
  assert.deepEqual(loadOrCreateEgg(dir), pet);
  const db = new DatabaseSync(petDatabasePath(dir));
  assert.equal(db.prepare('PRAGMA user_version').get()?.user_version, 2);
  assert.deepEqual(db.prepare('SELECT kind, elapsed_ms FROM egg_care ORDER BY id').all().map(r => ({...r})),
    [{ kind: 'touch', elapsed_ms: 1000 }, { kind: 'stroke', elapsed_ms: 2000 }]);
  db.close();
});
test('failed event insertion rolls back time and event together; retry writes exactly once', t => {
  const dir = workspace(t);
  const pet = loadOrCreateEgg(dir);
  let now = Date.parse(pet.createdAt);
  const store = openEggLife(dir, () => now);
  const db = new DatabaseSync(petDatabasePath(dir));
  db.exec("CREATE TRIGGER fail_care BEFORE INSERT ON egg_care BEGIN SELECT RAISE(ABORT, 'test failure'); END");
  now += 1000;
  assert.throws(() => store.care('stroke'), /WRITE_FAILED/);
  assert.equal(store.read().elapsedMs, 0);
  assert.equal(db.prepare('SELECT count(*) AS n FROM egg_care').get()?.n, 0);
  db.exec('DROP TRIGGER fail_care');
  store.care('stroke');
  assert.equal(store.read().elapsedMs, 1000);
  assert.equal(db.prepare('SELECT count(*) AS n FROM egg_care').get()?.n, 1);
  store.close(); db.close();
});
test('failed migration rolls back schema and version without replacing the egg', t => {
  const dir = workspace(t);
  const pet = loadOrCreateEgg(dir);
  const before = readFileSync(petDatabasePath(dir));
  assert.throws(() => openEggLife(dir, () => NaN));
  assert.deepEqual(readFileSync(petDatabasePath(dir)), before);
  assert.deepEqual(loadOrCreateEgg(dir), pet);
});

test('an unrelated existing migration backup is preserved and prevents migration', t => {
  const dir = workspace(t);
  loadOrCreateEgg(dir);
  const file = petDatabasePath(dir);
  const before = readFileSync(file);
  writeFileSync(`${file}.v1-backup`, 'keep backup');
  assert.throws(() => openEggLife(dir), /INVALID_STORE/);
  assert.deepEqual(readFileSync(file), before);
  assert.equal(readFileSync(`${file}.v1-backup`, 'utf8'), 'keep backup');
});
