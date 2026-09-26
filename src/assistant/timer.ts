import type { SystemDelivery, TimerReply, TimerView } from '../shared/timer';
import { TimerRepository } from '../storage/timer-repository';
export interface TimerClock { wall(): number; monotonic(): number }
export type NotifyTimer = (report: (state: SystemDelivery) => void) => void;

/** One five-minute timer at a time; no LLM, renderer clock or pet dependency. */
export class TimerService {
  private deadlines = new Map<string, number>();
  private disposed = false;
  private suspended?: { wall: number; mono: number };
  constructor(private store: TimerRepository, private clock: TimerClock,
    private notify: NotifyTimer, private changed: () => void) {
    const wall = clock.wall();
    for (const row of store.all()) {
      if (row.systemDelivery === 'requested') store.delivery(row.id, 'unknown');
      if (row.status !== 'pending') continue;
      if (row.dueAt <= wall) store.due(row.id, 'recovered');
      else this.deadlines.set(row.id, clock.monotonic() + row.dueAt - wall);
    }
  }
  views(): TimerView[] {
    return this.store.all().filter(row => row.status === 'pending' || row.status === 'due')
      .map(row => ({ ...row, remainingMs: row.status === 'pending' ?
        Math.max(0, (this.deadlines.get(row.id) ?? this.clock.monotonic()) - this.clock.monotonic()) : 0 }));
  }
  submit(id: unknown, input: unknown): TimerReply {
    if (typeof id !== 'string' || !/^[\w-]{1,80}$/.test(id) || typeof input !== 'string' || input.length > 80)
      return this.reply(false, '입력은 80자 안으로 적어 주세요.');
    if (!/^5\s*분\s*타이머$/.test(input.trim()))
      return this.reply(false, '지금은 “5분 타이머”만 지원합니다. 시간을 추측해서 등록하지 않았습니다.');
    const existing = this.store.all().find(row => row.id === id);
    if (existing) return this.reply(existing.status === 'pending', existing.status === 'pending' ?
      '이미 저장된 5분 타이머입니다.' : '이미 처리된 요청입니다. 새 요청으로 입력해 주세요.');
    if (this.views().some(row => row.status === 'pending')) return this.reply(false, '진행 중인 타이머가 있습니다. 먼저 취소해 주세요.');
    const now = Math.trunc(this.clock.wall());
    this.store.insert(id, now); // Never announce success before durable commit.
    this.deadlines.set(id, this.clock.monotonic() + 300000);
    this.changed();
    return this.reply(true, '5분 타이머를 저장했습니다. 입력창을 닫아도 앱이 실행 중이면 계속됩니다.');
  }
  cancel(id: string): TimerReply {
    // A due deadline wins over a late cancellation.
    this.tick();
    const ok = this.store.cancel(id);
    if (ok) this.deadlines.delete(id);
    this.changed();
    return this.reply(ok, ok ? '타이머를 취소했습니다.' : '이미 끝났거나 취소된 타이머입니다.');
  }
  acknowledge(id: string): void { this.store.acknowledge(id); this.changed(); }
  displayed(id: string): void { this.store.displayed(id); }
  tick(): void {
    if (this.disposed) return;
    for (const [id, deadline] of this.deadlines) {
      const late = this.clock.monotonic() - deadline;
      if (late < 0) continue;
      if (!this.store.due(id, late > 2000 ? 'late' : 'on-time')) { this.deadlines.delete(id); continue; }
      this.deadlines.delete(id);
      this.changed(); // Persisted app inbox survives a notification failure/crash.
      this.store.delivery(id, 'requested');
      try {
        this.notify(state => {
          if (this.disposed) return;
          try { this.store.delivery(id, state); this.changed(); }
          catch { /* Existing due item survives; requested becomes unknown on restart. */ }
        });
      } catch { this.store.delivery(id, 'failed'); }
      this.changed();
    }
  }
  suspend(): void { this.suspended = { wall: this.clock.wall(), mono: this.clock.monotonic() }; }
  /** Include sleep once even on platforms where the monotonic clock pauses in sleep. */
  resume(): void {
    if (this.suspended) {
      const extraSleep = Math.max(0, (this.clock.wall() - this.suspended.wall) -
        (this.clock.monotonic() - this.suspended.mono));
      for (const [id, deadline] of this.deadlines) this.deadlines.set(id, deadline - extraSleep);
      this.suspended = undefined;
    } else {
      // Missing suspend event: persisted dates are the only cross-sleep reference available.
      for (const row of this.store.all()) if (row.status === 'pending') this.deadlines.set(row.id,
        Math.min(this.deadlines.get(row.id) ?? Infinity, this.clock.monotonic() + row.dueAt - this.clock.wall()));
    }
    this.tick();
  }
  private reply(ok: boolean, message: string): TimerReply { return { ok, message, timers: this.views() }; }
  dispose(): void { this.disposed = true; this.deadlines.clear(); this.store.close(); }
}
