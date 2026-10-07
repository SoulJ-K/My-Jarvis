const test = require('node:test');
const assert = require('node:assert/strict');
const Facing = require('./facing');
function setup(reduced = false, idle = false) {
  const timers = new Map(), changes = []; let id = 0;
  const facing = new Facing(d => changes.push(d), {
    reduced: () => reduced,
    idleLooks: () => idle,
    schedule: (fn, delay) => { timers.set(++id, { fn, delay }); return id; },
    unschedule: i => timers.delete(i)
  });
  return { facing, timers, changes, flush: () => { const tasks = [...timers.values()]; timers.clear(); tasks.forEach(t => t.fn()); } };
}
test('starts front, ignores jitter, and follows each horizontal travel direction', () => {
  const { facing, timers } = setup(); assert.equal(facing.direction, 'front');
  facing.begin(); facing.move(2); facing.move(-2); facing.move(2); assert.equal(facing.direction, 'front');
  facing.move(3); assert.equal(facing.direction, 'right');
  facing.move(-5); assert.equal(facing.direction, 'left');
  assert.equal(timers.size, 0, 'never returns front during held drag');
});
test('travel looks with head first, turns body, then permits movement; interrupted turns never move', () => {
  const { facing, timers, flush } = setup(); let started = 0;
  facing.travel(-100, () => started++);
  assert.equal(facing.phase, 'head'); assert.equal(facing.direction, 'left'); assert.equal(started, 0);
  assert.equal([...timers.values()][0].delay, 180);
  flush(); assert.equal(facing.phase, 'body'); assert.equal(started, 1);
  facing.travel(100, () => started++); const stale = [...timers.values()][0];
  facing.pose(true); stale.fn(); assert.equal(started, 1); assert.equal(facing.sleeping, true);
});
test('food and orb retain attention across stop; rest and travel cannot steal it accidentally', () => {
  const { facing, flush } = setup(); facing.focus('food', -100); flush(); facing.stop();
  assert.equal(facing.activity, 'food'); assert.equal(facing.direction, 'left');
  assert.equal(facing.travel(100, () => assert.fail()), false);
  facing.begin(); assert.equal(facing.focus('orb', 100), false); facing.move(50); facing.stop(); flush();
  assert.equal(facing.activity, 'food'); assert.equal(facing.direction, 'left');
  facing.rest(); facing.focus('orb', 100); flush(); assert.equal(facing.direction, 'right');
  facing.pose(true); assert.equal(facing.focus('food', -100), false);
});
test('idle looks are occasional and cancel when focus starts; reduced motion has none', () => {
  const { facing, timers, flush } = setup(false, true); facing.rest();
  assert.equal([...timers.values()][0].delay, 12000); flush();
  assert.equal(facing.direction, 'left'); assert.equal(facing.phase, 'head');
  const old = [...timers.values()][0]; assert.equal(old.delay, 850);
  facing.focus('orb', 100); old.fn(); flush(); assert.equal(facing.direction, 'right');
  const reduced = setup(true, true); reduced.facing.rest(); assert.equal(reduced.timers.size, 0);
  let started = false; reduced.facing.travel(-20, () => started = true);
  assert.equal(started, true); assert.equal(reduced.facing.phase, 'body');
});
test('stop waits 250ms, returns front once, and stale timers cannot override new drag', () => {
  const { facing, timers, flush } = setup();
  facing.move(-8); facing.stop(); assert.equal(facing.direction, 'left');
  const stale = [...timers.values()][0]; assert.equal(stale.delay, 250);
  facing.begin(); facing.move(8); stale.fn(); assert.equal(facing.direction, 'right');
  facing.stop(); flush(); assert.equal(facing.direction, 'front'); assert.equal(timers.size, 0);
});
test('sleep cancels look-back; dragging sleeping baby never wakes or turns it', () => {
  const { facing, flush, timers } = setup(); facing.move(-8); facing.stop();
  facing.pose(true); facing.begin(); facing.move(-50); facing.stop(); flush();
  assert.equal(facing.direction, 'right'); assert.equal(timers.size, 0);
  facing.select('front'); assert.equal(facing.direction, 'right');
  facing.pose(false); assert.equal(facing.direction, 'front');
});
test('reduced motion removes delayed look-back; manual views stay until new movement', () => {
  const { facing, timers } = setup(true); facing.move(-10); facing.stop();
  assert.equal(facing.direction, 'front'); assert.equal(timers.size, 0);
  facing.select('left'); assert.equal(facing.direction, 'left'); assert.equal(timers.size, 0);
  facing.select('invalid'); assert.equal(facing.direction, 'left');
  facing.dispose(); assert.equal(timers.size, 0);
});
