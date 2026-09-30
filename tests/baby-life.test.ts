import assert from 'node:assert/strict';
import test from 'node:test';
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { DatabaseSync } from 'node:sqlite';
import { advanceBabyLife, babyDayPeriod, babyView, BABY_TIMING as T, cycle, initialBabyLife, validateBabyLife,
  BABY_STAGE, babyApproachDuration, babyTargetForFood, reachableFoodPoint } from '../src/pet/baby-life';
import { BabyLifeRepository } from '../src/storage/baby-life-repository';
import { LifecycleRepository } from '../src/storage/lifecycle-repository';
import { loadOrCreateEgg, petDatabasePath } from '../src/storage/pet-repository';
import { hatchScenes } from '../src/pet/lifecycle';
const tick = { type: 'tick' } as const;
const approachMs = babyApproachDuration({ x: BABY_STAGE.startX, y: BABY_STAGE.startY }, 116, 146);
const mealMs = approachMs + T.chew;
test('provisional local day boundaries, late-night drowsiness, meal and sleep priority', () => {
  const at = (hour: number, minute = 0) => new Date(2026, 8, 26, hour, minute).getTime();
  for (const [hour, minute, expected] of [[6, 59, 'late-night'], [7, 0, 'day'], [19, 59, 'day'],
    [20, 0, 'night'], [22, 59, 'night'], [23, 0, 'late-night'], [0, 0, 'late-night']] as const) {
    assert.equal(babyDayPeriod(at(hour, minute)), expected);
  }
  assert.equal(babyView(initialBabyLife(at(12))).behavior, 'resting');
  assert.equal(babyView(initialBabyLife(at(21))).behavior, 'resting');
  const late = { ...initialBabyLife(at(23)), elapsedMs: T.hungry, hungerMs: T.hungry };
  assert.equal(babyView(late).behavior, 'drowsy');
  const meal = advanceBabyLife(late, at(23), { type: 'feed', offerId: babyView(late).offerId!, x: 116, y: 146, approachMs });
  assert.equal(babyView(meal.state).behavior, 'approaching');
  assert.equal(babyView(advanceBabyLife(meal.state, at(23) + mealMs, tick).state).behavior, 'drowsy');
  assert.equal(babyView({ ...late, elapsedMs: T.awake }).behavior, 'sleeping');
  // Morning is a body presentation change, not a repeated greeting or a new experience.
  const morning = advanceBabyLife(initialBabyLife(at(6, 59)), at(7), tick);
  assert.equal(babyView(morning.state).behavior, 'resting');
  assert.deepEqual(morning.events, []);
});
function seed(t: test.TestContext, baby = true) {
  const directory = mkdtempSync(path.join(tmpdir(), 'jarvis-baby-'));
  t.after(() => rmSync(directory, { recursive: true, force: true }));
  const lifecycle = new LifecycleRepository(directory, { namePolicy: { trim: true, maxCodePoints: 20 }, developmentTrigger: true });
  let state = lifecycle.read();
  if (baby) {
    state = lifecycle.apply(state.revision, { type: 'prepare' });
    for (const scene of hatchScenes) state = lifecycle.apply(state.revision, { type: 'witness', scene });
    lifecycle.apply(state.revision, { type: 'name', name: '별' });
  }
  lifecycle.close(); return directory;
}
test('time, food expiry/reappearance, drowsiness and autonomous sleep without AI', () => {
  const start = initialBabyLife(0);
  const hungry = advanceBabyLife(start, T.hungry, tick).state;
  assert.equal(babyView(hungry).offerId, 'food:3');
  assert.equal(babyView(advanceBabyLife(hungry, T.hungry + T.foodVisible, tick).state).offerId, null);
  assert.ok(babyView(advanceBabyLife(hungry, T.hungry + T.foodEvery, tick).state).offerId);
  assert.equal(babyView(advanceBabyLife(start, T.awake - T.drowsy, tick).state).behavior, 'drowsy');
  assert.equal(babyView(advanceBabyLife(start, T.awake, tick).state).behavior, 'sleeping');
  assert.equal(babyView(advanceBabyLife(start, cycle, tick).state).behavior, 'resting');
});
test('one offer, fixed eating time, stale/duplicate feed, and post-meal hunger', () => {
  let s = advanceBabyLife(initialBabyLife(0), T.hungry, tick).state;
  const feed = { type: 'feed', offerId: babyView(s).offerId!, x: 116, y: 146, approachMs } as const;
  const offered = advanceBabyLife(s, T.hungry, feed);
  assert.deepEqual(offered.events.map(e => e.kind), ['food_offered']);
  s = offered.state;
  assert.equal(babyView(s).behavior, 'approaching');
  assert.equal(advanceBabyLife(s, T.hungry, feed).events.length, 0);
  s = advanceBabyLife(s, T.hungry + approachMs, tick).state;
  assert.equal(babyView(s).behavior, 'eating');
  const done = advanceBabyLife(s, T.hungry + mealMs, tick);
  assert.equal(done.state.hungerMs, 0);
  assert.deepEqual(done.events.map(e => e.kind), ['meal_finished']);
  assert.equal(advanceBabyLife(done.state, T.hungry + mealMs, feed).events.length, 0);
  assert.throws(() => advanceBabyLife(done.state, T.hungry + mealMs, { ...feed, x: NaN }), /DROP_INVALID/);
});
test('wide edge drops move to a reachable mouth point and finish only after chewing', () => {
  assert.deepEqual(reachableFoodPoint(420, 300), { x: 374, y: 263 });
  assert.deepEqual(babyTargetForFood(420, 300), { x: 308, y: 200 });
  assert.deepEqual(babyTargetForFood(0, 0), { x: 8, y: 8 });
  const edgeApproach = babyApproachDuration({ x: BABY_STAGE.startX, y: BABY_STAGE.startY }, 420, 300);
  assert.ok(edgeApproach > 19_000 && edgeApproach <= T.approachMax);
  const hungry = advanceBabyLife(initialBabyLife(0), T.hungry, tick).state;
  const offerId = babyView(hungry).offerId!;
  const offered = advanceBabyLife(hungry, T.hungry,
    { type: 'feed', offerId, x: 420, y: 300, approachMs: edgeApproach });
  assert.deepEqual(offered.events.map(e => e.kind), ['food_offered']);
  assert.deepEqual({ x: offered.state.meal!.x, y: offered.state.meal!.y }, { x: 374, y: 263 });
  assert.equal(babyView(advanceBabyLife(offered.state, T.hungry + edgeApproach - 1, tick).state).behavior, 'approaching');
  assert.equal(babyView(advanceBabyLife(offered.state, T.hungry + edgeApproach, tick).state).behavior, 'eating');
  assert.deepEqual(advanceBabyLife(offered.state, T.hungry + edgeApproach + T.chew - 1, tick).events, []);
  const done = advanceBabyLife(offered.state, T.hungry + edgeApproach + T.chew, tick);
  assert.deepEqual(done.events.map(e => e.kind), ['meal_finished']);
  assert.equal(done.state.meal, null);
});
test('an in-progress meal saved by the old app keeps its original completion time', () => {
  const old = { ...initialBabyLife(0), elapsedMs: T.hungry + T.approach, hungerMs: T.hungry,
    meal: { id: 'food:3', startedElapsedMs: T.hungry, x: 116, y: 146 } };
  validateBabyLife(old);
  assert.equal(babyView(old).behavior, 'eating');
  const done = advanceBabyLife(old, T.meal - T.approach, tick);
  assert.deepEqual(done.events.map(e => e.kind), ['meal_finished']);
});
test('months away stay bounded, O(1) aggregate completed sleep, no invented care or unpaired starts', () => {
  const elapsed = 180 * 24 * cycle + T.awake + 1000;
  const result = advanceBabyLife(initialBabyLife(0), elapsed, tick);
  assert.equal(result.state.hungerMs, T.hungry);
  assert.equal(babyView(result.state).behavior, 'sleeping');
  assert.deepEqual(result.events, [{ kind: 'sleep_completed', atMs: elapsed, durationMs: 180 * 24 * T.sleep }]);
  const finish = advanceBabyLife(result.state, elapsed + T.sleep - 1000, tick);
  assert.deepEqual(finish.events, [{ kind: 'sleep_completed', atMs: elapsed + T.sleep - 1000, durationMs: T.sleep }]);
});
test('clock reversal does not double count; sleeping contact never repeatedly wakes baby', () => {
  let s = advanceBabyLife(initialBabyLife(100), T.awake + 100, tick).state;
  const first = advanceBabyLife(s, T.awake + 100, { type: 'touch' });
  assert.equal(first.events[0].kind, 'sleep_touch');
  s = first.state;
  assert.equal(babyView(s).behavior, 'sleeping');
  assert.equal(advanceBabyLife(s, T.awake + 101, { type: 'touch' }).events.length, 0);
  assert.deepEqual(advanceBabyLife(s, 0, tick).state, s);
  assert.equal(advanceBabyLife(s, T.awake + 100, tick).state.elapsedMs, T.awake);
  assert.throws(() => validateBabyLife({ ...s, hungerMs: Infinity }), /STATE_INVALID/);
  assert.throws(() => advanceBabyLife(s, NaN, tick), /CLOCK_INVALID/);
});
test('v3 backup, egg identity preservation, baby-only activation and v4 restore', t => {
  const directory = seed(t, false);
  const file = petDatabasePath(directory), before = readFileSync(file);
  const pet = loadOrCreateEgg(directory);
  const repo = new BabyLifeRepository(directory, () => 0);
  assert.deepEqual(readFileSync(`${file}.v3-backup`), before);
  assert.equal(repo.read(), null);
  assert.throws(() => repo.apply(tick), /WRITE_FAILED/);
  repo.close();
  assert.deepEqual(loadOrCreateEgg(directory), pet);
  new LifecycleRepository(directory, { namePolicy: { trim: true, maxCodePoints: 20 } }).close();
});
test('meal across close/reopen finishes once and state/events roll back together on failed write', t => {
  const directory = seed(t); let now = 0;
  let repo = new BabyLifeRepository(directory, () => now);
  repo.apply(tick); now = T.hungry;
  const view = babyView(repo.apply(tick));
  const db = new DatabaseSync(petDatabasePath(directory));
  const feed = { type: 'feed', offerId: view.offerId!, x: 116, y: 146, approachMs } as const;
  const before = repo.read();
  db.exec("CREATE TRIGGER fail_experience BEFORE INSERT ON baby_experience BEGIN SELECT RAISE(ABORT,'test'); END");
  assert.throws(() => repo.apply(feed), /WRITE_FAILED/);
  assert.deepEqual(repo.read(), before);
  db.exec('DROP TRIGGER fail_experience');
  repo.apply(feed); repo.close(); now += approachMs;
  repo = new BabyLifeRepository(directory, () => now);
  assert.equal(babyView(repo.apply(tick)).behavior, 'eating');
  repo.close(); now += T.chew;
  repo = new BabyLifeRepository(directory, () => now);
  assert.equal(babyView(repo.apply(tick)).behavior, 'resting');
  repo.apply(feed); repo.apply(tick);
  assert.deepEqual(db.prepare('SELECT kind FROM baby_experience ORDER BY id').all().map(r => r.kind), ['food_offered', 'meal_finished']);
  repo.close(); db.close();
});
test('invalid persisted state is preserved and fails closed', t => {
  const directory = seed(t);
  const repo = new BabyLifeRepository(directory, () => 0); repo.apply(tick); repo.close();
  const db = new DatabaseSync(petDatabasePath(directory));
  db.prepare('UPDATE baby_life SET snapshot=?').run('{"revision":2}'); db.close();
  const before = readFileSync(petDatabasePath(directory));
  assert.throws(() => new BabyLifeRepository(directory), /STORAGE_INVALID/);
  assert.deepEqual(readFileSync(petDatabasePath(directory)), before);
});
test('production startup restores the same named baby and an interrupted meal using isolated DB', t => {
  const directory = seed(t); let now = 1_000_000;
  const repo = new BabyLifeRepository(directory, () => now);
  repo.apply(tick); now += T.hungry;
  const view = babyView(repo.apply(tick));
  repo.apply({ type: 'feed', offerId: view.offerId!, x: 116, y: 146, approachMs }); repo.close();
  const launch = (at: number) => {
    const env = { ...process.env }; delete env.ELECTRON_RUN_AS_NODE;
    const run = spawnSync(process.execPath, [path.join(__dirname, 'fixtures/baby-runner.js'), directory, String(at)], { env, encoding: 'utf8', timeout: 15000 });
    assert.equal(run.status, 0, run.stderr);
    const line = run.stdout.split('\n').find(s => s.startsWith('BABY_RESULT:'))!;
    assert.ok(line); return JSON.parse(line.slice('BABY_RESULT:'.length));
  };
  const eating = launch(now + approachMs);
  assert.equal(eating.behavior, 'eating');
  assert.equal(eating.reunion, false);
  const finished = launch(now + mealMs);
  assert.equal(finished.behavior, 'resting');
  assert.deepEqual(finished.position, { x: BABY_STAGE.startX, y: BABY_STAGE.startY },
    'a new app session starts from the usual place');
  const returned = launch(now + T.awake);
  assert.equal(returned.behavior, 'resting');
  assert.equal(returned.reunion, true);
  assert.equal(launch(now + T.awake + 1000).reunion, false, 'quick restart does not replay a return');
});
test('v4 migration failure rolls back schema/version and preserves original backup', t => {
  const directory = seed(t), file = petDatabasePath(directory);
  const db = new DatabaseSync(file);
  db.exec('CREATE TABLE baby_experience(blocker TEXT)'); db.close();
  const before = readFileSync(file);
  assert.throws(() => new BabyLifeRepository(directory), /STORAGE_INVALID/);
  assert.deepEqual(readFileSync(file), before);
  assert.deepEqual(readFileSync(`${file}.v3-backup`), before);
  const check = new DatabaseSync(file);
  assert.equal(check.prepare('PRAGMA user_version').get()!.user_version, 3);
  assert.equal(check.prepare("SELECT COUNT(*) AS n FROM sqlite_master WHERE name='baby_life'").get()!.n, 0);
  check.close();
});
test('conflicting backup refuses migration without replacing pet data', t => {
  const directory = seed(t), file = petDatabasePath(directory);
  const before = readFileSync(file);
  writeFileSync(`${file}.v3-backup`, 'unrelated');
  assert.throws(() => new BabyLifeRepository(directory), /STORAGE_INVALID/);
  assert.deepEqual(readFileSync(file), before);
  assert.equal(readFileSync(`${file}.v3-backup`, 'utf8'), 'unrelated');
});
test('name and initial life commit atomically; immediate exit before baby page preserves elapsed time', t => {
  const directory = seed(t, false);
  const repository = new BabyLifeRepository(directory);
  const lifecycle = new LifecycleRepository(directory, { namePolicy: { trim: true, maxCodePoints: 20 }, developmentTrigger: true });
  let state = lifecycle.apply(0, { type: 'prepare' });
  for (const scene of hatchScenes) state = lifecycle.apply(state.revision, { type: 'witness', scene });
  const db = new DatabaseSync(petDatabasePath(directory));
  db.exec("CREATE TRIGGER fail_first_life BEFORE INSERT ON baby_life BEGIN SELECT RAISE(ABORT,'test'); END");
  assert.throws(() => lifecycle.apply(state.revision, { type: 'name', name: '별' }), /WRITE_FAILED/);
  assert.equal(lifecycle.read().name, null);
  assert.equal(repository.read(), null);
  db.exec('DROP TRIGGER fail_first_life');
  lifecycle.apply(state.revision, { type: 'name', name: '별' });
  const bornAt = repository.read()!.observedAtMs;
  repository.close(); lifecycle.close(); db.close();
  // No baby read, timer, or renderer ran before this close.
  const restored = new BabyLifeRepository(directory, () => bornAt + T.hungry);
  assert.equal(restored.apply(tick).elapsedMs, T.hungry);
  assert.ok(babyView(restored.read()!).offerId);
  restored.close();
});

test('a missing named-baby snapshot is invalid and never resets its living history', t => {
  const directory = seed(t), file = petDatabasePath(directory);
  new BabyLifeRepository(directory, () => 0).close();
  const db = new DatabaseSync(file); db.exec('DELETE FROM baby_life'); db.close();
  const before = readFileSync(file);
  assert.throws(() => new BabyLifeRepository(directory), /STORAGE_INVALID/);
  assert.deepEqual(readFileSync(file), before);
});
