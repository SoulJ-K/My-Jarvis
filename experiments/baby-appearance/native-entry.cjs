const { app, ipcMain, Tray, Menu, nativeImage, screen, BrowserWindow } = require('electron');
const fs = require('node:fs');
const path = require('node:path');
const assert = require('node:assert/strict');
const familyId = process.argv[2];
if (!['leaf','wing'].includes(familyId)) throw new Error('Choose leaf or wing');
const resumeCheck=process.argv.includes('--resume-check');
const check = process.argv.includes('--check')||resumeCheck;
let checkNow = new Date(2026,9,7,12,0,0).getTime();
if(check) Date.now=()=>checkNow;
const root = path.resolve(__dirname,'../..');
const runtime = path.join(root,'.local/appearance-trial/native-runtime');
const parent = path.join(root,'.local/appearance-trial',check?'native-check-data':'native-pets');
fs.mkdirSync(parent,{recursive:true});
if(fs.realpathSync(parent)!==parent) throw new Error('TRIAL_PATH_MUST_NOT_BE_LINKED');
let profile=check?familyId+'-'+process.pid:familyId;
if(resumeCheck){const report=JSON.parse(fs.readFileSync(path.join(root,'.local/appearance-trial/native-checks',familyId+'.json'),'utf8'));profile=report.profile;if(!new RegExp('^'+familyId+'-[0-9]+$').test(profile))throw new Error('INVALID_CHECK_PROFILE');}
const directory=path.join(parent,profile);
fs.mkdirSync(directory,{recursive:true});
if(fs.realpathSync(directory)!==directory) throw new Error('TRIAL_PATH_MUST_NOT_BE_LINKED');
const marker=path.join(directory,'appearance.json');
if(!fs.existsSync(marker)) {
  if(fs.readdirSync(directory).length) throw new Error('UNMARKED_DATA_NOT_ALLOWED');
  fs.writeFileSync(marker,JSON.stringify({kind:'isolated-appearance-trial',family:familyId,version:1})+'\n',{flag:'wx',mode:0o600});
}
assert.deepEqual(JSON.parse(fs.readFileSync(marker,'utf8')),{kind:'isolated-appearance-trial',family:familyId,version:1});
app.setPath('userData',directory); app.setPath('sessionData',directory);
app.setName('Jarvis Pet · 시험 · '+familyId);
if(!app.requestSingleInstanceLock()){app.quit();} else {
  const family=require('./assets.js').find(f=>f.id===familyId),G=require('./geometry.js');
  let pose='stand',view='front';
  const name=familyId==='leaf'?'시험·잎':'시험·날개';
  let tray,petWindow;
  const inset=level=>{const s=G.dimensions(family,pose,73.6,view),scale=1+level/10;return{x:52-s.width*scale/2,y:92-s.height*scale,width:s.width*scale,height:s.height*scale};};
  const appearance={inset,attach(win,change){
    petWindow=win;
    const trusted=e=>e.sender===win.webContents && e.senderFrame===win.webContents.mainFrame && e.senderFrame.url===win.webContents.getURL();
    ipcMain.handle('appearance:read',e=>{if(!trusted(e))throw new Error('DENIED');return{family:familyId};});
    ipcMain.handle('appearance:frame',(e,p,v)=>{
      if(!trusted(e)||!['stand','sit','sleep'].includes(p)||!['front','left','right','head-left','head-right'].includes(v)||p!=='stand'&&v.startsWith('head-'))throw new Error('DENIED');
      if(p!==pose||v!==view)change(()=>{pose=p;view=v;});return true;
    });
    win.once('closed',()=>{ipcMain.removeHandler('appearance:read');ipcMain.removeHandler('appearance:frame');});
  }};
  const load=p=>require(path.join(runtime,p));
  app.whenReady().then(async()=>{
    app.dock?.hide();
    const {LifecycleRepository}=load('src/storage/lifecycle-repository.js');
    const {BabyLifeRepository}=load('src/storage/baby-life-repository.js');
    const {hatchScenes}=load('src/pet/lifecycle.js');
    const lc=new LifecycleRepository(directory,{namePolicy:{trim:true,maxCodePoints:20},developmentTrigger:true});
    let s=lc.read();
    if(s.name===null){
      if(!s.ready)s=lc.apply(s.revision,{type:'prepare'});
      // Only this synthetic fixture skips witnessed animation; no user data is read.
      for(const scene of hatchScenes.slice(s.completed===null?0:hatchScenes.indexOf(s.completed)+1))s=lc.apply(s.revision,{type:'witness',scene});
      s=lc.apply(s.revision,{type:'name',name});
    }
    assert.equal(s.name,name);lc.close();
    const repo=new BabyLifeRepository(directory);
    if(!repo.readHome()){
      const a=screen.getPrimaryDisplay().workArea;
      repo.setHome({x:a.x+a.width*(familyId==='leaf'?.30:.60),y:a.y+a.height*.65});
    }
    repo.close();
    load('src/main/app.js').startJarvis({show:false,appearanceTrial:appearance,onReady:async win=>{
      win.setTitle('Jarvis Pet · '+name);win.webContents.setBackgroundThrottling(false);
      const run=script=>win.webContents.executeJavaScript(script);
      for(let i=0;i<200 && !(await run('Boolean(document.documentElement.dataset.appearanceReady)'));i++)await new Promise(r=>setTimeout(r,25));
      assert.equal(await run('document.documentElement.dataset.appearanceReady'),'true');
      if(check){
        try { if(resumeCheck){const saved=JSON.parse(fs.readFileSync(path.join(root,'.local/appearance-trial/native-checks',familyId+'.json'),'utf8'));const pet=await run('window.petWindow.snapshot()');assert.equal(require('node:crypto').createHash('sha256').update(pet.petId).digest('hex'),saved.identityHash);assert.equal(await run('document.querySelector("#egg").dataset.appearance'),familyId);saved.processRestartRetained=true;fs.writeFileSync(path.join(root,'.local/appearance-trial/native-checks',familyId+'.json'),JSON.stringify(saved,null,2));console.log('RESTART_CHECK_PASSED '+familyId);}else await inspect(win,run,directory,familyId,load,delta=>{checkNow+=delta;}); } catch(error) { console.error("CHECK_FAILED",error.stack); throw error; }
        app.quit();return;
      }
      tray=new Tray(nativeImage.createEmpty());tray.setTitle(name);tray.setToolTip('외형 시험용 · 실제 펫과 별도 저장');
      tray.setContextMenu(Menu.buildFromTemplate([
        {label:name+' · 외형 시험',enabled:false},
        {label:'시험 펫 보이기',click:()=>win.showInactive()},
        {label:'시험 입력창 열기',click:()=>{const p=BrowserWindow.getAllWindows().find(w=>w.webContents.getURL().endsWith('/prompt.html'));p?.show();p?.focus();}},
        {type:'separator'},{label:name+'만 종료',click:()=>app.quit()}
      ]));
      win.showInactive();
      console.log('TRIAL_READY '+familyId+' pid='+process.pid);
    },onFailure:()=>app.exit(1)});
  }).catch(error=>{console.error('TRIAL_FAILED',error.message);app.exit(1);});
  app.on('before-quit',()=>tray?.destroy());
  process.on('SIGTERM',()=>app.quit());
  if(check)setTimeout(()=>{console.error('CHECK_TIMEOUT');app.exit(2);},30000).unref();
}

async function inspect(win,run,directory,id,load,advance){
  const resultDir=path.resolve(__dirname,'../../.local/appearance-trial/native-checks');fs.mkdirSync(resultDir,{recursive:true});
  const errors=[];win.webContents.on('console-message',(_e,level,message)=>{if(level===3)errors.push(message);});
  assert.equal(win.isVisible(),false);assert.equal(win.isFocusable(),false);
  assert.equal(app.getPath('userData'),directory);assert.equal(app.getPath('sessionData'),directory);
  assert.equal(await run('typeof require'),'undefined');
  const identity=await run('window.petWindow.snapshot()');
  assert.equal(identity.name,id==='leaf'?'시험·잎':'시험·날개');
  const pause=ms=>new Promise(r=>setTimeout(r,ms));
  for(const [behavior,delta] of [['resting',0],['drowsy',40*60000],['sleeping',5*60000],['eating',15*60000]]){
    advance(delta);
    let s=await run('window.babyLife.read()');
    if(behavior==='eating'){
      assert.ok(s.offerId);
      s=await run(`window.babyLife.feed(${JSON.stringify(s.offerId)},220,190)`);
      advance(s.meal.approachMs+1);s=await run('window.babyLife.read()');
    }
    assert.equal(s.behavior,behavior);
    await pause(behavior==='eating'?1500:150);
    const p=await run('document.querySelector("#egg").dataset.appearancePose');
    assert.equal(p,behavior==='sleeping'?'sleep':behavior==='drowsy'?'sit':'stand');
    assert.equal(await run('document.querySelector("#emotion-orb").hidden'),false);
    fs.writeFileSync(path.join(resultDir,id+'-'+behavior+'.png'),(await win.webContents.capturePage()).toPNG());
  }
  advance(6000);await run('window.babyLife.read()');
  // Reopen real fixture state after presentation-only probes; identity is never reseeded.
  await win.reload();await pause(700);
  assert.equal((await run('window.petWindow.snapshot()')).petId,identity.petId);
  assert.equal(await run('document.querySelector("#egg").dataset.appearance'),id);
  assert.equal(await run('getComputedStyle(document.querySelector(".shell"),"::after").content'),'none');
  const {babyScreenBounds}=load('src/main/windows.js');
  const actual=await run('(()=>{const r=document.querySelector("canvas.shell").getBoundingClientRect();return{x:r.x,y:r.y,width:r.width,height:r.height};})()');
  const bounds=win.getBounds(),owned=babyScreenBounds(win);
  assert.ok(Math.abs(owned.width-actual.width)<2);assert.ok(Math.abs(owned.height-actual.height)<2);
  assert.ok(Math.abs(owned.x-bounds.x-actual.x)<2);assert.ok(Math.abs(owned.y-bounds.y-actual.y)<2);
  let edgeChecks=0;
  const originalCursor=screen.getCursorScreenPoint;
  let cursor={x:0,y:0};screen.getCursorScreenPoint=()=>cursor;
  try {
    const area=screen.getPrimaryDisplay().workArea;
    for(const x of [0,.5,1])for(const y of [0,.5,1]){
      const start=babyScreenBounds(win);cursor={x:start.x+start.width/2,y:start.y+start.height/2};
      await run('window.petWindow.beginDrag()');await pause(30);
      cursor={x:area.x+(area.width+300)*x-150,y:area.y+(area.height+300)*y-150};
      await run('window.petWindow.moveDrag()');await pause(30);await run('window.petWindow.endDrag()');await pause(80);
      const r=babyScreenBounds(win);
      assert.ok(r.x>=area.x-1 && r.y>=area.y-1 && r.x+r.width<=area.x+area.width+1 && r.y+r.height<=area.y+area.height+1);
      if(x===0)assert.ok(Math.abs(r.x-area.x)<2);
      if(x===1)assert.ok(Math.abs(r.x+r.width-area.x-area.width)<2);
      if(y===0)assert.ok(Math.abs(r.y-area.y)<2);
      if(y===1)assert.ok(Math.abs(r.y+r.height-area.y-area.height)<2);
      const parts=await run(`['canvas.shell','#emotion-orb','#pet-name'].map(s=>{const r=document.querySelector(s).getBoundingClientRect();return{x:r.x,y:r.y,width:r.width,height:r.height};})`);
      for(const r of parts)assert.ok(r.x>=-1&&r.y>=-1&&r.x+r.width<=421&&r.y+r.height<=301);
      assert.ok(!require('./geometry.js').intersects(parts[1],parts[2]));edgeChecks++;
    }
  } finally {screen.getCursorScreenPoint=originalCursor;}
  win.webContents.debugger.attach('1.3');
  await win.webContents.debugger.sendCommand('Emulation.setEmulatedMedia',{features:[{name:'prefers-reduced-motion',value:'reduce'}]});
  await pause(100);
  assert.equal(await run('matchMedia("(prefers-reduced-motion: reduce)").matches'),true);
  assert.equal(await run('getComputedStyle(document.querySelector("canvas.shell")).animationName'),'none');
  assert.equal(await run('document.querySelector("#egg").dataset.facingPhase'),'body');
  win.webContents.debugger.detach();
  const report={family:id,reducedMotion:true,profile:path.basename(directory),identityHash:require('node:crypto').createHash('sha256').update(identity.petId).digest('hex'),edgeChecks,hidden:true,isolatedPaths:true,identityRetained:true,poses:4,orbVisible:true,mouthless:true,geometryMatches:true,errors};
  assert.deepEqual(errors,[]);fs.writeFileSync(path.join(resultDir,id+'.json'),JSON.stringify(report,null,2));console.log(JSON.stringify(report));
}
