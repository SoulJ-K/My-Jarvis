import assert from 'node:assert/strict';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { DatabaseSync } from 'node:sqlite';
import test from 'node:test';
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

  // The product hatch trigger is still undecided. This explicit test trigger
  // checks coexistence without enabling automatic hatch in the app.
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
