import assert from 'node:assert/strict';
import test from 'node:test';
import * as fs from 'node:fs';
import path from 'node:path';
import { createHash } from 'node:crypto';
import { createRequire, syncBuiltinESMExports } from 'node:module';
import { spawn, spawnSync, execFileSync } from 'node:child_process';
import { once } from 'node:events';
import { DatabaseSync } from 'node:sqlite';
import { installedLauncher, inspectApplication, backupApplication, verifyBackup, restoreApplication, inventory, stores } from '../scripts/lib/manual-backup.mjs';
const require = createRequire(import.meta.url);
const { seedProfile } = require('../dist/tests/fixtures/backup-seed.js');
const { readProfile } = require('../dist/tests/fixtures/backup-profile.js');
const root = process.env.MANUAL_BACKUP_TEST_ROOT;
assert.ok(root && path.isAbsolute(root), 'Use scripts/test-manual-backup.mjs for isolation');
const digest = file => createHash('sha256').update(fs.readFileSync(file)).digest('hex');
function allBytes(dir) {
  const out = {};
  function walk(p) {
    for (const name of fs.readdirSync(p).sort()) {
      const file = path.join(p, name), key = path.relative(dir, file), stat = fs.lstatSync(file);
      if (stat.isDirectory()) { out[key] = 'dir'; walk(file); }
      else out[key] = stat.isSymbolicLink() ? ['link', fs.readlinkSync(file)] : digest(file);
    }
  }
  walk(dir); return out;
}
function sign(app) { execFileSync('/usr/bin/codesign', ['--force','--deep','--sign','-',app], { stdio: 'pipe' }); }
function fixture() {
  const dir = fs.mkdtempSync(path.join(root, 'case-'));
  const data = path.join(dir, 'data'); fs.mkdirSync(data); const now = seedProfile(data);
  const app = path.join(dir, 'Source.app'), payload = path.join(app, 'Contents/Resources/app');
  fs.mkdirSync(path.join(payload, 'dist/src/main'), { recursive: true });
  fs.mkdirSync(path.join(payload, 'dist/src/renderer'), { recursive: true });
  fs.mkdirSync(path.join(app, 'Contents/MacOS'), { recursive: true });
  fs.mkdirSync(path.join(app, 'Contents/Frameworks'), { recursive: true });
  // Small signed fixture for filesystem tests; NOT used for Electron assertions.
  fs.copyFileSync('/bin/echo', path.join(app, 'Contents/MacOS/Jarvis Pet'));
  const id = 'local.jarvispet.companion.' + 'a'.repeat(24);
  fs.writeFileSync(path.join(app, 'Contents/Info.plist'), `<?xml version="1.0"?><plist version="1.0"><dict><key>CFBundleExecutable</key><string>Jarvis Pet</string><key>CFBundleIdentifier</key><string>${id}</string><key>CFBundleName</key><string>Jarvis Pet</string><key>CFBundlePackageType</key><string>APPL</string></dict></plist>`);
  fs.writeFileSync(path.join(payload, 'package.json'), JSON.stringify({ name: 'my-jarvis', version: '0.1.0', main: 'launch.cjs' }));
  fs.writeFileSync(path.join(payload, 'launch.cjs'), installedLauncher(data));
  for (const f of ['dist/src/main/index.js','dist/src/main/app.js','dist/src/renderer/index.html','dist/src/renderer/styles.css']) fs.writeFileSync(path.join(payload, f), '// synthetic fixture');
  fs.copyFileSync(process.env.MANUAL_BACKUP_ASSET, path.join(payload, 'dist/src/renderer/retained-appearance.png'));
  sign(app);
  return { dir, data, app, payload, now, backup: path.join(dir, 'backup'), restored: path.join(dir, 'restored') };
}
const save = f => backupApplication({ app: f.app, to: f.backup, confirmClosed: true });
const copy = (a,b) => fs.cpSync(a,b,{recursive:true,force:false,errorOnExist:true,verbatimSymlinks:true});

test('manual backup preserves profile, complete signed app and appearance; restore rebinds only a new copy', () => {
  const f = fixture(), initial = allBytes(f.data), code = inventory(f.app);
  assert.equal(inspectApplication(f.app).data, f.data); save(f);
  assert.deepEqual(verifyBackup(f.backup).manifest.profileFiles, JSON.parse(fs.readFileSync(path.join(f.backup,'manifest.json'))).profileFiles);
  const saved = allBytes(f.backup);
  const r = restoreApplication({backup:f.backup,to:f.restored});
  assert.equal(r.launched,false); assert.deepEqual(readProfile(r.data),readProfile(f.data));
  assert.equal(inspectApplication(r.app).data,r.data);
  assert.notEqual(inspectApplication(r.app).bundleId,inspectApplication(f.app).bundleId);
  assert.equal(digest(path.join(r.app,'Contents/Resources/app/dist/src/renderer/retained-appearance.png')),digest(path.join(f.payload,'dist/src/renderer/retained-appearance.png')));
  assert.deepEqual(allBytes(f.backup),saved);assert.deepEqual(allBytes(f.data),initial);assert.deepEqual(inventory(f.app),code);
  assert.equal(fs.statSync(f.backup).mode & 0o777,0o700);
  // A restored app can be backed up again, with its new path, without old data.
  backupApplication({app:r.app,to:path.join(f.dir,'second-backup'),confirmClosed:true});
});

test('Finder view metadata in the source or an opened backup does not block verify or restore', () => {
  const f=fixture(),expected=readProfile(f.data);fs.writeFileSync(path.join(f.data,'pet/.DS_Store'),'finder');save(f);
  assert.ok(!fs.existsSync(path.join(f.backup,'data/pet/.DS_Store')));
  for(const file of ['.DS_Store','data/.DS_Store','data/pet/.DS_Store','data/assistant/.DS_Store'])fs.writeFileSync(path.join(f.backup,file),'finder');
  const saved=allBytes(f.backup);verifyBackup(f.backup);
  const r=restoreApplication({backup:f.backup,to:f.restored});assert.deepEqual(readProfile(r.data),expected);
  assert.ok(!fs.existsSync(path.join(r.data,'pet/.DS_Store')));assert.deepEqual(allBytes(f.backup),saved);
  fs.writeFileSync(path.join(f.backup,'data/unknown.json'),'preserve');assert.throws(()=>verifyBackup(f.backup));
});

test('every overlap rejection preserves the input tree and permits a separate valid retry', () => {
  const f=fixture();save(f);
  const alias=path.join(f.dir,'alias');fs.symlinkSync(f.data,alias);
  const store=path.join(f.dir,'store');fs.symlinkSync(path.join(f.data,'pet'),store);
  const bakAlias=path.join(f.dir,'backup-alias');fs.symlinkSync(path.join(f.backup,'data/pet'),bakAlias);
  const cases=[
    [()=>backupApplication({app:f.app,to:path.join(f.data,'nested'),confirmClosed:true})],
    [()=>backupApplication({app:f.app,to:`${store}/../nested`,confirmClosed:true})],
    [()=>backupApplication({app:f.app,to:path.join(alias,'nested'),confirmClosed:true})],
    [()=>backupApplication({app:f.app,to:path.join(f.app,'nested'),confirmClosed:true})],
    [()=>backupApplication({app:f.app,to:f.dir,confirmClosed:true})],
    [()=>restoreApplication({backup:f.backup,to:path.join(f.backup,'data/nested')})],
    [()=>restoreApplication({backup:f.backup,to:`${bakAlias}/../../nested`})],
    [()=>restoreApplication({backup:f.backup,to:path.join(f.data,'nested')})],
    [()=>restoreApplication({backup:f.backup,to:path.join(f.app,'nested')})],
  ];
  for (const [i,[attempt]] of cases.entries()) {
    const before=allBytes(f.dir);assert.throws(attempt,/PATH_OVERLAP/);assert.deepEqual(allBytes(f.dir),before);
    const r=restoreApplication({backup:f.backup,to:path.join(f.dir,'retry-'+i)});assert.deepEqual(readProfile(r.data),readProfile(f.data));
  }
});

test('missing parents, existing destinations and links fail without changing any input', () => {
  const f=fixture();save(f);
  for (const kind of ['empty','file','link','dangling','missing-parent']) {
    const target=path.join(f.dir,kind);
    if(kind==='empty')fs.mkdirSync(target);
    if(kind==='file')fs.writeFileSync(target,'keep');
    if(kind==='link')fs.symlinkSync(path.join(f.dir,'file'),target);
    if(kind==='dangling')fs.symlinkSync(path.join(f.dir,'never-created'),target);
    const to=kind==='missing-parent'?path.join(target,'new'):target,before=allBytes(f.dir);
    assert.throws(()=>backupApplication({app:f.app,to,confirmClosed:true}));
    assert.throws(()=>restoreApplication({backup:f.backup,to}));assert.deepEqual(allBytes(f.dir),before);
  }
});

test('normal-exit confirmation and open-file rejection precede copying', async () => {
  const f=fixture(),before=allBytes(f.dir);
  assert.throws(()=>backupApplication({app:f.app,to:f.backup}),/CONFIRM_CLEAN_EXIT_REQUIRED/);
  const child=spawn(process.execPath,['-e',`const fs=require('node:fs');fs.openSync(process.argv[1],'r');console.log('READY');setInterval(()=>{},1000);`,path.join(f.data,stores[0][0])],{stdio:['ignore','pipe','pipe']});
  try { await once(child.stdout,'data');assert.throws(()=>save(f),/APP_OR_PROFILE_IN_USE/);assert.deepEqual(allBytes(f.dir),before); }
  finally { const exited=once(child,'exit');child.kill('SIGTERM');await exited; }
  save(f);
});

test('missing, empty, corrupt, unsupported and foreign DBs preserve their source and create no target', () => {
  const f=fixture();
  for(const [file] of stores) for(const damage of ['missing','empty','corrupt','future','foreign']) {
    const original=fs.readFileSync(path.join(f.data,file));
    try {
      if(damage==='missing')fs.unlinkSync(path.join(f.data,file));
      else if(['empty','corrupt'].includes(damage))fs.writeFileSync(path.join(f.data,file),damage==='empty'?'':'synthetic damaged data');
      else {const db=new DatabaseSync(path.join(f.data,file));try{db.exec(damage==='future'?'PRAGMA user_version=999':'PRAGMA application_id=0')}finally{db.close()}}
      const before=allBytes(f.dir);assert.throws(()=>save(f));assert.deepEqual(allBytes(f.dir),before);
    } finally {fs.writeFileSync(path.join(f.data,file),original);}
  }
});

test('unknown state, external appearance, SQLite sidecars and links are never silently omitted', () => {
  const f=fixture();
  for(const file of ['unknown.json','appearance.json','SingletonLock','pet/pet.sqlite3-wal','pet/pet.sqlite3-shm','pet/pet.sqlite3-journal']) {
    fs.writeFileSync(path.join(f.data,file),'preserve');const before=allBytes(f.dir);
    assert.throws(()=>save(f));assert.deepEqual(allBytes(f.dir),before);fs.unlinkSync(path.join(f.data,file));
  }
  const data=fs.readFileSync(path.join(f.data,stores[0][0]));fs.unlinkSync(path.join(f.data,stores[0][0]));
  const outside=path.join(f.dir,'outside.sqlite3');fs.writeFileSync(outside,data);fs.symlinkSync(outside,path.join(f.data,stores[0][0]));
  const before=allBytes(f.dir);assert.throws(()=>save(f),/REGULAR_FILE_REQUIRED/);assert.deepEqual(allBytes(f.dir),before);
});

test('manifest, data, or appearance damage rejects restore without touching the backup or original', () => {
  const f=fixture();save(f);
  for(const damage of ['manifest-null','manifest-version','manifest-path','missing-db','altered-db','altered-art','incomplete']) {
    const b=path.join(f.dir,damage);copy(f.backup,b);const m=path.join(b,'manifest.json');
    if(damage==='manifest-null')fs.writeFileSync(m,'null');
    if(damage==='manifest-version'){const v=JSON.parse(fs.readFileSync(m));v.version=999;fs.writeFileSync(m,JSON.stringify(v));}
    if(damage==='manifest-path'){const v=JSON.parse(fs.readFileSync(m));v.profileFiles['../../escape']='x';fs.writeFileSync(m,JSON.stringify(v));}
    if(damage==='missing-db')fs.unlinkSync(path.join(b,'data',stores[3][0]));
    if(damage==='altered-db'){const db=new DatabaseSync(path.join(b,'data',stores[1][0]));try{db.exec("UPDATE timers SET title='synthetic altered'")}finally{db.close()}}
    if(damage==='altered-art')fs.appendFileSync(path.join(b,'Jarvis Pet.app/Contents/Resources/app/dist/src/renderer/retained-appearance.png'),'altered');
    if(damage==='incomplete')fs.writeFileSync(path.join(b,'INCOMPLETE'),'interrupted');
    const before=allBytes(f.dir);assert.throws(()=>restoreApplication({backup:b,to:b+'-restore'}));assert.deepEqual(allBytes(f.dir),before);
  }
});

test('unsupported launcher and external application links stop before profile access or copying', () => {
  const f=fixture(), launch=path.join(f.payload,'launch.cjs'),original=fs.readFileSync(launch);
  fs.writeFileSync(launch,original+'\n// unknown external appearance setup\n');sign(f.app);
  const before=allBytes(f.dir);assert.throws(()=>save(f),/UNSUPPORTED_LAUNCHER/);assert.deepEqual(allBytes(f.dir),before);
  fs.writeFileSync(launch,original);fs.symlinkSync(f.data,path.join(f.payload,'external'));sign(f.app);
  const after=allBytes(f.dir);
  assert.throws(()=>inventory(f.app),/EXTERNAL_APP_LINK/);
  assert.throws(()=>save(f),/APP_SIGNATURE_INVALID|EXTERNAL_APP_LINK/);assert.deepEqual(allBytes(f.dir),after);
});

test('CLI failures do not leak SQLite rows, private names, SQL or full stack traces', () => {
  const f=fixture();fs.writeFileSync(path.join(f.data,'pet/pet.sqlite3'),'PRIVATE_SYNTHETIC_SENTINEL');
  const result=spawnSync(process.execPath,['scripts/pet-backup.mjs','backup','--app',f.app,'--to',f.backup,'--confirm-closed'],{encoding:'utf8'});
  assert.equal(result.status,1);assert.doesNotMatch(result.stdout+result.stderr,/PRIVATE_SYNTHETIC_SENTINEL|복구시험별|\n\s+at /);
  assert.ok(!fs.existsSync(f.backup));
});

test('an interrupted copy marks only the new target incomplete and preserves both inputs', t => {
  const f=fixture();save(f);const original=allBytes(f.data),app=inventory(f.app),saved=allBytes(f.backup);
  const nativeFs=require('node:fs'),originalCopy=nativeFs.copyFileSync;
  for(const operation of ['backup','restore']) {
    const to=path.join(f.dir,operation+'-interrupted');let count=0;
    const injected=t.mock.method(nativeFs,'copyFileSync',(...args)=>{if(++count===2)throw new Error('SYNTHETIC_COPY_FAILURE');return originalCopy(...args);});
    syncBuiltinESMExports();
    try {assert.throws(()=>operation==='backup'?backupApplication({app:f.app,to,confirmClosed:true}):restoreApplication({backup:f.backup,to}),/SYNTHETIC_COPY_FAILURE/);}
    finally {injected.mock.restore();syncBuiltinESMExports();}
    assert.ok(fs.existsSync(path.join(to,'INCOMPLETE')));assert.throws(()=>verifyBackup(to),/BACKUP_INCOMPLETE/);
    assert.deepEqual(allBytes(f.data),original);assert.deepEqual(inventory(f.app),app);assert.deepEqual(allBytes(f.backup),saved);
  }
});

test('failed signing leaves a marked new restore and preserves the archived app and source', t => {
  const f=fixture();save(f);const data=allBytes(f.data),app=inventory(f.app),backup=allBytes(f.backup);
  const childProcess=require('node:child_process'),originalSpawn=childProcess.spawnSync;
  const injected=t.mock.method(childProcess,'spawnSync',(binary,args,options)=>
    binary==='/usr/bin/codesign'&&args.includes('--force')?{status:1,stdout:'',stderr:'synthetic failure'}:originalSpawn(binary,args,options));
  syncBuiltinESMExports();
  try {assert.throws(()=>restoreApplication({backup:f.backup,to:f.restored}),/RESTORED_APP_SIGN_FAILED/);}
  finally {injected.mock.restore();syncBuiltinESMExports();}
  assert.ok(fs.existsSync(path.join(f.restored,'INCOMPLETE')));
  assert.deepEqual(allBytes(f.data),data);assert.deepEqual(inventory(f.app),app);assert.deepEqual(allBytes(f.backup),backup);
});

test('public CLI backs up, verifies and restores without leaking the pet or task contents', () => {
  const f=fixture();
  for(const args of [
    ['inspect','--app',f.app],
    ['backup','--app',f.app,'--to',f.backup,'--confirm-closed'],
    ['verify','--backup',f.backup],
    ['restore','--backup',f.backup,'--to',f.restored],
  ]) {
    const r=spawnSync(process.execPath,['scripts/pet-backup.mjs',...args],{encoding:'utf8'});
    assert.equal(r.status,0,r.stderr);assert.doesNotMatch(r.stdout,/복구시험별|합성 종료 중|timer-future/);
    assert.ok(JSON.parse(r.stdout));
  }
  assert.deepEqual(readProfile(path.join(f.restored,'data')),readProfile(f.data));
});

test('real Electron bundle restores same pet and bundled appearance, runs twice from new data path without registration', async () => {
  const dir=fs.mkdtempSync(path.join(root,'real-bundle-')),data=path.join(dir,'source-data');fs.mkdirSync(data);
  const now=seedProfile(data);
  const {packageMac}=await import('../scripts/package-mac.mjs');
  const packaged=packageMac({existingDataDirectory:data});
  // Packaged Electron ignores an alternate script argument. Install a test-only
  // hook IN this synthetic bundle before starting it, so its normal launcher
  // still performs the real path binding and no visible app can start by mistake.
  fs.copyFileSync(path.resolve('tests/fixtures/manual-backup-app-check.cjs'),path.join(packaged.payload,'manual-check.cjs'));
  const entry=path.join(packaged.payload,'dist/src/main/index.js');
  fs.writeFileSync(entry,"require('../../../manual-check.cjs');\n"+fs.readFileSync(entry,'utf8'));
  const renderer=path.join(packaged.payload,'dist/src/renderer');
  fs.copyFileSync(process.env.MANUAL_BACKUP_ASSET,path.join(renderer,'retained-appearance.png'));
  const html=path.join(renderer,'index.html');fs.writeFileSync(html,fs.readFileSync(html,'utf8').replace('</body>','<img id="backup-art" alt="" src="retained-appearance.png" width="1" height="1" hidden></body>'));sign(packaged.bundle);
  function launch(app,data,label) {
    const info=inspectApplication(app);
    const env={...process.env,MANUAL_BACKUP_EXPECTED_DATA:data,MANUAL_BACKUP_TIME:String(now)};delete env.ELECTRON_RUN_AS_NODE;
    const r=spawnSync(info.executable,[],{encoding:'utf8',env,timeout:25000});
    fs.writeFileSync(path.join(dir,label+'.stdout.log'),r.stdout??'',{flag:'wx'});fs.writeFileSync(path.join(dir,label+'.stderr.log'),r.stderr??'',{flag:'wx'});
    assert.equal(r.error,undefined);assert.equal(r.status,0, r.stderr);
    assert.match(r.stdout,/MANUAL_APP_READY/);assert.match(r.stdout,/MANUAL_APP_CLEAN_EXIT/);
  }
  function readSessionProfile(directory) {
    // The old synthetic reader intentionally rejects Chromium caches. Read its
    // DB-only private copy; keep the actual packaged-session tree untouched.
    const scratch=fs.mkdtempSync(path.join(dir,'read-'));
    for(const folder of ['pet','assistant'])copy(path.join(directory,folder),path.join(scratch,folder));
    return readProfile(scratch);
  }
  launch(packaged.bundle,data,'source');const before=readSessionProfile(data);
  const sourceData=allBytes(data),sourceApp=inventory(packaged.bundle),backup=path.join(dir,'backup');
  backupApplication({app:packaged.bundle,to:backup,confirmClosed:true});const saved=inventory(backup);
  const restored=restoreApplication({backup,to:path.join(dir,'restored')});assert.deepEqual(readProfile(restored.data),before);
  launch(restored.app,restored.data,'restored-first');const first=readSessionProfile(restored.data);
  launch(restored.app,restored.data,'restored-second');assert.deepEqual(readSessionProfile(restored.data),first);
  assert.deepEqual(first.pet,before.pet);assert.deepEqual(first.care,before.care);
  assert.deepEqual(first.followups,before.followups);assert.deepEqual(first.timers,before.timers);assert.deepEqual(first.schedules,before.schedules);
  assert.deepEqual(inventory(backup),saved);assert.deepEqual(allBytes(data),sourceData);assert.deepEqual(inventory(packaged.bundle),sourceApp);
});
