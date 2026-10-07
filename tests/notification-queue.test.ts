import assert from 'node:assert/strict';
import { EventEmitter } from 'node:events';
import test from 'node:test';
import { notificationQueue } from '../src/main/notification-queue';
class Notice extends EventEmitter { shown = 0; closed = 0; show() { this.shown++; } close() { this.closed++; } }
test('native show is not acknowledgement; click acknowledges once', () => {
  const notice = new Notice(); const reports: string[] = []; const clicks: string[] = [];
  const queue = notificationQueue((id: string) => ({title:'test',body:id,silent:false}), undefined,
    { backend:{isSupported:()=>true,create:()=>notice}, onClick:id=>clicks.push(id) });
  queue.notify('one', state=>reports.push(state)); notice.emit('show');
  assert.deepEqual(reports,['shown']); assert.deepEqual(clicks,[]);
  notice.emit('click'); notice.emit('click'); assert.deepEqual(clicks,['one']); queue.dispose();
});
test('unknown outcome keeps a later deliberate click and does not withdraw alert', async () => {
  const notice = new Notice(); const reports: string[]=[]; let clicks=0;
  const queue=notificationQueue(()=>({title:'test',body:'test',silent:false}),undefined,
    {backend:{isSupported:()=>true,create:()=>notice},outcomeTimeoutMs:1,onClick:()=>clicks++});
  queue.notify(undefined,state=>reports.push(state)); await new Promise(resolve=>setTimeout(resolve,10));
  assert.deepEqual(reports,['unknown']); assert.equal(notice.closed,0); notice.emit('show');
  assert.deepEqual(reports,['unknown']); notice.emit('click'); assert.equal(clicks,1); queue.dispose();
});
test('close never acknowledges; disposal invalidates callbacks without withdrawing', () => {
  const notice = new Notice(); let clicks=0; const reports:string[]=[];
  const queue=notificationQueue(()=>({title:'test',body:'test',silent:false}),undefined,
    {backend:{isSupported:()=>true,create:()=>notice},onClick:()=>clicks++});
  queue.notify(undefined,state=>reports.push(state)); notice.emit('close'); assert.equal(clicks,0);
  assert.deepEqual(reports,['unknown']); queue.dispose(); notice.emit('click'); assert.equal(clicks,0); assert.equal(notice.closed,0);
});
