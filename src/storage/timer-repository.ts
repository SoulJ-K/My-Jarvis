import { closeSync, lstatSync, mkdirSync, openSync } from 'node:fs';
import path from 'node:path';
import { DatabaseSync } from 'node:sqlite';
import type { TimerRecord, SystemDelivery } from '../shared/timer';

const APP_ID = 0x4a505432;
export const timerDatabasePath = (directory: string) => path.join(directory, 'assistant', 'timers.sqlite3');

/** Separate from the pet store: timer failures/migrations cannot replace the pet. */
export class TimerRepository {
  private db: DatabaseSync;
  constructor(directory: string) {
    const file = timerDatabasePath(directory);
    mkdirSync(path.dirname(file), { recursive: true, mode: 0o700 });
    let created = false;
    try { const fd = openSync(file, 'wx', 0o600); closeSync(fd); created = true; }
    catch (error) { if ((error as NodeJS.ErrnoException).code !== 'EEXIST') throw new Error('TIMER_STORAGE_FAILED'); }
    const stat = lstatSync(file);
    if (!stat.isFile() || stat.isSymbolicLink() || (!created && stat.size === 0)) throw new Error('TIMER_STORAGE_INVALID');
    this.db = new DatabaseSync(file, { allowExtension: false, timeout: 1000 });
    try {
      this.db.exec('PRAGMA trusted_schema=OFF; PRAGMA synchronous=FULL');
      if (created) this.db.exec(`BEGIN IMMEDIATE;
        CREATE TABLE timers (
          id TEXT PRIMARY KEY, started_at INTEGER NOT NULL, due_at INTEGER NOT NULL,
          duration_ms INTEGER NOT NULL CHECK(duration_ms=300000),
          status TEXT NOT NULL CHECK(status IN ('pending','due','cancelled','acknowledged')),
          reason TEXT CHECK(reason IN ('on-time','late','recovered')),
          system_delivery TEXT NOT NULL CHECK(system_delivery IN ('not-requested','requested','shown','failed','unsupported','unknown')),
          app_displayed INTEGER NOT NULL CHECK(app_displayed IN (0,1))
        ) STRICT;
        CREATE UNIQUE INDEX one_pending_timer ON timers(status) WHERE status='pending';
        PRAGMA application_id=${APP_ID}; PRAGMA user_version=1; COMMIT;`);
      if (this.db.prepare('PRAGMA quick_check').get()?.quick_check !== 'ok' ||
          this.db.prepare('PRAGMA application_id').get()?.application_id !== APP_ID ||
          this.db.prepare('PRAGMA user_version').get()?.user_version !== 1) throw new Error('TIMER_STORAGE_INVALID');
      this.all();
    } catch { this.db.close(); throw new Error('TIMER_STORAGE_INVALID'); }
  }
  all(): TimerRecord[] {
    return this.db.prepare('SELECT * FROM timers ORDER BY started_at, id').all().map(row => {
      if (typeof row.id !== 'string' || !/^[\w-]{1,80}$/.test(row.id) ||
          !Number.isSafeInteger(row.started_at) || !Number.isSafeInteger(row.due_at) ||
          Number(row.due_at) - Number(row.started_at) !== 300000 || row.duration_ms !== 300000 ||
          !['pending','due','cancelled','acknowledged'].includes(String(row.status)) ||
          !['not-requested','requested','shown','failed','unsupported','unknown'].includes(String(row.system_delivery)) ||
          ![null,'on-time','late','recovered'].includes(row.reason as null | string) || ![0,1].includes(Number(row.app_displayed))) {
        throw new Error('TIMER_STORAGE_INVALID');
      }
      return { id: row.id, startedAt: Number(row.started_at), dueAt: Number(row.due_at), durationMs: Number(row.duration_ms),
        status: row.status as TimerRecord['status'], reason: row.reason as TimerRecord['reason'],
        systemDelivery: row.system_delivery as SystemDelivery, appDisplayed: row.app_displayed === 1 };
    });
  }
  insert(id: string, now: number): void {
    this.db.prepare(`INSERT INTO timers VALUES (?, ?, ?, 300000, 'pending', NULL, 'not-requested', 0)`)
      .run(id, now, now + 300000);
  }
  due(id: string, reason: TimerRecord['reason']): boolean {
    return this.db.prepare("UPDATE timers SET status='due', reason=? WHERE id=? AND status='pending'").run(reason, id).changes === 1;
  }
  cancel(id: string): boolean {
    return this.db.prepare("UPDATE timers SET status='cancelled' WHERE id=? AND status='pending'").run(id).changes === 1;
  }
  acknowledge(id: string): boolean {
    return this.db.prepare("UPDATE timers SET status='acknowledged' WHERE id=? AND status='due'").run(id).changes === 1;
  }
  delivery(id: string, state: SystemDelivery): void {
    this.db.prepare("UPDATE timers SET system_delivery=? WHERE id=? AND status IN ('due','acknowledged')").run(state, id);
  }
  displayed(id: string): void {
    this.db.prepare("UPDATE timers SET app_displayed=1 WHERE id=? AND status='due'").run(id);
  }
  close(): void { this.db.close(); }
}
