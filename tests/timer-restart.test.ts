import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import test from 'node:test';
import { DatabaseSync } from 'node:sqlite';
import { timerDatabasePath } from '../src/storage/timer-repository';
import { petDatabasePath } from '../src/storage/pet-repository';
function launch(directory: string, mode: string) {
  const env = {...process.env}; delete env.ELECTRON_RUN_AS_NODE;
  const result = spawnSync(process.execPath,[path.join(__dirname,'fixtures/timer-runner.js'),directory,mode],{env,encoding:'utf8',timeout:20000});
  assert.equal(result.status,0,result.stderr);
  const line = result.stdout.split('\n').find(line => line.startsWith('TIMER_READY:'));
  assert.ok(line,result.stdout); return JSON.parse(line.slice('TIMER_READY:'.length));
}
function directory(t: test.TestContext) {
  const value = mkdtempSync(path.join(tmpdir(),'jarvis-timer-restart-'));
  t.after(() => rmSync(value,{recursive:true,force:true})); return value;
}
function petIdentityAndCare(directory: string) {
  const db = new DatabaseSync(petDatabasePath(directory), { readOnly: true });
  try {
    return {
      pet: db.prepare('SELECT pet_id, created_at, stage FROM pet').all(),
      care: db.prepare('SELECT kind, occurred_at_ms, elapsed_ms FROM egg_care ORDER BY id').all(),
    };
  } finally { db.close(); }
}
test('production entry registers, quits, restores same timer, cancels, quits and restores cancellation', t => {
  const dir = directory(t); const first = launch(dir,'register'); assert.equal(first.reply.ok,true);
  // The integrated app checkpoints egg elapsed time on each launch. Timer actions
  // must leave the egg identity and care events unchanged, not its raw DB bytes.
  const pet = petIdentityAndCare(dir);
  const restored = launch(dir,'inspect');
  assert.equal(restored.after[0].id,first.after[0].id);
  assert.equal(restored.after[0].dueAt,first.after[0].dueAt);
  assert.equal(restored.after[0].status,'pending');
  assert.equal(launch(dir,'cancel').reply.ok,true);
  assert.deepEqual(launch(dir,'inspect').after,[]);
  assert.deepEqual(petIdentityAndCare(dir), pet);
});
test('integrated app keeps one egg care event while timer is saved, restored and cancelled', t => {
  const dir = directory(t);
  const first = launch(dir, 'care-and-timer');
  assert.equal(first.reply.ok, true);
  assert.equal(first.careCount, 1);
  const restored = launch(dir, 'inspect');
  assert.equal(restored.petId, first.petId);
  assert.equal(restored.careCount, 1);
  assert.equal(restored.after[0].id, first.after[0].id);
  assert.equal(restored.after[0].dueAt, first.after[0].dueAt);
  assert.equal(launch(dir, 'cancel').reply.ok, true);
  const final = launch(dir, 'inspect');
  assert.equal(final.petId, first.petId);
  assert.equal(final.careCount, 1);
  assert.deepEqual(final.after, []);
});
test('production restart recovers overdue inbox with no OS request and persists user acknowledgement', t => {
  const dir = directory(t); launch(dir,'register');
  const db = new DatabaseSync(timerDatabasePath(dir));
  const now = Date.now();
  db.prepare('UPDATE timers SET started_at=?,due_at=?').run(now-360000,now-60000); db.close();
  const restored = launch(dir,'inspect'); assert.equal(restored.after[0].reason,'recovered');
  assert.equal(restored.after[0].systemDelivery,'not-requested');
  assert.equal(restored.after[0].appDisplayed,false); // Hidden test window is not shown.
  assert.equal(launch(dir,'inspect').after.length,1);
  launch(dir,'ack'); assert.equal(launch(dir,'inspect').after.length,0);
});

test('persisted delivery failure is restored in real Electron UI until acknowledged', t => {
  const dir = directory(t); launch(dir,'register');
  const db = new DatabaseSync(timerDatabasePath(dir));
  db.exec("UPDATE timers SET status='due',reason='on-time',system_delivery='failed',app_displayed=1"); db.close();
  const restored = launch(dir,'inspect');
  assert.equal(restored.after[0].status,'due');
  assert.equal(restored.after[0].systemDelivery,'failed');
  assert.match(restored.rendered,/시스템 알림 실패/);
  assert.equal(restored.after[0].appDisplayed,true);
  assert.equal(launch(dir,'inspect').after[0].systemDelivery,'failed');
  launch(dir,'ack'); assert.equal(launch(dir,'inspect').after.length,0);
});
