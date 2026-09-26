import assert from 'node:assert/strict';
import test from 'node:test';
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { DatabaseSync } from 'node:sqlite';
import { spawnSync } from 'node:child_process';
import { DEFAULT_HATCH_READINESS_POLICY, hatchReadiness, hatchScenes, initialLifecycle, advanceLifecycle, nextHatchStep, normalizePetName } from '../src/pet/lifecycle';
import { LifecycleRepository } from '../src/storage/lifecycle-repository';
import { loadOrCreateEgg, petDatabasePath } from '../src/storage/pet-repository';
import { openEggLife } from '../src/storage/egg-life-repository';

// The direct prepare command remains a test-only seed alongside real readiness.
const options = { namePolicy: { trim: true, maxCodePoints: 20 }, developmentTrigger: true };
// Deliberately tiny test policy. These values are not product defaults.
const readinessPolicy = { baseDurationMs: 1000, careReductionMs: { touch: 50, stroke: 100 }, maxCareReductionMs: 300, careIntervalMs: 100 };
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

test('pure readiness: elapsed boundary without care, actual events, bounded reduction and invalid inputs', () => {
  const at = (elapsedMs: number) => ({ elapsedMs, observedAtMs: 10_000 });
  const touch = { kind: 'touch' as const, occurredAtMs: 1, elapsedMs: 1 };
  const stroke = { ...touch, kind: 'stroke' as const, elapsedMs: 101 };
  assert.equal(hatchReadiness(at(999), [], readinessPolicy).ready, false);
  assert.equal(hatchReadiness(at(1000), [], readinessPolicy).ready, true);
  assert.equal(hatchReadiness(at(850), [touch, stroke], readinessPolicy).ready, true);
  assert.equal(hatchReadiness(at(849), [touch, stroke], readinessPolicy).ready, false);
  const spaced = Array.from({ length: 4 }, (_, index) => ({ ...stroke, elapsedMs: index * 100 }));
  assert.deepEqual(hatchReadiness(at(699), spaced, readinessPolicy),
    { ready: false, reductionMs: 300, requiredElapsedMs: 700 });
  assert.equal(hatchReadiness(at(700), spaced, readinessPolicy).ready, true);
  assert.deepEqual(hatchReadiness(at(700), Array(100).fill(stroke), readinessPolicy),
    { ready: false, reductionMs: 100, requiredElapsedMs: 900 });
  assert.equal(hatchReadiness(at(1000), [{ ...stroke, elapsedMs: 0 }, { ...stroke, elapsedMs: 99 }], readinessPolicy).reductionMs, 100);
  assert.equal(hatchReadiness(at(1000), [{ ...stroke, elapsedMs: 0 }, { ...stroke, elapsedMs: 100 }], readinessPolicy).reductionMs, 200);
  for (const policy of [{ ...readinessPolicy, baseDurationMs: 0 }, { ...readinessPolicy, maxCareReductionMs: 1000 },
    { ...readinessPolicy, maxCareReductionMs: -1 }, { ...readinessPolicy, careIntervalMs: 0 },
    { ...readinessPolicy, careReductionMs: { touch: NaN, stroke: 1 } }]) {
    assert.throws(() => hatchReadiness(at(1000), [], policy), /INVALID_HATCH_POLICY/);
  }
  assert.throws(() => hatchReadiness(at(-1), [], readinessPolicy), /INVALID_HATCH_EVIDENCE/);
  assert.throws(() => hatchReadiness(at(0), [stroke], readinessPolicy), /INVALID_HATCH_EVIDENCE/);
  assert.throws(() => hatchReadiness(at(1000), [{ ...stroke, occurredAtMs: 10_001 }], readinessPolicy), /INVALID_HATCH_EVIDENCE/);
});

test('readiness persists only preparation after absence/restart; repeated checks never witness or reset it', t => {
  const dir = directory(t); const pet = loadOrCreateEgg(dir); const start = Date.parse(pet.createdAt);
  openEggLife(dir, () => start).close();
  let store = new LifecycleRepository(dir, { namePolicy: options.namePolicy });
  assert.equal(store.prepareIfReady(readinessPolicy, start + 999).ready, false);
  store.close();
  store = new LifecycleRepository(dir, { namePolicy: options.namePolicy });
  const prepared = store.prepareIfReady(readinessPolicy, start + 86_400_000);
  assert.deepEqual(prepared, { ...initialLifecycle(pet.petId), ready: true, revision: 1 });
  assert.deepEqual(store.prepareIfReady(readinessPolicy, start), prepared);
  store.close();
  store = new LifecycleRepository(dir, { namePolicy: options.namePolicy });
  assert.deepEqual(store.read(), prepared);
  assert.deepEqual(store.prepareIfReady(readinessPolicy, start + 172_800_000), prepared);
  store.close();
  const db = new DatabaseSync(petDatabasePath(dir));
  assert.equal(db.prepare('SELECT count(*) n FROM egg_care').get()?.n, 0); db.close();
});

test('only committed care shortens readiness; failed care and time reversal cannot invent events or elapsed', t => {
  const dir = directory(t); const pet = loadOrCreateEgg(dir); const start = Date.parse(pet.createdAt);
  let now = start;
  let life = openEggLife(dir, () => now);
  const store = new LifecycleRepository(dir, { namePolicy: options.namePolicy });
  const db = new DatabaseSync(petDatabasePath(dir));
  db.exec("CREATE TRIGGER reject_care BEFORE INSERT ON egg_care BEGIN SELECT RAISE(ABORT, 'test'); END");
  now += 100; assert.throws(() => life.care('stroke'));
  assert.equal(store.prepareIfReady(readinessPolicy, start + 900).ready, false);
  db.exec('DROP TRIGGER reject_care');
  // A real care record can occur while the wall clock is behind its high water mark.
  life.care('stroke'); life.close();
  life = openEggLife(dir, () => start + 899);
  assert.equal(life.checkpoint().elapsedMs, 900);
  const prepared = store.prepareIfReady(readinessPolicy, start + 899);
  assert.equal(prepared.ready, true); assert.equal(prepared.completed, null);
  assert.equal(db.prepare('SELECT count(*) n FROM egg_care').get()?.n, 1);
  life.close(); store.close(); db.close();
});

test('readiness write failure rolls elapsed and ready back together and retry commits once', t => {
  const dir = directory(t); const pet = loadOrCreateEgg(dir); const start = Date.parse(pet.createdAt);
  const life = openEggLife(dir, () => start);
  const store = new LifecycleRepository(dir, { namePolicy: options.namePolicy });
  const db = new DatabaseSync(petDatabasePath(dir));
  db.exec("CREATE TRIGGER reject_ready BEFORE UPDATE ON lifecycle BEGIN SELECT RAISE(ABORT, 'test'); END");
  assert.throws(() => store.prepareIfReady(readinessPolicy, start + 1000), /LIFECYCLE_WRITE_FAILED/);
  assert.equal(life.read().elapsedMs, 0); assert.equal(store.read().ready, false);
  db.exec('DROP TRIGGER reject_ready');
  assert.equal(store.prepareIfReady(readinessPolicy, start + 1000).revision, 1);
  assert.equal(store.prepareIfReady(readinessPolicy, start + 1000).revision, 1);
  life.close(); store.close(); db.close();
});

test('care eligibility gap survives restart; rapid events stay recorded without multiplying reduction', t => {
  const dir = directory(t); const start = Date.parse(loadOrCreateEgg(dir).createdAt);
  let now = start;
  let life = openEggLife(dir, () => now);
  life.care('stroke');
  now += 99; life.care('stroke'); life.close();
  let store = new LifecycleRepository(dir, { namePolicy: options.namePolicy });
  assert.equal(store.prepareIfReady(readinessPolicy, start + 99).ready, false); store.close();
  life = openEggLife(dir, () => now);
  now = start + 100; life.care('stroke'); life.close();
  store = new LifecycleRepository(dir, { namePolicy: options.namePolicy });
  assert.equal(store.prepareIfReady(readinessPolicy, start + 799).ready, false);
  assert.equal(store.prepareIfReady(readinessPolicy, start + 800).ready, true); store.close();
  const db = new DatabaseSync(petDatabasePath(dir));
  assert.equal(db.prepare('SELECT count(*) n FROM egg_care').get()?.n, 3); db.close();
});

test('approved default policy: 24h without care, 18h floor, equal care kinds and 1h eligibility boundaries', () => {
  const hour = 60 * 60 * 1000;
  const at = (elapsedMs: number) => ({ elapsedMs, observedAtMs: elapsedMs });
  const event = (elapsedMs: number, kind: 'touch' | 'stroke' = 'touch') => ({ kind, elapsedMs, occurredAtMs: elapsedMs });
  const readiness = (elapsedMs: number, care: ReturnType<typeof event>[] = []) => hatchReadiness(at(elapsedMs), care, DEFAULT_HATCH_READINESS_POLICY);
  assert.equal(readiness(24 * hour - 1).ready, false);
  assert.equal(readiness(24 * hour).ready, true);
  assert.equal(readiness(365 * 24 * hour).ready, true);
  for (const kind of ['touch', 'stroke'] as const) {
    assert.equal(readiness(23.5 * hour - 1, [event(0, kind)]).ready, false);
    assert.equal(readiness(23.5 * hour, [event(0, kind)]).ready, true);
  }
  const spam = Array.from({ length: 100 }, (_, index) => event(index));
  assert.equal(readiness(18 * hour, spam).reductionMs, hour / 2);
  assert.equal(readiness(18 * hour, [event(0), event(hour - 1, 'stroke')]).reductionMs, hour / 2);
  assert.equal(readiness(18 * hour, [event(0), event(hour, 'stroke')]).reductionMs, hour);
  const spaced = Array.from({ length: 18 }, (_, index) => event(index * hour, index % 2 ? 'stroke' : 'touch'));
  assert.deepEqual(readiness(18 * hour - 1, spaced), { ready: false, reductionMs: 6 * hour, requiredElapsedMs: 18 * hour });
  assert.deepEqual(readiness(18 * hour, spaced), { ready: true, reductionMs: 6 * hour, requiredElapsedMs: 18 * hour });
});
