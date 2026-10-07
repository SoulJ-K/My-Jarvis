import { chmodSync, closeSync, lstatSync, mkdirSync, openSync } from 'node:fs';
import path from 'node:path';
import { DatabaseSync } from 'node:sqlite';
import type { TimerMenu, TimerRecord, SystemDelivery } from '../shared/timer';

const APP_ID = 0x4a505432;
export const timerDatabasePath = (directory: string) => path.join(directory, 'assistant', 'timers.sqlite3');
const schema = `CREATE TABLE timers (
  id TEXT PRIMARY KEY, started_at INTEGER NOT NULL, due_at INTEGER NOT NULL,
  duration_ms INTEGER NOT NULL CHECK(duration_ms>0),
  status TEXT NOT NULL CHECK(status IN ('pending','paused','due','cancelled','acknowledged')),
  reason TEXT CHECK(reason IN ('on-time','late','recovered')),
  system_delivery TEXT NOT NULL CHECK(system_delivery IN ('not-requested','requested','shown','failed','unsupported','unknown')),
  app_displayed INTEGER NOT NULL CHECK(app_displayed IN (0,1)),
  title TEXT NOT NULL, menu TEXT NOT NULL CHECK(menu IN ('default','pinned','hidden')),
  auto_excluded INTEGER NOT NULL CHECK(auto_excluded IN (0,1)),
  paused_remaining_ms INTEGER, restart_of TEXT,
  CHECK((status='paused' AND paused_remaining_ms>0) OR (status!='paused' AND paused_remaining_ms IS NULL))
) STRICT;
CREATE UNIQUE INDEX one_pinned_timer ON timers(menu) WHERE menu='pinned' AND status IN ('pending','paused');`;

/** Timer format v2; old acknowledgement/delivery facts remain unchanged. */
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
      if (created) this.db.exec(`BEGIN IMMEDIATE; ${schema} PRAGMA application_id=${APP_ID}; PRAGMA user_version=2; COMMIT;`);
      if (this.db.prepare('PRAGMA quick_check').get()?.quick_check !== 'ok' ||
          this.db.prepare('PRAGMA application_id').get()?.application_id !== APP_ID) throw new Error('TIMER_STORAGE_INVALID');
      const version = this.db.prepare('PRAGMA user_version').get()?.user_version;
      if (version === 1) {
        // Validate every original row before a schema change. Snapshot is never overwritten.
        for (const row of this.db.prepare('SELECT * FROM timers').all()) {
          this.read({ ...row, title: '타이머', menu: 'default', auto_excluded: 0, paused_remaining_ms: null, restart_of: null });
          if (row.duration_ms !== 300000 || Number(row.due_at) - Number(row.started_at) !== 300000 || row.status === 'paused')
            throw new Error('TIMER_STORAGE_INVALID');
        }
        // VACUUM INTO also includes committed WAL pages, unlike a raw database-file copy.
        const backup = `${file}.v1-backup-${Date.now()}-${process.pid}`;
        this.db.prepare('VACUUM INTO ?').run(backup);
        chmodSync(backup, 0o600);
        this.db.exec(`BEGIN IMMEDIATE; ALTER TABLE timers RENAME TO timers_v1; DROP INDEX IF EXISTS one_pending_timer;
          ${schema}
          INSERT INTO timers SELECT *, '타이머','default',0,NULL,NULL FROM timers_v1;
          DROP TABLE timers_v1; PRAGMA user_version=2; COMMIT;`);
      } else if (version !== 2) throw new Error('TIMER_STORAGE_INVALID');
      this.all();
    } catch { this.db.close(); throw new Error('TIMER_STORAGE_INVALID'); }
  }
  private read(row: Record<string, unknown>): TimerRecord {
    if (typeof row.id !== 'string' || !/^[\w-]{1,80}$/.test(row.id) ||
        !Number.isSafeInteger(row.started_at) || !Number.isSafeInteger(row.due_at) ||
        !Number.isSafeInteger(row.duration_ms) || Number(row.duration_ms) <= 0 ||
        !['pending','paused','due','cancelled','acknowledged'].includes(String(row.status)) ||
        !['not-requested','requested','shown','failed','unsupported','unknown'].includes(String(row.system_delivery)) ||
        ![null,'on-time','late','recovered'].includes(row.reason as null | string) || ![0,1].includes(row.app_displayed as number) ||
        typeof row.title !== 'string' || !row.title.trim() || !['default','pinned','hidden'].includes(String(row.menu)) ||
        ![0,1].includes(row.auto_excluded as number) ||
        (row.status === 'paused' ? !Number.isSafeInteger(row.paused_remaining_ms) || Number(row.paused_remaining_ms) <= 0 || Number(row.paused_remaining_ms) > Number(row.duration_ms) : row.paused_remaining_ms !== null) ||
        (row.restart_of !== null && (typeof row.restart_of !== 'string' || !/^[\w-]{1,80}$/.test(row.restart_of))))
      throw new Error('TIMER_STORAGE_INVALID');
    return { id: row.id, startedAt: Number(row.started_at), dueAt: Number(row.due_at), durationMs: Number(row.duration_ms),
      status: row.status as TimerRecord['status'], reason: row.reason as TimerRecord['reason'],
      systemDelivery: row.system_delivery as SystemDelivery, appDisplayed: row.app_displayed === 1,
      title: row.title, menu: row.menu as TimerMenu, autoExcluded: row.auto_excluded === 1,
      pausedRemainingMs: row.paused_remaining_ms as number | null, restartOf: row.restart_of as string | null };
  }
  all(): TimerRecord[] { return this.db.prepare('SELECT * FROM timers ORDER BY started_at, id').all().map(row => this.read(row)); }
  transaction<T>(work: () => T): T {
    this.db.exec('BEGIN IMMEDIATE');
    try { const value = work(); this.db.exec('COMMIT'); return value; }
    catch (error) { this.db.exec('ROLLBACK'); throw error; }
  }
  insert(id: string, now: number, durationMs = 300000, title = '타이머', menu: TimerMenu = 'default', restartOf: string | null = null): void {
    this.db.prepare(`INSERT INTO timers VALUES (?, ?, ?, ?, 'pending', NULL, 'not-requested', 0, ?, ?, 0, NULL, ?)`)
      .run(id, now, now + durationMs, durationMs, title, menu, restartOf);
  }
  setMenu(id: string, menu: TimerMenu, autoExcluded = false): boolean {
    return this.db.prepare("UPDATE timers SET menu=?,auto_excluded=? WHERE id=? AND status IN ('pending','paused')")
      .run(menu, Number(autoExcluded), id).changes === 1;
  }
  pause(id: string, remaining: number): boolean {
    return this.db.prepare("UPDATE timers SET status='paused',paused_remaining_ms=? WHERE id=? AND status='pending'").run(remaining,id).changes === 1;
  }
  resume(id: string, dueAt: number): boolean {
    return this.db.prepare("UPDATE timers SET status='pending',paused_remaining_ms=NULL,due_at=? WHERE id=? AND status='paused'").run(dueAt,id).changes === 1;
  }
  due(id: string, reason: TimerRecord['reason']): boolean {
    return this.db.prepare("UPDATE timers SET status='due', reason=?,menu=CASE WHEN menu='pinned' THEN 'default' ELSE menu END WHERE id=? AND status='pending'").run(reason, id).changes === 1;
  }
  cancel(id: string): boolean {
    return this.db.prepare("UPDATE timers SET status='cancelled',paused_remaining_ms=NULL,menu=CASE WHEN menu='pinned' THEN 'default' ELSE menu END WHERE id=? AND status!='cancelled'").run(id).changes === 1;
  }
  acknowledge(id: string): boolean {
    return this.db.prepare("UPDATE timers SET status='acknowledged' WHERE id=? AND status='due'").run(id).changes === 1;
  }
  delivery(id: string, state: SystemDelivery): void {
    this.db.prepare("UPDATE timers SET system_delivery=? WHERE id=? AND reason IS NOT NULL AND status IN ('due','acknowledged','cancelled')").run(state, id);
  }
  displayed(id: string): void {
    this.db.prepare("UPDATE timers SET app_displayed=1 WHERE id=? AND status='due'").run(id);
  }
  close(): void { this.db.close(); }
}
