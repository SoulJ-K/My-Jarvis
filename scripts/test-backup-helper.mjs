import * as fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawnSync, execFileSync } from 'node:child_process';
const root=fileURLToPath(new URL('../',import.meta.url));
fs.mkdirSync(path.join(root,'.local'),{recursive:true});
const run=fs.realpathSync.native(fs.mkdtempSync(path.join(root,'.local/backup-helper-validation-')));
const project=path.join(run,'project');fs.mkdirSync(project);fs.mkdirSync(path.join(run,'tmp'));
for(const folder of ['src','scripts','tests'])fs.cpSync(path.join(root,folder),path.join(project,folder),{recursive:true,force:false,errorOnExist:true});
for(const file of ['package.json','tsconfig.json'])fs.copyFileSync(path.join(root,file),path.join(project,file));
fs.symlinkSync(path.join(root,'node_modules'),path.join(project,'node_modules'));
console.log('시험 위치: '+run);
const env={...process.env,TMPDIR:path.join(run,'tmp')+'/',HELPER_UI_TEST_ROOT:run};delete env.ELECTRON_RUN_AS_NODE;
function check(label,binary,args){
 const out=fs.openSync(path.join(run,label+'.stdout.log'),'wx'),err=fs.openSync(path.join(run,label+'.stderr.log'),'wx');
 const result=spawnSync(binary,args,{cwd:project,env,stdio:['ignore',out,err],timeout:180000});fs.closeSync(out);fs.closeSync(err);
 fs.writeFileSync(path.join(run,label+'.result.json'),JSON.stringify({code:result.status,signal:result.signal,error:result.error?.code??null}),{flag:'wx'});
 console.log(label+': '+(result.status===0?'통과':'실패'));
 if(result.status!==0)throw new Error(label+' FAILED');
}
check('build','npm',['run','build']);
check('controller',process.execPath,['--test','tests/backup-helper.test.cjs']);
// Seed and package inside the copy: never overwrite original dist/out.
const setup=`
import * as fs from 'node:fs';import path from 'node:path';import {createRequire} from 'node:module';import {execFileSync} from 'node:child_process';
import {packageBackupHelper} from './scripts/package-backup-helper.mjs';
import {installedLauncher,inventory} from './scripts/lib/manual-backup.mjs';
const require=createRequire(import.meta.url),root=process.env.HELPER_UI_TEST_ROOT,data=path.join(root,'synthetic-data');fs.mkdirSync(data);
require('./dist/tests/fixtures/backup-seed.js').seedProfile(data);
const app=path.join(root,'Synthetic Pet.app'),payload=path.join(app,'Contents/Resources/app');
for(const folder of ['Contents/MacOS','Contents/Frameworks','Contents/Resources/app/dist/src/main','Contents/Resources/app/dist/src/renderer'])fs.mkdirSync(path.join(app,folder),{recursive:true});
fs.copyFileSync('/bin/echo',path.join(app,'Contents/MacOS/Jarvis Pet'));
fs.writeFileSync(path.join(app,'Contents/Info.plist'),'<?xml version="1.0"?><plist version="1.0"><dict><key>CFBundleExecutable</key><string>Jarvis Pet</string><key>CFBundleIdentifier</key><string>local.jarvispet.companion.aaaaaaaaaaaaaaaaaaaaaaaa</string><key>CFBundlePackageType</key><string>APPL</string></dict></plist>');
fs.writeFileSync(path.join(payload,'package.json'),JSON.stringify({name:'my-jarvis',version:'0.1.0',main:'launch.cjs'}));fs.writeFileSync(path.join(payload,'launch.cjs'),installedLauncher(data));
for(const f of ['main/index.js','main/app.js','renderer/index.html','renderer/styles.css'])fs.writeFileSync(path.join(payload,'dist/src',f),'synthetic appearance');
execFileSync('/usr/bin/codesign',['--force','--deep','--sign','-',app],{stdio:'pipe'});
const helper=packageBackupHelper();
fs.writeFileSync(path.join(root,'ui-input.json'),JSON.stringify({...helper,app,data}));
fs.writeFileSync(path.join(root,'source-before.json'),JSON.stringify({data:inventory(data),app:inventory(app)}));
`;
fs.writeFileSync(path.join(project,'helper-setup.mjs'),setup,{flag:'wx'});check('package',process.execPath,['helper-setup.mjs']);
const electron=JSON.parse(execFileSync(process.execPath,['-e',"console.log(JSON.stringify(require('electron')))"],{cwd:root,encoding:'utf8'}));
check('ui',electron,['tests/fixtures/backup-helper-ui.cjs']);
const verify=`import * as fs from 'node:fs';import path from 'node:path';import assert from 'node:assert/strict';import {inventory,verifyBackup,inspectApplication} from './scripts/lib/manual-backup.mjs';
const root=process.env.HELPER_UI_TEST_ROOT,input=JSON.parse(fs.readFileSync(path.join(root,'ui-input.json'))),result=JSON.parse(fs.readFileSync(path.join(root,'ui-result.json'))),before=JSON.parse(fs.readFileSync(path.join(root,'source-before.json')));
assert.deepEqual(inventory(input.data),before.data);assert.deepEqual(inventory(input.app),before.app);verifyBackup(result.backup);
assert.deepEqual(inventory(path.join(result.restored,'data')),before.data);assert.equal(inspectApplication(path.join(result.restored,'Jarvis Pet.app')).data,path.join(result.restored,'data'));
console.log('원본 보존, 백업 유효성, 복원 자료 일치, 복원 앱 연결 통과');`;
fs.writeFileSync(path.join(project,'helper-verify.mjs'),verify,{flag:'wx'});check('preservation',process.execPath,['helper-verify.mjs']);
