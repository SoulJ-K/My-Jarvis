import { randomUUID } from 'node:crypto';
import { TimerService } from './timer';
import { ReminderService } from './reminders';
import { FollowupService } from './followup';
import type { FollowupKey } from '../shared/followup';
import type { AssistantPanelState, PanelAction, PanelReply, TimerMenu, PanelItem } from '../shared/assistant-panel';

/** Narrow, testable join between schedules, acknowledgement and the baby's task result. */
export class PanelController {
  private syncing = false;
  private scheduleReadFailed = false;
  private lastSchedules: ReturnType<ReminderService['records']> = [];
  private scheduleRows() {
    try { this.lastSchedules=this.schedules?.records() ?? []; this.scheduleReadFailed=false; }
    catch { this.scheduleReadFailed=true; }
    return this.lastSchedules;
  }
  private pendingPins = new Map<string, string>();
  constructor(private timers: TimerService, private schedules: ReminderService | undefined,
    readonly followups: FollowupService, private stage: () => 'egg' | 'baby',
    private changed: () => void, private snackRequest: () => Promise<PanelReply>,
    private now: () => number = Date.now) {}
  sync() {
    if (this.syncing) return;
    this.syncing = true;
    try {
      const rows = [...this.timers.records().map(row => ({...row,kind:'timer' as const,title:row.title})),
        ...this.scheduleRows().map(row => ({...row,title:row.content}))];
      for (const row of rows) {
        const key = {kind:row.kind,id:row.id};
        if (row.status === 'due' || row.status === 'acknowledged') {
          this.followups.register({...key,title:row.title,dueAt:row.dueAt}, {legacyAcknowledged:row.status === 'acknowledged'});
        } else if (row.status === 'cancelled') this.followups.cancel(key);
      }
    } finally { this.syncing = false; }
  }
  attention() {
    return this.followups.attention([...this.timers.views().map(row=>({...row,kind:'timer' as const})), ...this.scheduleRows()]);
  }
  state(): AssistantPanelState {
    this.sync();
    const followups = this.followups.records();
    const items: PanelItem[] = [];
    const timerViews = this.timers.views();
    const candidates = [...this.timers.records().map(row => ({ ...row,kind:'timer' as const,title:row.title,
      remainingMs:timerViews.find(view=>view.id===row.id)?.remainingMs ?? 0 })),
      ...this.scheduleRows().map(row=>({...row,title:row.content,remainingMs:Math.max(0,row.dueAt-this.now())}))];
    for (const row of candidates) {
      const task=followups.find(record=>record.kind===row.kind && record.id===row.id);
      if (row.status==='cancelled' || task?.status==='done' || task?.status==='cancelled' || task?.status==='legacy') continue;
      if (row.status==='acknowledged' && (this.stage()==='egg' || task?.status!=='active')) continue;
      const latest=task?.rounds[task.round];
      items.push({id:row.id,kind:row.kind,title:row.title,reason:task && task.round>0 ? null : row.reason,dueAt:task?.nextReminderAt ?? row.dueAt,
        status:task?.nextReminderAt != null ? 'pending' : row.status==='acknowledged' ? 'due' : row.status,
        remainingMs:task?.nextReminderAt != null ? Math.max(0,task.nextReminderAt-this.now()) : row.remainingMs,
        delivery:latest && task!.round>0 ? latest.delivery : row.systemDelivery,
        acknowledged:task && task.round>0 ? latest?.acknowledgedAt != null : latest?.acknowledgedAt != null || row.status==='acknowledged',
        ...('menu' in row ? {menu:row.menu,timerState:row.status} : {})});
    }
    const active = this.stage()==='baby' ? this.followups.card() : null;
    const undo = this.stage()==='baby' ? followups.filter(row=>row.status==='done' && row.undo && row.undo.expiresAt>this.now())
      .sort((a,b)=>(b.completedAt ?? 0)-(a.completedAt ?? 0))[0] : undefined;
    const item = undo ?? active?.item;
    return {stage:this.stage(),items,warning:this.scheduleReadFailed ? '알람·리마인더 목록을 갱신하지 못했어요. 마지막 확인 내용을 표시합니다.' : undefined,card:item ? {id:item.id,kind:item.kind,title:item.title,round:item.round,
      count:active ? active.remainingCount+1 : 1,completed:item.status==='done',undoUntil:item.undo?.expiresAt ?? null} : null};
  }
  acknowledge(key: FollowupKey, expectedRound?: number): boolean {
    this.sync();
    const row=this.followups.records().find(record=>record.kind===key.kind && record.id===key.id);
    if (!row || expectedRound!==undefined && row.round!==expectedRound || row.status!=='active') return false;
    const ok=this.followups.acknowledge(key,row.round,this.stage()==='baby');
    if (ok) {
      if (key.kind==='timer') this.timers.acknowledge(key.id); else this.schedules?.acknowledge(key.id);
      this.changed();
    }
    return ok;
  }
  async action(action: PanelAction): Promise<PanelReply> {
    this.sync();
    const key={kind:action.kind,id:action.id};
    let ok=false;
    if (action.type==='ack') ok=this.acknowledge(key);
    else if (action.type==='done' || action.type==='later' || action.type==='undo') {
      if (this.stage()!=='baby') return {ok:false,message:'아기가 된 뒤에 결과를 알려줄 수 있어요.'};
      if (action.type==='done') ok=this.followups.done(key,action.round!);
      else if (action.type==='undo') ok=this.followups.undo(key);
      else if (action.type==='later') ok=this.followups.notYet(key,action.round!,action.delayMs);
    } else if (action.type==='cancel') {
      const reply=action.kind==='timer' ? this.timers.cancel(action.id) : this.schedules?.cancel(action.id);
      ok=reply?.ok ?? false;
      if (ok) this.followups.cancel(key);
    } else if (action.kind==='timer') {
      if (action.type==='pause') return this.finish(this.timers.pause(action.id));
      if (action.type==='resume') return this.finish(this.timers.resumeTimer(action.id));
      if (action.type==='restart') {
        const reply=this.timers.restart(action.id,randomUUID());
        if (reply.ok) this.followups.cancel(key);
        return this.finish(reply);
      }
      if (action.type==='menu') {
        const token=`menu:${action.id}`;
        const reply=this.timers.setMenu(action.id,action.mode,action.replace ? this.pendingPins.get(token) : undefined);
        if (reply.pinConflictId) {this.pendingPins.set(token,reply.pinConflictId);return {...reply,needsPinConfirmation:true};}
        this.pendingPins.delete(token);return this.finish(reply);
      }
    }
    this.changed();
    return {ok,message:ok ? action.type==='later' ? '다시 알려드릴게요.' : action.type==='done' ? '완료로 기록했어요.' : action.type==='undo' ? '완료를 되돌렸어요.' : action.type==='cancel' ? '일정을 취소했어요.' : '알림을 확인했어요.' : '상태가 바뀌었어요. 현재 목록을 다시 확인해 주세요.'};
  }
  submitTimer(id: string,input: string,mode: TimerMenu,replace=false): PanelReply {
    const token=`new:${id}`;
    const reply=this.timers.submit(id,input,{menu:mode,replacePinnedId:replace ? this.pendingPins.get(token) : undefined});
    if (reply.pinConflictId) {this.pendingPins.set(token,reply.pinConflictId);return {...reply,needsPinConfirmation:true};}
    this.pendingPins.delete(token);return this.finish(reply);
  }
  snack() {return this.snackRequest();}
  private finish<T extends PanelReply>(reply:T):T {this.changed();return reply;}
}
