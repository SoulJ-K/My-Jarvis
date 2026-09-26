import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import test from 'node:test';
import { DatabaseSync } from 'node:sqlite';
import { scheduleDatabasePath } from '../src/storage/schedule-repository';

function launch(directory: string, mode: string) {
  const env = {...process.env}; delete env.ELECTRON_RUN_AS_NODE;
  const result = spawnSync(process.execPath,[path.join(__dirname,'fixtures/schedule-runner.js'),directory,mode],{env,encoding:'utf8',timeout:20000});
  assert.equal(result.status,0,result.stderr);
  const line = result.stdout.split('\n').find(line => line.startsWith('SCHEDULE_READY:'));
  assert.ok(line,result.stdout); return JSON.parse(line.slice('SCHEDULE_READY:'.length));
}
function directory(t: test.TestContext) {
  const value = mkdtempSync(path.join(tmpdir(),'jarvis-schedule-restart-'));
  t.after(() => rmSync(value,{recursive:true,force:true})); return value;
}
test('production app restores two confirmed schedules with same egg then persists cancellation', t => {
  const dir = directory(t); const first = launch(dir,'register'); assert.equal(first.reply.ok,true); assert.equal(first.after.length,2);
  const restored = launch(dir,'inspect'); assert.equal(restored.petId,first.petId); assert.deepEqual(restored.after,first.after);
  assert.equal(launch(dir,'cancel').reply.ok,true); assert.deepEqual(launch(dir,'inspect').after,[]);
});
test('production app recovers overdue schedules in UI without OS requests and persists acknowledgement', t => {
  const dir = directory(t); launch(dir,'register');
  const db = new DatabaseSync(scheduleDatabasePath(dir));
  const due = Math.floor((Date.now()-60000)/60000)*60000;
  db.prepare('UPDATE schedules SET due_at=?,created_at=?,local_date_time=?,time_zone=?,utc_offset_minutes=0')
    .run(due,due-3600000,new Date(due).toISOString().slice(0,16).replace('T',' '),'UTC'); db.close();
  const restored = launch(dir,'inspect'); assert.equal(restored.after.length,2);
  for (const row of restored.after) { assert.equal(row.reason,'recovered'); assert.equal(row.systemDelivery,'not-requested'); assert.equal(row.appDisplayed,false); }
  assert.match(restored.rendered,/재시작 후 복원/); assert.match(restored.rendered,/서류 확인/);
  assert.equal(launch(dir,'inspect').after.length,2);
  launch(dir,'ack'); assert.deepEqual(launch(dir,'inspect').after,[]);
});
