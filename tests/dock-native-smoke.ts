// Isolated hidden windows only: no drag injection, file selection or trash access.
import assert from 'node:assert/strict';
import {app,BrowserWindow} from 'electron';
import {mkdtempSync,rmSync} from 'node:fs';
import {tmpdir} from 'node:os';
import path from 'node:path';
import {dockSnackHelperPath,type DockNativeBridge} from '../src/main/dock-snack';
const directory=mkdtempSync(path.join(tmpdir(),'jarvis-dock-native-check-'));
app.setPath('userData',directory);app.setPath('sessionData',directory);
app.on('window-all-closed',()=>{});
app.on('quit',()=>rmSync(directory,{recursive:true,force:true,maxRetries:3,retryDelay:100}));
const timeout=setTimeout(()=>app.exit(2),15000);
app.whenReady().then(async()=>{
 app.dock?.hide();
 const native:DockNativeBridge=require(dockSnackHelperPath(path.resolve('.')));
 assert.equal(native.selfTest(),true);
 const first=new BrowserWindow({show:false,webPreferences:{sandbox:true}});
 const second=new BrowserWindow({show:false,webPreferences:{sandbox:true}});
 try {
  for(const value of [Buffer.alloc(0),Buffer.alloc(4),Buffer.alloc(8),Buffer.alloc(8,255)]) assert.throws(()=>native.attach(value));
  const a=native.attach(first.getNativeWindowHandle());
  assert(Number.isSafeInteger(a)&&a>0);
  assert.throws(()=>native.attach(first.getNativeWindowHandle()));
  const b=native.attach(second.getNativeWindowHandle());assert.notEqual(a,b);
  assert.throws(()=>native.start(a,'{}',()=>{}));
  assert.throws(()=>native.start(a,'not JSON',()=>{}));
  const request={protocolVersion:1,requestId:'synthetic-only',imagePNGBase64:'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+/lS0AAAAASUVORK5CYII=',width:100,height:80,hotSpotX:20,hotSpotY:30};
  const result=await new Promise<Record<string,unknown>>((resolve,reject)=>{
   const wait=setTimeout(()=>reject(Error('NATIVE_CALLBACK_TIMEOUT')),2500);
   native.start(a,JSON.stringify(request),text=>{clearTimeout(wait);resolve(JSON.parse(text));});
  });
  assert.equal(result.event,'failed');assert.equal(result.reason,'missing-mouse-down');
  assert.equal(first.getOpacity(),1);assert.equal(first.isVisible(),false);
  native.cancel(a);native.dispose(a);native.dispose(a);
  assert.throws(()=>native.start(a,JSON.stringify(request),()=>{}));
  const again=native.attach(first.getNativeWindowHandle());assert.notEqual(again,a);
  first.destroy();assert.throws(()=>native.start(again,JSON.stringify(request),()=>{}));native.dispose(again);
  native.dispose(b);second.destroy();
  console.log('PASS: native module load/self-test, trusted handle matching, two-window isolation, duplicate attach, missing real mouse-down, callback, opacity, close/dispose and reattach');
  clearTimeout(timeout);app.quit();
 }finally{if(!first.isDestroyed())first.destroy();if(!second.isDestroyed())second.destroy();}
}).catch(error=>{console.error('DOCK_NATIVE_CHECK_FAILED',error);clearTimeout(timeout);app.exit(1);});
