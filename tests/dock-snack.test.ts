import assert from 'node:assert/strict';
import test from 'node:test';
import { DockSnackController, dockSnackHelperPath, validDockSnackImage, type DockSnackDiagnostic, type DockNativeBridge } from '../src/main/dock-snack';
const image = {imagePNGBase64:'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+/lS0AAAAASUVORK5CYII=',width:100,height:80,hotSpotX:20,hotSpotY:30};
const point={x:-800,y:1200};
function fakeBridge() {
 let receive:(event:string)=>void=()=>{};
 let request:Record<string,unknown>={};
 let attaches=0,starts=0,cancels=0,disposes=0;
 const bridge:DockNativeBridge={
  attach(handle){assert.equal(handle.length,8);attaches++;return 7;},
  start(token,payload,callback){assert.equal(token,7);starts++;request=JSON.parse(payload);receive=callback;},
  cancel(token){assert.equal(token,7);cancels++;},dispose(token){assert.equal(token,7);disposes++;},selfTest(){return true;}
 };
 return {bridge,event:(event:string,extra:Record<string,unknown>={})=>receive(JSON.stringify({protocolVersion:1,requestId:request.requestId,event,...extra})),raw:(line:string)=>receive(line),
 get request(){return request;},get counts(){return {attaches,starts,cancels,disposes};}};
}
function controller(extra:{timeoutMs?:number;platform?:NodeJS.Platform;onDiagnostic?:(v:DockSnackDiagnostic)=>void}={}) {
 const f=fakeBridge();return {f,c:new DockSnackController({helperPath:'/synthetic/drag.node',nativeHandle:Buffer.alloc(8),platform:'darwin',bridge:f.bridge,...extra})};
}

test('native window attaches before the first gesture; started then delete requests selection once',async()=>{
 const {f,c}=controller();assert.equal(f.counts.attaches,1);assert.equal(f.counts.starts,0);
 let starts=0;const result=c.start(image,()=>{starts++;});
 assert.equal(f.request.imagePNGBase64,image.imagePNGBase64);
 f.event('started');assert.equal(starts,1);
 f.event('ended',{operation:'delete',screenPoint:point});
 assert.deepEqual(await result,{kind:'snack-requested',screenPoint:point});
 f.event('ended',{operation:'delete',screenPoint:point});assert.equal(starts,1);
 assert.equal(f.counts.cancels,0);c.dispose();assert.equal(f.counts.disposes,1);
});
test('ordinary drop or Escape cancellation preserves endpoint without selecting files',async()=>{
 const {f,c}=controller();const r=c.start(image);f.event('started');f.event('ended',{operation:'none',screenPoint:point});
 assert.deepEqual(await r,{kind:'cancelled',screenPoint:point});c.dispose();
});
test('unsupported platform and missing module fail without attaching or launching a process',async()=>{
 const {f,c}=controller({platform:'linux'});assert.equal(f.counts.attaches,0);
 assert.deepEqual(await c.start(image),{kind:'unavailable',reason:'not-macos'});
 const missing=new DockSnackController({helperPath:'/synthetic/missing.node',nativeHandle:Buffer.alloc(8),platform:'darwin'});
 assert.deepEqual(await missing.start(image),{kind:'unavailable',reason:'native-unavailable'});
});
test('native handles and attach failures are validated before any gesture',async()=>{
 const f=fakeBridge();
 for(const handle of [Buffer.alloc(0),Buffer.alloc(4),Buffer.alloc(9)]) {
  const c=new DockSnackController({helperPath:'/synthetic/drag.node',nativeHandle:handle,bridge:f.bridge,platform:'darwin'});
  assert.equal((await c.start(image)).kind,'unavailable');
 }
 assert.equal(f.counts.attaches,0);
 const c=new DockSnackController({helperPath:'/synthetic/drag.node',nativeHandle:Buffer.alloc(8),platform:'darwin',bridge:{...f.bridge,attach(){throw Error('private diagnostic');}}});
 assert.deepEqual(await c.start(image),{kind:'unavailable',reason:'native-unavailable'});
});
test('PNG and logical image dimensions are bounded without a UI decoder',()=>{
 assert.equal(validDockSnackImage(image),true);
 for(const value of [null,[],{},{...image,extra:'path'},{...image,width:NaN},{...image,width:1025},{...image,height:0},{...image,hotSpotY:-1},{...image,imagePNGBase64:'x'.repeat(700001)},{...image,imagePNGBase64:Buffer.from('not PNG').toString('base64')}])assert.equal(validDockSnackImage(value),false);
 const bomb=Buffer.from(image.imagePNGBase64,'base64');bomb.writeUInt32BE(1_000_000,16);
 assert.equal(validDockSnackImage({...image,imagePNGBase64:bomb.toString('base64')}),false);
 assert.equal(dockSnackHelperPath('/synthetic/app'),'/synthetic/app/dist/native/jarvis-dock-snack.node');
});
test('invalid image does not consume a gesture or start native code',async()=>{
 const {f,c}=controller();assert.deepEqual(await c.start({...image,hotSpotX:200}),{kind:'failed',reason:'invalid-input'});
 assert.equal(f.counts.starts,0);c.dispose();
});
test('foreign session, early delete, copy/move, malformed coordinates and duplicate events cannot select files',async()=>{
 const cases:Array<(f:ReturnType<typeof fakeBridge>)=>void>=[
  f=>f.event('started',{requestId:'foreign'}),f=>f.event('ended',{operation:'delete',screenPoint:point}),
  f=>{f.event('started');f.event('ended',{operation:'copy',screenPoint:point});},
  f=>{f.event('started');f.event('ended',{operation:'move',screenPoint:point});},
  f=>{f.event('started');f.event('started');},
  f=>{f.event('started');f.event('ended',{operation:'delete',screenPoint:{x:'0',y:1}});},
  f=>{f.event('started');f.event('ended',{operation:'delete',screenPoint:point});f.event('started');},
  f=>f.raw('not json'),f=>f.raw('x'.repeat(8193))
 ];
 for(const emit of cases){const {f,c}=controller();const r=c.start(image);emit(f);assert.deepEqual(await r,{kind:'failed',reason:'protocol-error'});assert.equal(f.counts.cancels,1);c.dispose();}
});
test('native failures use fixed codes without exposing paths or payloads',async()=>{
 for(const reason of ['button-released','missing-mouse-down','/synthetic/private']){
  const {f,c}=controller();const r=c.start(image);f.event('failed',{reason});
  assert.deepEqual(await r,{kind:'failed',reason:reason.startsWith('/')?'native-failed':reason});c.dispose();
 }
});
test('one gesture at a time; cancellation ignores late delete and allows a later drag',async()=>{
 const {f,c}=controller();const r=c.start(image);assert.deepEqual(await c.start(image),{kind:'busy',reason:'drag-active'});
 f.event('started');c.cancel();f.event('ended',{operation:'delete',screenPoint:point});
 assert.deepEqual(await r,{kind:'failed',reason:'cancelled'});
 const next=c.start(image);f.event('started');f.event('ended',{operation:'none',screenPoint:point});
 assert.equal((await next).kind,'cancelled');c.dispose();
});
test('disposal releases the monitor once and suppresses pending and future requests',async()=>{
 const {f,c}=controller();const r=c.start(image);c.dispose();c.dispose();
 f.event('started');f.event('ended',{operation:'delete',screenPoint:point});
 assert.equal((await r).kind,'failed');assert.equal(f.counts.disposes,1);
 assert.deepEqual(await c.start(image),{kind:'unavailable',reason:'disposed'});
});
test('callback errors and timeout revoke native selection authority',async()=>{
 const {f,c}=controller();const r=c.start(image,()=>{throw Error('synthetic');});f.event('started');
 assert.deepEqual(await r,{kind:'failed',reason:'callback-failed'});c.dispose();
 const d=controller({timeoutMs:10});assert.deepEqual(await d.c.start(image),{kind:'failed',reason:'timeout'});assert.equal(d.f.counts.cancels,1);d.c.dispose();
});
test('native start exceptions safely restore caller control',async()=>{
 const f=fakeBridge();f.bridge.start=()=>{throw Error('native exception');};
 const c=new DockSnackController({helperPath:'/synthetic/drag.node',nativeHandle:Buffer.alloc(8),bridge:f.bridge,platform:'darwin'});
 assert.deepEqual(await c.start(image),{kind:'failed',reason:'native-failed'});assert.equal(f.counts.cancels,1);c.dispose();
});
test('diagnostics cannot turn a none operation into delete',async()=>{
 const diagnostics:DockSnackDiagnostic[]=[];const {f,c}=controller({onDiagnostic:d=>diagnostics.push(d)});
 const r=c.start(image);f.event('diagnostic',{code:'in-process-native-v4'});f.event('started');
 f.event('diagnostic',{code:'drag-summary',durationMs:7950,moves:30,externalMaskQueries:6,localMaskQueries:1,endedWhileButtonDown:false,operationRaw:32});
 f.event('ended',{operation:'none',screenPoint:point});assert.equal((await r).kind,'cancelled');assert.equal(diagnostics.length,2);c.dispose();
});
test('diagnostic fields are bounded and must not disclose private data',async()=>{
 for(const extra of [{path:'/private'},{moves:100001},{durationMs:-1},{endedWhileButtonDown:'yes'}]){
  const {f,c}=controller();const r=c.start(image);f.event('started');f.event('diagnostic',{code:'drag-summary',durationMs:100,moves:1,externalMaskQueries:1,localMaskQueries:0,endedWhileButtonDown:false,operationRaw:0,...extra});
  assert.deepEqual(await r,{kind:'failed',reason:'protocol-error'});c.dispose();
 }
});
test('diagnostic sink errors cannot suppress an otherwise valid result',async()=>{
 const {f,c}=controller({onDiagnostic:()=>{throw Error('synthetic');}});const r=c.start(image);
 f.event('diagnostic',{code:'in-process-native-v4'});f.event('started');f.event('ended',{operation:'delete',screenPoint:point});
 assert.equal((await r).kind,'snack-requested');c.dispose();
});
