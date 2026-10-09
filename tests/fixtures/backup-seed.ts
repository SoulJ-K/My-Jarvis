import assert from 'node:assert/strict';
import { openEggLife } from '../../src/storage/egg-life-repository';
import { LifecycleRepository } from '../../src/storage/lifecycle-repository';
import { BabyLifeRepository } from '../../src/storage/baby-life-repository';
import { TimerRepository } from '../../src/storage/timer-repository';
import { ScheduleRepository } from '../../src/storage/schedule-repository';
import { FollowupRepository } from '../../src/storage/followup-repository';
import { FollowupService } from '../../src/assistant/followup';
import { hatchScenes, type HatchScene } from '../../src/pet/lifecycle';
import { babyView, BABY_TIMING, cycle } from '../../src/pet/baby-life';

/** Only newly-created test directories are supplied by backup-restore.test.ts. */
export type SeedStage = 'egg' | 'baby' | { completed: HatchScene | null };
export function seedProfile(directory: string, stage: SeedStage = 'baby') {
  let now = Date.UTC(2026, 9, 10, 3);
  const originalNow = Date.now;
  Date.now = () => now;
  try {
    const egg = openEggLife(directory, () => now);
    try { egg.care('touch'); now += 1000; egg.care('stroke'); } finally { egg.close(); }
    const lifecycle = new LifecycleRepository(directory, { namePolicy: { trim: true, maxCodePoints: 20 }, developmentTrigger: true });
    // Upgrade while still an egg so naming and initial life/social commit together.
    new BabyLifeRepository(directory, () => now).close();
    try {
      if (stage !== 'egg') {
        let state = lifecycle.apply(lifecycle.read().revision, { type: 'prepare' });
        const scenes = stage === 'baby' ? hatchScenes : hatchScenes.slice(0, stage.completed === null ? 0 : hatchScenes.indexOf(stage.completed) + 1);
        for (const scene of scenes) state = lifecycle.apply(state.revision, { type: 'witness', scene });
        if (stage === 'baby') lifecycle.apply(state.revision, { type: 'name', name: '복구시험별' });
      }
    } finally { lifecycle.close(); }
    if (stage === 'baby') {
      const baby = new BabyLifeRepository(directory, () => now);
      try {
        baby.apply({ type: 'touch' }); baby.apply({ type: 'praise' });
        now += BABY_TIMING.hungry;
        const hungry = baby.apply({ type: 'tick' });
        const offerId = babyView(hungry).offerId; assert.ok(offerId);
        baby.apply({ type: 'feed', offerId, x: 116, y: 146, approachMs: BABY_TIMING.approachMin });
        now += BABY_TIMING.approachMin + BABY_TIMING.chew;
        baby.apply({ type: 'tick' });
        now += cycle;
        baby.apply({ type: 'tick' }); baby.setHome({ x: 300, y: 300 });
      } finally { baby.close(); }
    }
    now = Math.ceil(now / 60000) * 60000;
    const timers = new TimerRepository(directory), schedules = new ScheduleRepository(directory);
    const followups = new FollowupService(new FollowupRepository(directory), () => now);
    try {
      for (const kind of ['timer', 'alarm', 'reminder'] as const) {
        for (const state of ['future', 'overdue', 'unanswered', 'receipt', 'done', 'cancelled', 'snoozed', 'repeated', 'legacy', 'requested']) {
          const id = `${kind}-${state}`;
          const dueAt = state === 'future' ? now + 86400000 : state === 'overdue' ? now + 60000 : now - 60000;
          const startedAt = now - 120000;
          const store = kind === 'timer' ? timers : schedules;
          if (kind === 'timer') timers.insert(id, startedAt, dueAt - startedAt, id, state === 'future' ? 'hidden' : 'default');
          else schedules.insert({ id, kind, content: id, dueAt, localDateTime: new Date(dueAt).toISOString().slice(0, 16).replace('T', ' '), timeZone: 'UTC', utcOffsetMinutes: 0 }, startedAt);
          if (state === 'future' || state === 'overdue') continue;
          store.due(id, 'on-time'); store.delivery(id, state === 'requested' ? 'requested' : 'shown'); store.displayed(id);
          const key = { kind, id };
          followups.register({ ...key, title: id, dueAt }, { legacyAcknowledged: state === 'legacy' });
          if (state === 'receipt' || state === 'legacy') store.acknowledge(id);
          if (state === 'receipt') followups.acknowledge(key);
          if (state === 'done') followups.done(key, 0);
          if (state === 'cancelled') { store.cancel(id); followups.cancel(key); }
          if (state === 'snoozed' || state === 'repeated') followups.notYet(key, 0, 300000);
          if (state === 'requested') followups.delivery(key, 0, 'requested');
        }
      }
      // A genuinely repeated postponement and its history, not fabricated JSON.
      now += 300000;
      for (const notice of followups.tick()) followups.delivery(notice, notice.round, 'shown');
      for (const kind of ['timer', 'alarm', 'reminder'] as const) {
        for (const state of ['snoozed', 'repeated']) {
          const key = { kind, id: `${kind}-${state}` };
          followups.notYet(key, 1, state === 'snoozed' ? 1800000 : 300000);
        }
        // Make this item expire only while the source application is closed.
        if (kind === 'timer') {
          timers.cancel('timer-overdue');
          timers.insert('timer-offline', now, 60000, '합성 종료 중 타이머');
        } else {
          schedules.cancel(`${kind}-overdue`);
          const dueAt = now + 60000;
          schedules.insert({ id: `${kind}-offline`, kind, content: '합성 종료 중 일정', dueAt,
            localDateTime: new Date(dueAt).toISOString().slice(0, 16).replace('T', ' '), timeZone: 'UTC', utcOffsetMinutes: 0 }, now);
        }
      }
      timers.insert('timer-paused', now, 300000, '합성 정지 타이머', 'pinned');
      timers.pause('timer-paused', 180000);
      return now;
    } finally { timers.close(); schedules.close(); followups.dispose(); }
  } finally { Date.now = originalNow; }
}
