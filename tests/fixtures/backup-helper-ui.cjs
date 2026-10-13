// Runs only from the isolated runner. Native pickers are deterministic test
// doubles; all filesystem operations run through the packaged production worker.
const { app }=require('electron');
const fs=require('node:fs');const path=require('node:path');const assert=require('node:assert/strict');
const root=process.env.HELPER_UI_TEST_ROOT;
if(!root || !path.isAbsolute(root))throw new Error('ISOLATED_TEST_REQUIRED');
app.setPath('userData',path.join(root,'helper-user-data'));app.setPath('sessionData',path.join(root,'helper-session'));
const config=JSON.parse(fs.readFileSync(path.join(root,'ui-input.json')));
const {startHelper}=require(path.join(config.payload,'scripts/backup-helper/main.cjs'));
const {runWorker}=require(path.join(config.payload,'scripts/backup-helper/controller.cjs'));
(async()=>{
  let selected={app:config.app,backupParent:root,backup:null,restoreParent:root},revealed=null;
  const {win,controller}=await startHelper({show:false,noSettings:true,choose:async kind=>selected[kind],worker:async(action,options)=> action==='discover'?{apps:[config.app]}:runWorker(action,options),reveal:folder=>{revealed=folder;}});
  const js=code=>win.webContents.executeJavaScript(code);
  const wait=async condition=>{const end=Date.now()+60000;while(!(await js(condition))){if(Date.now()>end)throw new Error('UI_TIMEOUT');await new Promise(r=>setTimeout(r,50));}};
  const capture=async name=>{await new Promise(r=>setTimeout(r,180));fs.writeFileSync(path.join(root,name),(await win.webContents.capturePage()).toPNG());};
  const click=async id=>{await js(`document.getElementById(${JSON.stringify(id)}).click()`);await wait(`document.querySelector('main').getAttribute('aria-busy') === 'false'`);};
  await wait(`document.querySelector('main').getAttribute('aria-busy') === 'false'`);
  assert.equal(win.isVisible(),false);assert.equal(controller.state.app,config.app);
  assert.equal(await js(`document.getElementById('backup-now').disabled`),true);
  await click('choose-backupParent');await click('closed');
  assert.equal(await js(`document.getElementById('backup-now').disabled`),false);
  await capture('ui-ready.png');
  // Open synthetic DB detection goes through actual lsof, then a valid retry.
  const fd=fs.openSync(path.join(config.data,'pet/pet.sqlite3'),'r');
  await click('backup-now');assert.equal(controller.state.error.code,'APP_OR_PROFILE_IN_USE');fs.closeSync(fd);
  assert.equal(await js(`document.getElementById('feedback').dataset.kind`),'error');
  await click('backup-now');assert.equal(controller.state.error,null);assert.equal(controller.state.result.kind,'backup');
  const backup=controller.state.result.folder;assert.equal(fs.existsSync(path.join(backup,'manifest.json')),true);
  await click('reveal');assert.equal(revealed,backup);
  await capture('ui-backup-success.png');
  selected.backup=backup;selected.restoreParent=path.join(backup,'data');
  await click('tab-restore');await click('choose-backup');await click('choose-restoreParent');
  const before=fs.readdirSync(path.join(backup,'data')).sort();
  await click('restore-now');assert.equal(controller.state.error.code,'PATH_OVERLAP');assert.deepEqual(fs.readdirSync(path.join(backup,'data')).sort(),before);
  selected.restoreParent=root;await click('choose-restoreParent');await click('restore-now');
  assert.equal(controller.state.error,null);assert.equal(controller.state.result.kind,'restore');
  const restored=controller.state.result.folder;
  await capture('ui-restored.png');
  assert.equal(await js(`document.getElementById('feedback').dataset.kind`),'success');
  assert.match(await js(`document.getElementById('feedback-title').textContent`),/복원했습니다/);
  assert.equal(await js(`typeof require`),'undefined');
  assert.equal(await js(`document.querySelectorAll('input[type="text"]').length`),0);
  await assert.rejects(js(`window.backupHelper.send('backupNow', '/injected/path')`));
  // Native minimum size and larger text remain scrollable without clipping.
  win.setSize(540,600);win.webContents.setZoomFactor(1.25);
  await new Promise(r=>setTimeout(r,100));
  assert.equal(await js(`document.documentElement.scrollWidth <= innerWidth`),true);
  await capture('ui-small-large-text.png');
  fs.writeFileSync(path.join(root,'ui-result.json'),JSON.stringify({passed:true,backup,restored,hidden:true,nativePickers:'mocked',checks:14},null,2),{flag:'wx'});
  win.destroy();app.exit(0);
})().catch(error=>{console.error(error.stack);app.exit(1);});
