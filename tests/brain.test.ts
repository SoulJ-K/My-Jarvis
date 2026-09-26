import assert from 'node:assert/strict';
import { test } from 'node:test';
import { BabyReturnBrain, BABY_RETURN_TIMING as R, EggBrain, EGG_REACTION_MS, type BrainClock } from '../src/pet/brain';
import type { EggSnapshot } from '../src/shared/pet-state';

class ManualClock implements BrainClock {
  now = 0;
  tasks = new Map<number, { due: number; callback: () => void }>();
  private nextId = 0;
  after(milliseconds: number, callback: () => void) {
    const id = ++this.nextId;
    this.tasks.set(id, { due: this.now + milliseconds, callback });
    return () => { this.tasks.delete(id); };
  }
  advance(milliseconds: number) {
    this.now += milliseconds;
    for (const [id, task] of this.tasks) {
      if (task.due > this.now) continue;
      this.tasks.delete(id);
      task.callback();
    }
  }
}

test('click reacts immediately, returns to rest once, and accepts another click', () => {
  const clock = new ManualClock();
  const seen: EggSnapshot[] = [];
  const brain = new EggBrain(clock, state => seen.push(state));
  assert.equal(brain.snapshot().behavior, 'idle');
  assert.equal(clock.tasks.size, 0);
  brain.touch();
  assert.equal(brain.snapshot().behavior, 'reacting');
  clock.advance(EGG_REACTION_MS - 1);
  assert.equal(brain.snapshot().behavior, 'reacting');
  clock.advance(1);
  assert.equal(brain.snapshot().behavior, 'idle');
  assert.deepEqual(seen.map(state => state.behavior), ['reacting', 'idle']);
  clock.advance(60_000);
  assert.equal(seen.length, 2);
  brain.touch();
  assert.equal(brain.snapshot().behavior, 'reacting');
});

test('repeated clicks do not queue reactions or extend the current deadline', () => {
  const clock = new ManualClock();
  const seen: EggSnapshot[] = [];
  const brain = new EggBrain(clock, state => seen.push(state));
  brain.touch();
  clock.advance(EGG_REACTION_MS - 1);
  for (let i = 0; i < 100; i++) brain.touch();
  assert.equal(clock.tasks.size, 1);
  clock.advance(1);
  assert.equal(brain.snapshot().behavior, 'idle');
  assert.deepEqual(seen.map(state => state.revision), [1, 2]);
});

test('published/read snapshots cannot mutate brain state', () => {
  const clock = new ManualClock();
  const brain = new EggBrain(clock, state => { state.behavior = 'idle'; state.revision = 999; });
  brain.touch();
  const copy = brain.snapshot();
  copy.behavior = 'idle';
  copy.revision = 1000;
  assert.deepEqual(brain.snapshot(), { behavior: 'reacting', revision: 1 });
});

test('closing the owner cancels pending work and ignores future touches', () => {
  const clock = new ManualClock();
  const seen: EggSnapshot[] = [];
  const brain = new EggBrain(clock, state => seen.push(state));
  brain.touch();
  brain.dispose();
  brain.dispose();
  assert.equal(clock.tasks.size, 0);
  clock.advance(60_000);
  brain.touch();
  assert.equal(seen.length, 1);
});

test('stroke gives its own short response without queueing other care', () => {
  const clock = new ManualClock();
  const brain = new EggBrain(clock, () => {});
  brain.touch('stroke');
  assert.equal(brain.snapshot().behavior, 'soothed');
  brain.touch();
  brain.touch('stroke');
  assert.equal(brain.snapshot().revision, 1);
  clock.advance(EGG_REACTION_MS);
  assert.equal(brain.snapshot().behavior, 'idle');
});

test('baby restart gap greets once for four seconds without extending on reads', () => {
  const brain = new BabyReturnBrain(0);
  assert.equal(brain.observe(R.absence, true), true);
  assert.equal(brain.observe(R.absence + R.reaction - 1, true), true);
  assert.equal(brain.observe(R.absence + R.reaction, true), false);
  assert.equal(brain.observe(R.absence + R.reaction, true), false);
  assert.equal(brain.observe(0, true), false);
  assert.equal(new BabyReturnBrain(0).observe(R.absence - 1, true), false);
  assert.equal(new BabyReturnBrain(null).observe(R.absence * 10, true), false, 'first baby appearance is not a return');
});

test('continuous hidden/locked ticks wait for visible return, never greet in background', () => {
  const brain = new BabyReturnBrain(0);
  assert.equal(brain.observe(0, true), false);
  assert.equal(brain.observe(1, false), false);
  assert.equal(brain.observe(R.absence, false), false);
  assert.equal(brain.observe(R.absence + 1, true), true);
  assert.equal(brain.observe(R.absence + 2, false), false);
  assert.equal(brain.observe(R.absence + 3, true), false);
});

test('system idle detects a long absence despite uninterrupted life ticks', () => {
  const brain = new BabyReturnBrain(0);
  for (let now = 0; now < R.absence; now += 1000) assert.equal(brain.observe(now, true, now), false);
  assert.equal(brain.observe(R.absence, true, R.absence), false);
  assert.equal(brain.observe(R.absence + 1000, true, 0), true);
  assert.equal(brain.observe(R.absence + 5000, true, 0), false);
  assert.throws(() => brain.observe(NaN, true), /CLOCK_INVALID/);
});
