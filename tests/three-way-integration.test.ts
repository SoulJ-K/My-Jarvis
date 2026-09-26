import assert from 'node:assert/strict';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { DatabaseSync } from 'node:sqlite';
import test from 'node:test';
import { spawnSync } from 'node:child_process';
import { BABY_TIMING, cycle } from '../src/pet/baby-life';
import type { BabyPresentation } from '../src/pet/baby-life';
import type { Lifecycle } from '../src/pet/lifecycle';
import type { TimerView } from '../src/shared/timer';
import type { ScheduleRecord } from '../src/shared/schedule';
import { ReminderService } from '../src/assistant/reminders';
import { TimerService } from '../src/assistant/timer';
import { hatchScenes } from '../src/pet/lifecycle';
import { openEggLife } from '../src/storage/egg-life-repository';
import { LifecycleRepository } from '../src/storage/lifecycle-repository';
import { loadOrCreateEgg, petDatabasePath } from '../src/storage/pet-repository';
import { ScheduleRepository } from '../src/storage/schedule-repository';
import { TimerRepository } from '../src/storage/timer-repository';

test('one local pet keeps care, timer and reminder through hatch and restart', t => {
  const directory = mkdtempSync(path.join(tmpdir(), 'jarvis-three-way-'));
  t.after(() => rmSync(directory, { recursive: true, force: true }));
  const identity = loadOrCreateEgg(directory);
  const egg = openEggLife(directory);
  egg.care('stroke');
  egg.close();

  const now = Date.now();
  const clock = { wall: () => now, monotonic: () => 0 };
  const timer = new TimerService(new TimerRepository(directory), clock, () => {}, () => {});
  assert.equal(timer.submit('timer-one', '5분 타이머').ok, true);
  timer.dispose();

  const schedules = new ReminderService(new ScheduleRepository(directory), () => now, undefined, () => {});
  const preview = schedules.preview('reminder-one', '내일 15:00 리마인더 서류 확인');
  assert.equal(preview.ok, true);
  assert.equal(schedules.confirm('reminder-one').ok, true);
  schedules.dispose();

  // Keep the explicit test seed for this coexistence check; product readiness
  // and its approved elapsed/care policy are covered separately.
  const lifecycle = new LifecycleRepository(directory, {
    namePolicy: { trim: true, maxCodePoints: 20 }, developmentTrigger: true,
  });
  let state = lifecycle.apply(0, { type: 'prepare' });
  for (const scene of hatchScenes) state = lifecycle.apply(state.revision, { type: 'witness', scene });
  state = lifecycle.apply(state.revision, { type: 'name', name: '별' });
  assert.equal(state.petId, identity.petId);
  lifecycle.close();

  assert.deepEqual(loadOrCreateEgg(directory), { ...identity, stage: 'baby' });
  const reopened = new LifecycleRepository(directory, { namePolicy: { trim: true, maxCodePoints: 20 } });
  assert.equal(reopened.read().name, '별');
  reopened.close();
  const restoredTimer = new TimerService(new TimerRepository(directory), clock, () => {}, () => {});
  assert.equal(restoredTimer.views().filter(row => row.status === 'pending').length, 1);
  restoredTimer.dispose();
  const restoredSchedule = new ReminderService(new ScheduleRepository(directory), () => now, undefined, () => {});
  assert.equal(restoredSchedule.views().find(row => row.id === 'reminder-one')?.content, '서류 확인');
  restoredSchedule.dispose();
  const db = new DatabaseSync(petDatabasePath(directory), { readOnly: true });
  assert.equal(db.prepare('SELECT count(*) AS n FROM egg_care').get()?.n, 1);
  assert.deepEqual(db.prepare('PRAGMA foreign_key_check').all(), []);
  db.close();
});

interface ContinuityResult {
  pet: { petId: string; stage: string; name?: string };
  lifecycle: Lifecycle;
  baby: BabyPresentation | null;
  timers: TimerView[];
  schedules: ScheduleRecord[];
  rendered: string;
  care: Record<string, unknown>[];
  experiences: { id: number; kind: string; at_ms: number; duration_ms: number | null }[];
  socialExperiences: { id: number; kind: string; at_ms: number }[];
  body: { snapshot: string }[];
  social: { snapshot: string }[];
  notices: number;
}
// Each call boots the real entry file in a fresh Electron process. Only its clock,
// native notifications, visibility and temporary userData are test controlled.
function offlineLaunch(directory: string, action: string, now: number): ContinuityResult {
  const env = { ...process.env }; delete env.ELECTRON_RUN_AS_NODE;
  const result = spawnSync(process.execPath,
    [path.join(__dirname, 'fixtures/schedule-runner.js'), directory, `continuity-${action}`, String(now)],
    { env, encoding: 'utf8', timeout: 20000 });
  assert.equal(result.status, 0, `${action}: ${result.error?.message ?? ''}\n${result.stderr}`);
  const line = result.stdout.split('\n').find(line => line.startsWith('CONTINUITY_READY:'));
  assert.ok(line, result.stdout);
  return JSON.parse(line.slice('CONTINUITY_READY:'.length));
}
function continuityDirectory(t: test.TestContext) {
  const directory = mkdtempSync(path.join(tmpdir(), 'jarvis-offline-continuity-'));
  t.after(() => rmSync(directory, { recursive: true, force: true }));
  return directory;
}

test('offline production restarts preserve egg care, witnessed hatch, baby experiences and all three inboxes', t => {
  const directory = continuityDirectory(t);
  // Device-local noon keeps the current provisional day/night behavior deterministic.
  const start = new Date(2026, 8, 26, 12).getTime();
  const egg = offlineLaunch(directory, 'register', start);
  assert.equal(egg.pet.stage, 'egg');
  assert.equal(egg.care.length, 1);
  assert.equal(egg.timers.length, 1);
  assert.deepEqual(egg.schedules.map(row => row.id).sort(), ['alarm', 'reminder']);
  assert.equal(egg.notices, 0);
  const samePending = (restored: ContinuityResult) => {
    assert.equal(restored.pet.petId, egg.pet.petId);
    assert.deepEqual(restored.care, egg.care);
    assert.deepEqual(restored.timers, egg.timers);
    assert.deepEqual(restored.schedules, egg.schedules);
    assert.equal(restored.notices, 0);
  };
  const restoredEgg = offlineLaunch(directory, 'inspect', start);
  samePending(restoredEgg);
  assert.deepEqual(restoredEgg.lifecycle, egg.lifecycle);

  // Seed readiness explicitly; this is not a product trigger or a readiness policy test.
  const seed = new LifecycleRepository(directory, {
    namePolicy: { trim: true, maxCodePoints: 20 }, developmentTrigger: true,
  });
  let state = seed.apply(egg.lifecycle.revision, { type: 'prepare' }); seed.close();
  for (const step of [...hatchScenes, 'naming']) {
    const paused = offlineLaunch(directory, 'inspect', start);
    samePending(paused);
    assert.deepEqual(paused.lifecycle, state, 'an unwitnessed/hidden scene must not advance');
    const advanced = offlineLaunch(directory, 'step', start);
    samePending(advanced);
    assert.equal(advanced.lifecycle.revision, state.revision + 1);
    if (step !== 'naming') assert.equal(advanced.lifecycle.completed, step);
    state = advanced.lifecycle;
  }
  assert.equal(state.name, '별');
  const praised = offlineLaunch(directory, 'praise', start);
  samePending(praised);
  assert.equal(praised.pet.name, '별');
  assert.deepEqual(praised.socialExperiences.map(row => row.kind), ['praise']);
  const restoredPraise = offlineLaunch(directory, 'inspect', start);
  assert.deepEqual(restoredPraise.social, praised.social);
  assert.deepEqual(restoredPraise.body, praised.body);
  assert.deepEqual(restoredPraise.socialExperiences, praised.socialExperiences);

  const mealAt = start + BABY_TIMING.hungry;
  const meal = offlineLaunch(directory, 'feed', mealAt);
  assert.equal(meal.baby?.behavior, 'approaching');
  assert.deepEqual(meal.experiences.map(row => row.kind), ['food_offered']);
  const eating = offlineLaunch(directory, 'inspect', mealAt + BABY_TIMING.approach);
  assert.equal(eating.baby?.behavior, 'eating');
  const finished = offlineLaunch(directory, 'inspect', mealAt + BABY_TIMING.meal);
  assert.equal(finished.baby?.behavior, 'resting');
  assert.deepEqual(finished.experiences.map(row => row.kind), ['food_offered', 'meal_finished']);

  // The missed timer, alarm and reminder all coexist with a sleeping baby.
  const sleeping = offlineLaunch(directory, 'inspect', start + BABY_TIMING.awake);
  assert.equal(sleeping.baby?.behavior, 'sleeping');
  for (const row of [...sleeping.timers, ...sleeping.schedules]) {
    assert.equal(row.status, 'due');
    assert.equal(row.reason, 'recovered');
    assert.equal(row.systemDelivery, 'not-requested');
    assert.equal(row.appDisplayed, false);
  }
  assert.equal(sleeping.timers.length + sleeping.schedules.length, 3);
  assert.match(sleeping.rendered, /재시작 후 복원/);
  assert.match(sleeping.rendered, /서류 확인/);

  // A synthetic three-day absence exercises recovery, not real multi-day usage.
  const later = start + 72 * cycle;
  const returned = offlineLaunch(directory, 'inspect', later);
  const repeated = offlineLaunch(directory, 'inspect', later);
  assert.equal(returned.pet.petId, egg.pet.petId);
  assert.equal(returned.pet.stage, 'baby');
  assert.equal(returned.pet.name, '별');
  assert.deepEqual(returned.care, egg.care);
  assert.deepEqual(returned.socialExperiences, praised.socialExperiences);
  assert.deepEqual(returned.experiences.map(row => row.kind), ['food_offered', 'meal_finished', 'sleep_completed']);
  assert.equal(returned.experiences[2].duration_ms, 72 * BABY_TIMING.sleep);
  assert.deepEqual(repeated.experiences, returned.experiences, 'reopening cannot duplicate meal or sleep history');
  assert.deepEqual(repeated.social, returned.social);
  assert.deepEqual(repeated.timers, sleeping.timers);
  assert.deepEqual(repeated.schedules, sleeping.schedules);
  assert.equal(returned.notices + repeated.notices + sleeping.notices + meal.notices, 0);
  offlineLaunch(directory, 'ack', later);
  const acknowledged = offlineLaunch(directory, 'inspect', later);
  assert.deepEqual(acknowledged.timers, []);
  assert.deepEqual(acknowledged.schedules, []);
  assert.deepEqual(acknowledged.experiences, returned.experiences);
  assert.deepEqual(acknowledged.socialExperiences, returned.socialExperiences);
});

test('offline native delivery failures survive a process restart until acknowledgement without resending', t => {
  const directory = continuityDirectory(t);
  const start = new Date(2026, 8, 26, 12).getTime();
  const registered = offlineLaunch(directory, 'register', start);
  const failed = offlineLaunch(directory, 'deliver', start);
  assert.equal(failed.notices, 3, 'one simulated native failure for each kind');
  for (const row of [...failed.timers, ...failed.schedules]) {
    assert.equal(row.status, 'due');
    assert.equal(row.systemDelivery, 'failed');
    assert.equal(row.reason, 'on-time');
    assert.equal(row.appDisplayed, false);
  }
  assert.match(failed.rendered, /시스템 알림 실패/);
  const restored = offlineLaunch(directory, 'inspect', start + 300000);
  assert.deepEqual(restored.timers, failed.timers);
  assert.deepEqual(restored.schedules, failed.schedules);
  assert.deepEqual(restored.care, registered.care);
  assert.equal(restored.pet.petId, registered.pet.petId);
  assert.equal(restored.notices, 0);
  offlineLaunch(directory, 'ack', start + 300000);
  const acknowledged = offlineLaunch(directory, 'inspect', start + 300000);
  assert.deepEqual(acknowledged.timers, []);
  assert.deepEqual(acknowledged.schedules, []);
  assert.equal(acknowledged.notices, 0);
});
