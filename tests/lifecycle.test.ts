import assert from 'node:assert/strict';
import test from 'node:test';
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { DatabaseSync } from 'node:sqlite';
import { spawnSync } from 'node:child_process';
import { hatchScenes, initialLifecycle, advanceLifecycle, nextHatchStep, normalizePetName } from '../src/pet/lifecycle';
import { LifecycleRepository } from '../src/storage/lifecycle-repository';
import { loadOrCreateEgg, petDatabasePath } from '../src/storage/pet-repository';
import { openEggLife } from '../src/storage/egg-life-repository';

// User-selected first-name policy; preparation remains a test-only trigger.
const options = { namePolicy: { trim: true, maxCodePoints: 20 }, developmentTrigger: true };
function directory(t: test.TestContext) {
  const dir = mkdtempSync(path.join(tmpdir(), 'jarvis-hatch-'));
  t.after(() => rmSync(dir, { recursive: true, force: true })); return dir;
}
function naming(store: LifecycleRepository) {
  let state = store.apply(0, { type: 'prepare' });
  for (const scene of hatchScenes) state = store.apply(state.revision, { type: 'witness', scene });
  return state;
}
test('pure sequence prohibits skipping, early naming, adult growth and name replacement', () => {
  let state = initialLifecycle('pet');
  assert.equal(nextHatchStep(state), 'egg');
  assert.throws(() => advanceLifecycle(state, { type: 'witness', scene: 'baby' }, options.namePolicy));
  state = advanceLifecycle(state, { type: 'prepare' }, options.namePolicy);
  assert.throws(() => advanceLifecycle(state, { type: 'name', name: '별' }, options.namePolicy));
  for (const scene of hatchScenes) state = advanceLifecycle(state, { type: 'witness', scene }, options.namePolicy);
  state = advanceLifecycle(state, { type: 'name', name: ' 별 ' }, options.namePolicy);
  assert.equal(state.name, '별'); assert.equal(state.stage, 'baby');
  assert.throws(() => advanceLifecycle(state, { type: 'name', name: '다른 이름' }, options.namePolicy));
  for (const name of ['', '   ', 'x'.repeat(21)]) {
    assert.throws(() => normalizePetName(name, options.namePolicy));
  }
  assert.throws(() => normalizePetName('별\n이', options.namePolicy));
  assert.equal(normalizePetName('🌟'.repeat(20), options.namePolicy), '🌟'.repeat(20));
});
test('default repository cannot prepare; opening/restarting never advances', t => {
  const dir = directory(t);
  const store = new LifecycleRepository(dir, { namePolicy: options.namePolicy });
  assert.throws(() => store.apply(0, { type: 'prepare' }), /HATCH_TRIGGER_DISABLED/);
  assert.equal(nextHatchStep(store.read()), 'egg'); store.close();
  const restarted = new LifecycleRepository(dir, options);
  assert.equal(restarted.read().revision, 0); restarted.close();
});
test('v1→v2→v3 retains identity/care; every checkpoint survives a fresh process and duplicates', t => {
  const dir = directory(t); const pet = loadOrCreateEgg(dir);
  const care = openEggLife(dir); care.care('stroke'); care.close();
  const v2 = readFileSync(petDatabasePath(dir));
  let store = new LifecycleRepository(dir, options);
  assert.deepEqual(readFileSync(`${petDatabasePath(dir)}.v2-backup`), v2);
  let state = store.read();
  const commands = [{ type: 'prepare' } as const, ...hatchScenes.map(scene => ({ type: 'witness', scene } as const)), { type: 'name', name: '별' } as const];
  for (const command of commands) {
    const revision = state.revision;
    state = store.apply(revision, command);
    assert.deepEqual(store.apply(revision, command), state);
    store.close();
    const child = spawnSync(process.execPath, ['-e', `const {LifecycleRepository}=require(process.argv[1]); const r=new LifecycleRepository(process.argv[2],JSON.parse(process.argv[3])); console.log(JSON.stringify(r.read()));r.close();`,
      path.join(__dirname, '../src/storage/lifecycle-repository.js'), dir, JSON.stringify(options)], { encoding: 'utf8', env: { ...process.env, ELECTRON_RUN_AS_NODE: '1' } });
    assert.equal(child.status, 0, child.stderr);
    assert.deepEqual(JSON.parse(child.stdout.trim()), state);
    store = new LifecycleRepository(dir, options);
    assert.equal(state.petId, pet.petId);
    assert.equal(loadOrCreateEgg(dir).stage, state.stage);
  }
  assert.equal(state.orbId, `${pet.petId}:orb`); store.close();
  const db = new DatabaseSync(petDatabasePath(dir));
  assert.equal(db.prepare('SELECT count(*) AS n FROM egg_care').get()?.n, 1);
  assert.equal(db.prepare('PRAGMA user_version').get()?.user_version, 3);
  assert.deepEqual(db.prepare('PRAGMA foreign_key_check').all(), []); db.close();
  openEggLife(dir).close(); // Legacy care reader remains compatible.
});
test('failed naming rolls back pet and checkpoint together; restart, retry, stale double-submit', t => {
  const dir = directory(t); let store = new LifecycleRepository(dir, options);
  const before = naming(store);
  const db = new DatabaseSync(petDatabasePath(dir));
  db.exec("CREATE TRIGGER fail_lifecycle BEFORE UPDATE ON lifecycle BEGIN SELECT RAISE(ABORT, 'test'); END");
  assert.throws(() => store.apply(before.revision, { type: 'name', name: '별' }), /LIFECYCLE_WRITE_FAILED/);
  assert.equal(db.prepare('SELECT name FROM pet').get()?.name, null);
  assert.deepEqual(store.read(), before); store.close();
  store = new LifecycleRepository(dir, options); assert.deepEqual(store.read(), before);
  db.exec('DROP TRIGGER fail_lifecycle');
  const saved = store.apply(before.revision, { type: 'name', name: '별' });
  assert.deepEqual(store.apply(before.revision, { type: 'name', name: '다른 이름' }), saved);
  assert.equal(saved.name, '별'); store.close(); db.close();
});
test('failed baby checkpoint rolls back growth stage too', t => {
  const dir = directory(t); const store = new LifecycleRepository(dir, options);
  let state = store.apply(0, { type: 'prepare' });
  for (const scene of hatchScenes.slice(0, 4)) state = store.apply(state.revision, { type: 'witness', scene });
  const db = new DatabaseSync(petDatabasePath(dir));
  db.exec("CREATE TRIGGER fail_lifecycle BEFORE UPDATE ON lifecycle BEGIN SELECT RAISE(ABORT, 'test'); END");
  assert.throws(() => store.apply(state.revision, { type: 'witness', scene: 'baby' }));
  assert.equal(loadOrCreateEgg(dir).stage, 'egg'); assert.deepEqual(store.read(), state);
  db.close(); store.close();
});
test('conflicting backup prevents migration and preserves original bytes', t => {
  const dir = directory(t); openEggLife(dir).close();
  const file = petDatabasePath(dir); const before = readFileSync(file);
  writeFileSync(`${file}.v2-backup`, 'unrelated backup');
  assert.throws(() => new LifecycleRepository(dir, options), /LIFECYCLE_STORAGE_INVALID/);
  assert.deepEqual(readFileSync(file), before);
  assert.equal(readFileSync(`${file}.v2-backup`, 'utf8'), 'unrelated backup');
});
test('migration failure restores v2 schema/version/identity and retains backup', t => {
  const dir = directory(t); openEggLife(dir).close();
  const file = petDatabasePath(dir); const db = new DatabaseSync(file);
  db.exec('CREATE TABLE lifecycle (keep TEXT)'); db.close();
  const before = readFileSync(file);
  assert.throws(() => new LifecycleRepository(dir, options));
  assert.deepEqual(readFileSync(file), before);
  assert.deepEqual(readFileSync(`${file}.v2-backup`), before);
  assert.equal(loadOrCreateEgg(dir).stage, 'egg');
});
test('corrupt, missing and foreign-pet snapshots fail without replacement', t => {
  for (const mutation of ['DELETE FROM lifecycle', "UPDATE lifecycle SET snapshot='{}'", "UPDATE lifecycle SET snapshot=json_set(snapshot,'$.petId','foreign')", "UPDATE pet SET stage='baby'"]) {
    const dir = directory(t); new LifecycleRepository(dir, options).close();
    const db = new DatabaseSync(petDatabasePath(dir)); db.exec(mutation); db.close();
    const before = readFileSync(petDatabasePath(dir));
    assert.throws(() => new LifecycleRepository(dir, options));
    assert.deepEqual(readFileSync(petDatabasePath(dir)), before);
  }
});
