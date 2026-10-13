const test = require('node:test');
const assert = require('node:assert/strict');
const { BackupController } = require('../scripts/backup-helper/controller.cjs');
test('confirmation, cancelled pickers, unknown operations and untrusted errors preserve state', async () => {
  let writes=0;
  const c=new BackupController({ choose:async()=>null, worker:async()=>{ writes++;return {}; },initialApp:'/synthetic/Pet.app' });
  c.state.backupParent='/synthetic/output';
  assert.equal((await c.dispatch('backupNow',false)).error.code,'CONFIRM_CLEAN_EXIT_REQUIRED');
  assert.equal(writes,0);
  await c.dispatch('app');assert.equal(c.state.app,'/synthetic/Pet.app');
  assert.equal((await c.dispatch('anything','/arbitrary')).error.code,'UNKNOWN_ACTION');
  c.worker=async()=>{throw new Error('private personal value');};
  const failed=await c.dispatch('backupNow',true);assert.equal(failed.error.code,'OPERATION_FAILED');assert.ok(!JSON.stringify(failed).includes('private personal'));
});
test('concurrent backup clicks perform only one operation and retain main-owned destination', async () => {
  let finish,calls=0;
  const c=new BackupController({choose:async()=>null,initialApp:'/synthetic/Pet.app',worker:async(action,options)=>{calls++;assert.equal(action,'backup');assert.match(options.to,/^\/synthetic\/output\/Jarvis-백업-/);await new Promise(r=>{finish=r;});return {backup:options.to};}});
  c.state.backupParent='/synthetic/output';const first=c.dispatch('backupNow',true);
  assert.equal((await c.dispatch('backupNow',true)).busy,true);assert.equal(calls,1);finish();await first;
  assert.equal(c.state.result.kind,'backup');assert.equal(c.state.busy,false);
});
test('multiple running apps are not guessed and cancelled restore selection does not write', async()=>{
  const c=new BackupController({choose:async()=>null,worker:async()=>({apps:['/a.app','/b.app']})});
  await c.dispatch('initialize');assert.equal(c.state.app,null);assert.match(c.state.notice,/여러 개/);
  await c.dispatch('backup');assert.equal(c.state.backup,null);
  assert.equal((await c.dispatch('restoreNow')).error.code,'SELECTION_REQUIRED');
});
