import { followupKey, type AttentionState, type FollowupKey, type FollowupNotice, type FollowupRecord,
  type FollowupSubject, type UpcomingSchedule } from '../shared/followup';
import type { SystemDelivery } from '../shared/timer';
import { FollowupRepository } from '../storage/followup-repository';

/** Result state is independent of initial notification receipt and original schedule. */
export class FollowupService {
  private preferred?: string;
  private recovered = new Set<string>();
  private disposed = false;
  constructor(private store: FollowupRepository, private now: () => number, private changed: () => void = () => {}) {
    for (const row of store.all()) {
      if (row.status === 'active' && row.nextReminderAt !== null && row.nextReminderAt <= now()) this.recovered.add(followupKey(row));
      let update = false;
      for (const round of row.rounds) if (round.delivery === 'requested') { round.delivery = 'unknown'; update = true; }
      if (update) store.save(row);
    }
  }
  records(): FollowupRecord[] { return this.store.all(); }
  register(subject: FollowupSubject, options: {legacyAcknowledged?: boolean; processedAt?: number} = {}): FollowupRecord {
    const existing = this.store.get(subject);
    if (existing) return existing;
    const now = Math.trunc(options.processedAt ?? this.now());
    const legacy = options.legacyAcknowledged === true;
    const row: FollowupRecord = { ...subject, title: subject.title.trim() || (subject.kind === 'timer' ? '타이머' : subject.kind === 'alarm' ? '알람' : '리마인더'),
      firstProcessedAt: now, acknowledgedAt: null, status: legacy ? 'legacy' : 'active',
      round: 0, rounds: [{number:0,dueAt:subject.dueAt,processedAt:now,acknowledgedAt:null,delivery:'not-requested',answer:null}],
      nextReminderAt:null, cardAt:legacy ? null : now + 120000, notYetCount:0, completedAt:null, undo:null };
    this.store.save(row); this.changed(); return row;
  }
  private active(key: FollowupKey, round?: number): FollowupRecord | undefined {
    if (this.disposed) return;
    const row = this.store.get(key);
    return row?.status === 'active' && (round === undefined || row.round === round) ? row : undefined;
  }
  acknowledge(key: FollowupKey, round?: number, openCard = true): boolean {
    const row = this.active(key, round); if (!row) return false;
    const now = Math.trunc(this.now());
    row.acknowledgedAt ??= now; row.rounds[row.round].acknowledgedAt ??= now;
    if (openCard) row.cardAt = now;
    else if (row.round === 0 && row.notYetCount === 0) row.cardAt = null;
    this.store.save(row);
    if (openCard) this.preferred = followupKey(key);
    this.changed(); return true;
  }
  openCard(key: FollowupKey, round?: number): boolean {
    const row = this.active(key, round); if (!row) return false;
    row.cardAt = Math.trunc(this.now()); this.store.save(row);
    this.preferred = followupKey(key); this.changed(); return true;
  }
  done(key: FollowupKey, round: number): boolean {
    const row = this.active(key, round); if (!row) return false;
    const now = Math.trunc(this.now());
    row.undo = { expiresAt: now + 5000, nextReminderAt: row.nextReminderAt, cardAt: row.cardAt, answer: row.rounds[row.round].answer };
    row.status = 'done'; row.completedAt = now; row.nextReminderAt = null; row.cardAt = null;
    row.rounds[row.round].answer = 'done';
    this.store.save(row); this.clearPreferred(key); this.changed(); return true;
  }
  undo(key: FollowupKey): boolean {
    const row = this.store.get(key), now = Math.trunc(this.now());
    if (this.disposed || row?.status !== 'done' || !row.undo || now >= row.undo.expiresAt || now < row.completedAt!) return false;
    const undo = row.undo;
    row.status = 'active'; row.completedAt = null; row.cardAt = undo.cardAt;
    row.nextReminderAt = undo.nextReminderAt; row.rounds[row.round].answer = undo.answer; row.undo = null;
    this.store.save(row); this.changed(); return true;
  }
  notYet(key: FollowupKey, round: number, delayMs: number): boolean {
    const row = this.active(key, round), now = Math.trunc(this.now());
    if (!row || row.rounds[round].answer !== null || !Number.isSafeInteger(delayMs) || delayMs <= 0 || !Number.isSafeInteger(now + delayMs)) return false;
    row.rounds[round].answer = 'not-yet'; row.notYetCount++;
    row.nextReminderAt = now + delayMs; row.cardAt = null; row.undo = null;
    this.store.save(row); this.clearPreferred(key); this.changed(); return true;
  }
  cancel(key: FollowupKey): boolean {
    const row = this.store.get(key);
    if (this.disposed || !row || row.status === 'cancelled' || row.status === 'legacy') return false;
    row.status = 'cancelled'; row.nextReminderAt = null; row.cardAt = null; row.undo = null; row.completedAt = null;
    this.store.save(row); this.clearPreferred(key); this.changed(); return true;
  }
  delivery(key: FollowupKey, round: number, state: SystemDelivery): boolean {
    if (this.disposed) return false;
    const row = this.store.get(key);
    if (!row || !Number.isInteger(round) || round < 0 || round > row.round) return false;
    row.rounds[round].delivery = state; this.store.save(row); this.changed(); return true;
  }
  tick(): FollowupNotice[] {
    if (this.disposed) return [];
    const notices: FollowupNotice[] = [], now = Math.trunc(this.now());
    const dueRows = this.records().filter(row => row.status === 'active' && row.nextReminderAt !== null && row.nextReminderAt <= now);
    if (!dueRows.length) return notices;
    this.store.transaction(() => {
      for (const row of dueRows) {
        const due = row.nextReminderAt!;
        row.round++;
        row.rounds.push({number:row.round,dueAt:due,processedAt:now,acknowledgedAt:null,delivery:'requested',answer:null});
        row.nextReminderAt = null; row.cardAt = now;
        this.store.save(row);
        notices.push({kind:row.kind,id:row.id,title:row.title,dueAt:due,round:row.round,
          reason:this.recovered.has(followupKey(row)) ? 'recovered' : 'reminder'});
      }
    });
    for (const notice of notices) this.recovered.delete(followupKey(notice));
    if (notices.length) this.changed();
    return notices;
  }
  card(preferredKey?: FollowupKey): { item: FollowupRecord; remainingCount: number } | null {
    const now = this.now();
    const active = this.records().filter(r => r.status === 'active');
    const rows = active.filter(r => r.cardAt !== null && r.cardAt <= now)
      .sort((a,b) => a.firstProcessedAt - b.firstProcessedAt || followupKey(a).localeCompare(followupKey(b)));
    if (!rows.length) return null;
    const preferred = preferredKey ? followupKey(preferredKey) : this.preferred;
    return {item: rows.find(r => followupKey(r) === preferred) ?? rows[0], remainingCount: active.length - 1};
  }
  attention(upcoming: readonly UpcomingSchedule[] = []): AttentionState {
    const active = this.records().filter(r => r.status === 'active' && r.notYetCount > 0);
    const count = active.reduce((count, row) => Math.max(count, row.notYetCount), 0);
    const level = count === 0 ? 0 : count === 1 ? 1 : 2;
    const imminent = upcoming.some(r => {
      const remaining = r.remainingMs ?? r.dueAt - this.now();
      return r.status === 'pending' && remaining >= 0 && remaining <= 180000;
    });
    return {holdLife: active.length > 0 || imminent, level, intervalSeconds: level === 2 ? Math.max(15,60 - (count - 2) * 15) : 60};
  }
  private clearPreferred(key: FollowupKey): void { if (this.preferred === followupKey(key)) this.preferred = undefined; }
  dispose(): void { if (this.disposed) return; this.disposed = true; this.store.close(); }
}
