import assert from 'node:assert/strict';
import { test } from 'node:test';
import { EggBrain, EGG_REACTION_MS, type BrainClock } from '../src/pet/brain';
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
