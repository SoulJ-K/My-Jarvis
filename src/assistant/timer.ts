import type { SystemDelivery, TimerReply, TimerView, TimerRecord, TimerOptions, TimerMenu } from '../shared/timer';
import { TimerRepository } from '../storage/timer-repository';
export interface TimerClock { wall(): number; monotonic(): number }
export type NotifyTimer = (report: (state: SystemDelivery) => void, item?: TimerRecord) => void;

/** Explicit durations; no renderer clock or pet dependency. */
export function parseTimerInput(input: unknown): {durationMs: number; title: string} | null {
  if (typeof input !== 'string' || input.length > 8192) return null;
  const match = input.trim().match(/^(.*?)((?:\d+\s*(?:시간|분|초)\s*)+)타이머(?:\s+(.+))?$/);
  if (!match || (match[1].trim() && (!/\s$/.test(match[1]) || match[3]?.trim()))) return null;
  let durationMs = 0, previous = 4;
  for (const part of match[2].matchAll(/(\d+)\s*(시간|분|초)/g)) {
    const rank = part[2] === '시간' ? 3 : part[2] === '분' ? 2 : 1;
    if (rank >= previous) return null;
    previous = rank;
    durationMs += Number(part[1]) * (rank === 3 ? 3600000 : rank === 2 ? 60000 : 1000);
  }
  // Reject malformed duration fragments mistakenly interpreted as a title.
  const title = (match[1].trim() || match[3]?.trim() || '타이머');
  if (/^[+\-\d.\s]+$/.test(match[1].trim()) || /\d\s*(시간|분|초)/.test(match[1])) return null;
  return Number.isSafeInteger(durationMs) && durationMs > 0 ? { durationMs, title } : null;
}
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
    return this.store.all().filter(row => row.status === 'pending' || row.status === 'paused' || row.status === 'due')
      .map(row => ({ ...row, remainingMs: row.status === 'pending' ?
        Math.max(0, (this.deadlines.get(row.id) ?? this.clock.monotonic()) - this.clock.monotonic()) : row.status === 'paused' ? row.pausedRemainingMs! : 0 }));
  }
  records(): TimerRecord[] { return this.store.all(); }
  submit(id: unknown, input: unknown, options: TimerOptions = {}): TimerReply {
    const parsed = parseTimerInput(input);
    if (!parsed) return this.reply(false, '시간·분·초와 타이머를 적어 주세요. 예: 라면 3분 타이머');
    return this.create(id, parsed.durationMs, { ...options, title: options.title ?? parsed.title });
  }
  create(id: unknown, durationMs: number, options: TimerOptions = {}, restartOf: string | null = null): TimerReply {
    if (typeof id !== 'string' || !/^[\w-]{1,80}$/.test(id) || !Number.isSafeInteger(durationMs) || durationMs <= 0 ||
        !Number.isSafeInteger(Math.trunc(this.clock.wall()) + durationMs) ||
        (options.title !== undefined && typeof options.title !== 'string') ||
        !['default','pinned','hidden'].includes(options.menu ?? 'default'))
      return this.reply(false, '타이머 시간과 표시 설정을 확인해 주세요.');
    const existing = this.records().find(row => row.id === id);
    if (existing) return this.reply(['pending','paused'].includes(existing.status) && existing.restartOf === restartOf && existing.durationMs === durationMs, '이미 처리한 요청입니다. 목록을 확인해 주세요.');
    this.tick();
    const pin = this.views().find(row => row.menu === 'pinned');
    if (options.menu === 'pinned' && pin && pin.id !== restartOf && options.replacePinnedId !== pin.id)
      return { ...this.reply(false, '현재 고정 타이머를 바꿀지 확인해 주세요.'), pinConflictId: pin.id };
    const now = Math.trunc(this.clock.wall());
    this.store.transaction(() => {
      if (restartOf) {
        const old = this.records().find(row => row.id === restartOf);
        if (old && ['pending','paused'].includes(old.status)) this.store.cancel(restartOf);
      }
      if (options.menu === 'pinned' && pin && pin.id !== restartOf)
        this.store.setMenu(pin.id, 'default', pin.remainingMs < 180000);
      this.store.insert(id, now, durationMs, options.title?.trim() || '타이머', options.menu ?? 'default', restartOf);
    });
    if (restartOf) this.deadlines.delete(restartOf);
    this.deadlines.set(id, this.clock.monotonic() + durationMs);
    this.changed();
    return this.reply(true, '타이머를 저장했습니다.');
  }
  pause(id: string): TimerReply {
    this.tick();
    const row = this.views().find(row => row.id === id && row.status === 'pending');
    const ok = !!row && row.remainingMs > 0 && this.store.pause(id, Math.ceil(row.remainingMs));
    if (ok) this.deadlines.delete(id);
    this.changed(); return this.reply(ok, ok ? '타이머를 일시정지했습니다.' : '진행 중인 타이머를 확인해 주세요.');
  }
  resumeTimer(id: string): TimerReply {
    const row = this.views().find(row => row.id === id && row.status === 'paused');
    const due = Math.trunc(this.clock.wall()) + (row?.pausedRemainingMs ?? 0);
    const ok = !!row && Number.isSafeInteger(due) && this.store.resume(id, due);
    if (ok) this.deadlines.set(id, this.clock.monotonic() + row!.pausedRemainingMs!);
    this.changed(); return this.reply(ok, ok ? '타이머를 다시 진행합니다.' : '일시정지한 타이머를 확인해 주세요.');
  }
  restart(id: string, newId: string, options: TimerOptions = {}): TimerReply {
    const row = this.records().find(row => row.id === id);
    if (!row || newId === id) return this.reply(false, '다시 시작할 타이머와 새 요청을 확인해 주세요.');
    return this.create(newId, row.durationMs, { title: row.title, menu: row.menu, ...options }, id);
  }
  setMenu(id: string, menu: TimerMenu, replacePinnedId?: string): TimerReply {
    this.tick();
    if (!['default','pinned','hidden'].includes(menu)) return this.reply(false, '표시 설정을 확인해 주세요.');
    const rows = this.views(), row = rows.find(t => t.id === id && ['pending','paused'].includes(t.status));
    if (!row) return this.reply(false, '진행 중이거나 정지한 타이머를 확인해 주세요.');
    const pin = rows.find(t => t.menu === 'pinned' && t.id !== id);
    if (menu === 'pinned' && pin && replacePinnedId !== pin.id)
      return { ...this.reply(false, '현재 고정 타이머를 바꿀지 확인해 주세요.'), pinConflictId: pin.id };
    this.store.transaction(() => {
      if (menu === 'pinned' && pin) this.store.setMenu(pin.id, 'default', pin.remainingMs < 180000);
      this.store.setMenu(id, menu);
    });
    this.changed(); return this.reply(true, '메뉴 표시를 바꿨습니다.');
  }
  cancel(id: string): TimerReply {
    // Process an already-due deadline before recording cancellation.
    this.tick();
    const ok = this.store.cancel(id);
    if (ok) this.deadlines.delete(id);
    this.changed();
    return this.reply(ok, ok ? '타이머를 취소했습니다.' : '이미 취소된 타이머입니다.');
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
        }, this.records().find(row => row.id === id)!);
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
  dispose(): void { if (this.disposed) return; this.disposed = true; this.deadlines.clear(); this.store.close(); }
}
