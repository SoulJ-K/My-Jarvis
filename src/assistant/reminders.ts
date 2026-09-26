import type { ScheduleDraft, SchedulePreview, ScheduleRecord, ScheduleReply } from '../shared/schedule';
import type { SystemDelivery } from '../shared/timer';
import { ScheduleRepository } from '../storage/schedule-repository';
import { parseSchedule } from './time-parser';

/** OS integration supplies this separately; requesting delivery never implies visibility. */
export type NotifySchedule = (item: ScheduleRecord, report: (state: SystemDelivery) => void) => void;

export class ReminderService {
  private draft?: ScheduleDraft;
  private disposed = false;
  constructor(private store: ScheduleRepository, private now: () => number,
    private notify: NotifySchedule | undefined, private changed: () => void) {
    const wall = now();
    for (const row of store.all()) {
      if (row.systemDelivery === 'requested') store.delivery(row.id, 'unknown');
      if (row.status === 'pending' && row.dueAt <= wall) store.due(row.id, 'recovered');
    }
  }
  views(): ScheduleRecord[] { return this.store.all().filter(row => row.status === 'pending' || row.status === 'due'); }
  preview(id: unknown, input: unknown): SchedulePreview {
    this.discard();
    if (typeof id !== 'string' || !/^[\w-]{1,80}$/.test(id)) return { ok: false, message: '새 입력으로 다시 확인해 주세요.' };
    if (this.store.all().some(row => row.id === id)) return { ok: false, message: '이미 처리한 요청입니다. 목록을 확인하거나 새 입력으로 요청해 주세요.' };
    const reply = parseSchedule(id, input, this.now());
    if (reply.ok) this.draft = { ...reply.draft };
    return reply;
  }
  confirm(id: string): ScheduleReply {
    const existing = this.store.all().find(row => row.id === id);
    if (existing) return { ok: existing.status === 'pending' || existing.status === 'due',
      message: existing.status === 'pending' || existing.status === 'due' ? '이미 저장된 알림입니다. 목록에서 확인해 주세요.' : '이미 취소하거나 확인한 요청입니다.' };
    if (!this.draft || this.draft.id !== id) return { ok: false, message: '먼저 날짜·시각·내용을 확인해 주세요.' };
    const now = Math.trunc(this.now());
    if (this.draft.dueAt <= now) { this.discard(); return { ok: false, message: '확인하는 동안 시각이 지났습니다. 미래 시각으로 다시 입력해 주세요.' }; }
    this.store.insert(this.draft, now); // Confirmation only succeeds after the durable write.
    this.discard(); this.changed();
    return { ok: true, message: '알림을 저장했습니다. 입력창을 닫아도 앱 실행 중에는 계속됩니다.' };
  }
  discard(): void { this.draft = undefined; }
  cancel(id: string): ScheduleReply {
    this.tick();
    const ok = this.store.cancel(id); this.changed();
    return { ok, message: ok ? '알림을 취소했습니다.' : '이미 시각이 지났거나 취소한 알림입니다. 목록을 확인해 주세요.' };
  }
  acknowledge(id: string): void { this.store.acknowledge(id); this.changed(); }
  displayed(id: string): void { this.store.displayed(id); }
  // v0.1 implementation assumption: a calendar promise follows the saved instant,
  // including wall-clock corrections; changing the display time zone does not reinterpret it.
  tick(): void {
    if (this.disposed) return;
    const now = this.now();
    for (const row of this.views()) {
      if (row.status !== 'pending' || row.dueAt > now) continue;
      const reason = now - row.dueAt > 2000 ? 'late' : 'on-time';
      if (!this.store.due(row.id, reason)) continue;
      this.changed();
      if (!this.notify) continue; // Explicit app-only integration: never claim an OS request.
      this.store.delivery(row.id, 'requested');
      try {
        this.notify({ ...row, status: 'due', reason, systemDelivery: 'requested' }, state => {
          if (this.disposed) return;
          try { this.store.delivery(row.id, state); this.changed(); } catch { /* Recover as unknown after restart. */ }
        });
      } catch { this.store.delivery(row.id, 'failed'); }
      this.changed();
    }
  }
  dispose(): void { this.disposed = true; this.discard(); this.store.close(); }
}
