import assert from 'node:assert/strict';
import test from 'node:test';
import { mkdtempSync, rmSync, readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { DatabaseSync } from 'node:sqlite';
import { advanceBabyLife as advance, babyView, initialBabyLife, BABY_TIMING as T, cycle,
  canStartMeal, layoutBabyAt, babyBodyInset, BabyAttentionMotion, validateBabyLife, type BabyAttention } from '../src/pet/baby-life';
import { advanceBabySocial, initialBabySocial, socialView, SOCIAL_TIMING, parseBabyInput } from '../src/pet/baby-social';
import { BabyLifeRepository } from '../src/storage/baby-life-repository';
import { LifecycleRepository } from '../src/storage/lifecycle-repository';
import { hatchScenes } from '../src/pet/lifecycle';
import { petDatabasePath, loadOrCreateEgg } from '../src/storage/pet-repository';
const tick = { type: 'tick' } as const;
const quiet: BabyAttention = { holdLife: false, level: 0, intervalSeconds: 60 };
const held: BabyAttention = { holdLife: true, level: 2, intervalSeconds: 60 };
function seed(t: test.TestContext) {
  const directory = mkdtempSync(path.join(tmpdir(), 'jarvis-v02-pure-'));
  t.after(() => rmSync(directory, { recursive: true, force: true }));
  const life = new LifecycleRepository(directory, { developmentTrigger: true, namePolicy: { trim: true, maxCodePoints: 20 } });
  let state = life.apply(0, { type: 'prepare' });
  for (const scene of hatchScenes) state = life.apply(state.revision, { type: 'witness', scene });
  life.apply(state.revision, { type: 'name', name: '시험 아기' }); life.close();
  return directory;
}
test('schedule holds new meals; an accepted approach completes before the shared 15 minute gap starts', () => {
  const hungry = advance(initialBabyLife(0), T.hungry, tick).state;
  const command = { type: 'feed', offerId: babyView(hungry).offerId!, x: 200, y: 200, approachMs: 8000 } as const;
  const blocked = advance(hungry, T.hungry, command, held);
  assert.equal(blocked.state.meal, null); assert.equal(babyView(blocked.state, held).mealDeferred, true);
  let state = advance(hungry, T.hungry, command).state;
  state = advance(state, T.hungry + 8000, tick, held).state;
  assert.equal(babyView(state, held).behavior, 'eating');
  const done = advance(state, T.hungry + 8000 + T.chew, tick, held);
  assert.equal(done.state.lastMealFinishedElapsedMs, T.hungry + 8000 + T.chew);
  assert.deepEqual(done.events.map(e => e.kind), ['meal_finished']);
  assert.equal(canStartMeal(done.state), false);
  const almost = advance(done.state, done.state.observedAtMs + T.mealGap - 1, tick).state;
  assert.equal(canStartMeal(almost), false);
  assert.equal(canStartMeal(advance(almost, almost.observedAtMs + 1, tick).state), true);
});
test('late observation preserves actual normal meal finish time instead of moving the cooldown to observation', () => {
  const state = { ...initialBabyLife(0), meal: { id: 'food:0', startedElapsedMs: 0, x: 200, y: 200, approachMs: 8000 } };
  const result = advance(state, T.mealGap + 8000 + T.chew, tick);
  assert.equal(result.state.lastMealFinishedElapsedMs, 8000 + T.chew);
  assert.equal(canStartMeal(result.state), true);
});
test('forced wake records the actual partial sleep once and does not manufacture held-cycle sleep', () => {
  let state = advance(initialBabyLife(0), T.awake + 120_000, tick).state;
  assert.equal(babyView(state).behavior, 'sleeping');
  const woke = advance(state, state.observedAtMs, tick, held);
  assert.notEqual(babyView(woke.state, held).behavior, 'sleeping');
  assert.deepEqual(woke.events, [{ kind: 'sleep_completed', atMs: state.observedAtMs, durationMs: 120_000 }]);
  state = advance(woke.state, cycle * 3, tick, held).state;
  assert.equal(state.pendingSleepMs, 0);
  assert.deepEqual(advance(state, cycle * 4, tick, held).events, []);
  const released = advance(state, cycle * 3 + T.awake + 60_000, tick, quiet);
  assert.equal(babyView(released.state).behavior, 'sleeping');
  assert.equal(released.state.pendingSleepMs, 60_000);
});
test('sleep occupied by a normal meal is excluded from the completion summary', () => {
  const state = { ...initialBabyLife(0), elapsedMs: T.awake - 1000,
    meal: { id: 'food:0', startedElapsedMs: T.awake - 1000, x: 200, y: 200, approachMs: 8000 } };
  const result = advance(state, T.sleep + 1000, tick);
  assert.equal(result.events.find(e => e.kind === 'sleep_completed')?.durationMs, T.sleep - 12_500);
});
test('snack completion and home survive restart without replacing identity or resetting old experiences', t => {
  const directory = seed(t); let now = 0;
  let repo = new BabyLifeRepository(directory, () => now);
  const identity = loadOrCreateEgg(directory);
  repo.apply(tick); const preference = repo.view(repo.read()!).attention.preference;
  repo.setHome({ x: -1250, y: 525 });
  assert.equal(repo.canEatSnack(), true);
  repo.finishSnack(); repo.close();
  now = T.mealGap - 1; repo = new BabyLifeRepository(directory, () => now);
  assert.equal(repo.canEatSnack(), false);
  assert.deepEqual(repo.readHome(), { x: -1250, y: 525 });
  assert.equal(repo.view(repo.read()!).attention.preference, preference);
  assert.deepEqual(loadOrCreateEgg(directory), identity);
  now++; assert.equal(repo.canEatSnack(), true);
  repo.setAttention(held); assert.equal(repo.canEatSnack(), false);
  const before = repo.read()!.lastMealFinishedElapsedMs;
  assert.equal(before, 0, 'a denied snack does not count as completion');
  repo.setAttention(quiet); assert.equal(repo.canEatSnack(), true);
  repo.close();
});
test('setAttention transitions wake immediately, keep partial sleep consistent and never change the saved home', t => {
  const directory = seed(t); let now = 0;
  const repo = new BabyLifeRepository(directory, () => now);
  repo.setAttention(quiet); repo.setHome({ x: 2, y: 3 });
  now = T.awake + 60_000; repo.apply(tick);
  assert.equal(repo.view(repo.read()!).behavior, 'sleeping');
  repo.setAttention(held);
  assert.notEqual(repo.view(repo.read()!).behavior, 'sleeping');
  now += 120_000; repo.setAttention({ ...held, level: 1 });
  assert.notEqual(repo.view(repo.read()!).behavior, 'sleeping');
  assert.deepEqual(repo.readHome(), { x: 2, y: 3 });
  const db = new DatabaseSync(petDatabasePath(directory));
  assert.deepEqual(db.prepare("SELECT duration_ms FROM baby_experience WHERE kind='sleep_completed'").all().map(r => r.duration_ms), [60_000]);
  db.close(); repo.close();
});
test('old v5 snapshots remain readable unchanged; new optional fields appear only on a successful update', t => {
  const directory = seed(t);
  new BabyLifeRepository(directory, () => 0).close();
  const file = petDatabasePath(directory); const before = readFileSync(file);
  const repo = new BabyLifeRepository(directory, () => 0);
  assert.equal(repo.read()!.home, undefined); assert.equal(repo.read()!.attentionPreference, undefined);
  assert.deepEqual(readFileSync(file), before);
  const db = new DatabaseSync(file);
  db.exec("CREATE TRIGGER fail_v02 BEFORE UPDATE ON baby_life BEGIN SELECT RAISE(ABORT,'test'); END");
  const old = repo.read();
  assert.throws(() => repo.setHome({ x: 5, y: 6 })); assert.deepEqual(repo.read(), old);
  assert.throws(() => repo.finishSnack(), /WRITE_FAILED/); assert.deepEqual(repo.read(), old);
  db.exec('DROP TRIGGER fail_v02'); repo.apply(tick);
  assert.ok(repo.read()!.attentionPreference); assert.equal(repo.read()!.elapsedMs, old!.elapsedMs);
  assert.equal(db.prepare('PRAGMA user_version').get()!.user_version, 5);
  db.close(); repo.close();
});
test('short life expressions are local nonverbal commands and never dictate orb colour', () => {
  for (const [text, kind] of [['뭐해', 'what-doing'], ['배고파', 'hungry'], ['보고싶었어', 'missed']]) {
    const command = parseBabyInput(text)!; assert.equal(command.type, kind);
    const next = advanceBabySocial(initialBabySocial(), 0, true, command);
    const view = socialView(next.state, 'same-orb', true);
    assert.equal(view.caption, ''); assert.equal(view.accepting, true);
    assert.ok(['tilt', 'bounce'].includes(view.motion));
    assert.equal(view.orb.id, 'same-orb');
  }
});
test('one refusal decision drives red orb and input rejection; urgency never changes it', () => {
  let social = initialBabySocial();
  for (let i = 0; i < 3; i++) social = advanceBabySocial(social, i, true, { type: 'touch' }).state;
  const refused = advanceBabySocial(social, 3, true, { type: 'orb' }).state;
  assert.equal(refused.play, null);
  assert.equal(socialView(refused, 'same-orb', true).accepting, false);
  assert.equal(socialView(refused, 'same-orb', false).orb.expression, 'refusal');
  const recovered = advanceBabySocial(refused, social.distanceUntil, true, tick).state;
  assert.equal(socialView(recovered, 'same-orb', true).accepting, true);
  assert.equal(socialView(recovered, 'same-orb', true).orb.expression, 'quiet');
  assert.equal(babyView(initialBabyLife(0), held).attention.level, 2);
  assert.equal(socialView(initialBabySocial(), 'same-orb', true).orb.expression, 'quiet');
  assert.ok(SOCIAL_TIMING.distance > 0);
});
test('painted body reaches every corner at every urgency size, including negative monitor coordinates', () => {
  const area = { x: -1600, y: -300, width: 1440, height: 900 };
  for (const level of [0, 1, 2] as const) {
    const inset = babyBodyInset(level);
    for (const x of [area.x, area.x + area.width]) for (const y of [area.y, area.y + area.height]) {
      const layout = layoutBabyAt({ x, y }, area, level);
      assert.ok(layout.window.x >= area.x && layout.window.x + 420 <= area.x + area.width);
      assert.ok(layout.window.y >= area.y && layout.window.y + 300 <= area.y + area.height);
      assert.equal(layout.visible.x, x === area.x ? area.x : area.x + area.width - inset.width);
      assert.equal(layout.visible.y, y === area.y ? area.y : area.y + area.height - inset.height);
      assert.ok(Math.abs(layout.window.x + layout.position.x + inset.x - layout.visible.x) < 0.001);
    }
  }
  const fallback = layoutBabyAt({ x: -1800, y: -500 }, { x: 0, y: 0, width: 800, height: 600 });
  assert.deepEqual(fallback.visible, { x: 0, y: 0 });
});
test('strong action lasts five seconds; elapsed time cannot escalate and explicit shortening changes next interval', () => {
  const motion = new BabyAttentionMotion();
  assert.equal(motion.step(0, quiet, false), false);
  assert.equal(motion.step(100_000, { ...held, level: 1 }, false), false);
  assert.equal(motion.step(100_000, held, false), true);
  assert.equal(motion.step(104_999, held, false), true);
  assert.equal(motion.step(105_000, held, false), false);
  assert.equal(motion.step(145_000, held, false), false);
  assert.equal(motion.step(145_000, { ...held, intervalSeconds: 45 }, false), true);
  assert.equal(motion.step(146_000, held, true), false, 'drag/hidden/reduced motion stops it');
  assert.equal(motion.step(146_001, held, false), false);
  assert.equal(motion.step(146_001, quiet, false), false);
  assert.equal(motion.step(1_000_000, held, false), true, 'a late observation starts only one five second action');
  assert.equal(motion.step(1_005_000, held, false), false);
});
test('new fields validate without accepting corrupt home, cooldown or sleep data', () => {
  for (const state of [{ ...initialBabyLife(0), home: { x: NaN, y: 0 } },
    { ...initialBabyLife(0), lastMealFinishedElapsedMs: 1 }, { ...initialBabyLife(0), pendingSleepMs: -1 }]) {
    assert.throws(() => validateBabyLife(state), /STATE_INVALID/);
  }
});

test('successful snack receipt eats for 5.5 seconds, survives restart and completes only once before cooldown', t => {
  const directory = seed(t); let now = 0;
  let repo = new BabyLifeRepository(directory, () => now);
  assert.equal(repo.canEatSnack(), true);
  repo.setAttention(held); // schedule changed after the user authorized the successful operation
  repo.beginSnackMeal('test-success-1');
  let view = repo.view(repo.read()!);
  assert.equal(view.behavior, 'eating'); assert.equal(view.meal!.kind, 'snack');
  assert.equal(view.meal!.approachMs, 0); assert.equal(view.meal!.chewMs, 5500);
  assert.equal(repo.read()!.lastMealFinishedElapsedMs, undefined);
  const mealId = view.meal!.id;
  repo.beginSnackMeal('test-success-1'); assert.equal(repo.view(repo.read()!).meal!.id, mealId, 'duplicate start during this meal is harmless');
  repo.close(); now = 5499;
  repo = new BabyLifeRepository(directory, () => now); repo.setAttention(held);
  assert.equal(repo.view(repo.read()!).behavior, 'eating'); assert.equal(repo.read()!.lastMealFinishedElapsedMs, undefined);
  now = 5500; repo.apply(tick);
  assert.equal(repo.view(repo.read()!).meal, null); assert.equal(repo.read()!.lastMealFinishedElapsedMs, 5500);
  repo.apply(tick); repo.close();
  now = 5500 + T.mealGap - 1; repo = new BabyLifeRepository(directory, () => now);
  assert.equal(repo.canEatSnack(), false); now++; assert.equal(repo.canEatSnack(), true);
  repo.beginSnackMeal('test-success-1');
  assert.equal(repo.read()!.meal, null, 'replayed success receipt after restart/completion cannot become a second meal');
  const db = new DatabaseSync(petDatabasePath(directory));
  assert.equal(db.prepare("SELECT COUNT(*) AS n FROM baby_experience WHERE kind='meal_finished'").get()!.n, 1);
  db.close(); repo.close();
});
test('an already successful snack queues behind an in-progress normal meal without discarding either', () => {
  let state = advance(initialBabyLife(0), T.hungry, tick).state;
  state = advance(state, T.hungry, { type: 'feed', offerId: babyView(state).offerId!, x: 200, y: 200, approachMs: 8000 }).state;
  const id = state.meal!.id;
  state = advance(state, T.hungry + 1000, { type: 'snack-begin' }, held).state;
  assert.equal(state.meal!.id, id); assert.equal(state.snackPending, true);
  const foodEnd = advance(state, T.hungry + 13_500, tick, held);
  assert.equal(foodEnd.state.meal!.kind, 'snack'); assert.equal(foodEnd.state.snackPending, false);
  assert.equal(foodEnd.events.filter(e => e.kind === 'meal_finished').length, 1);
  const snackEnd = advance(foodEnd.state, T.hungry + 19_000, tick, held);
  assert.equal(snackEnd.state.meal, null); assert.equal(snackEnd.state.lastMealFinishedElapsedMs, T.hungry + 19_000);
  assert.equal(snackEnd.events.filter(e => e.kind === 'meal_finished').length, 1);
});
