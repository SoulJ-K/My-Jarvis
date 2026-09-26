import { closeSync, lstatSync, mkdirSync, openSync } from 'node:fs';
import path from 'node:path';
import { DatabaseSync } from 'node:sqlite';
import type { ScheduleDraft, ScheduleRecord } from '../shared/schedule';
import type { SystemDelivery } from '../shared/timer';

const APP_ID = 0x4a505333;
export const scheduleDatabasePath = (directory: string) => path.join(directory, 'assistant', 'schedules.sqlite3');

/** Independent failure boundary: neither pet nor timer storage is migrated. */
export class ScheduleRepository {
  private db: DatabaseSync;
  constructor(directory: string) {
    const file = scheduleDatabasePath(directory);
    mkdirSync(path.dirname(file), { recursive: true, mode: 0o700 });
    let created = false;
    try { const fd = openSync(file, 'wx', 0o600); closeSync(fd); created = true; }
    catch (error) { if ((error as NodeJS.ErrnoException).code !== 'EEXIST') throw new Error('SCHEDULE_STORAGE_FAILED'); }
    const stat = lstatSync(file);
    if (!stat.isFile() || stat.isSymbolicLink() || (!created && stat.size === 0)) throw new Error('SCHEDULE_STORAGE_INVALID');
    this.db = new DatabaseSync(file, { allowExtension: false, timeout: 1000 });
    try {
      this.db.exec('PRAGMA trusted_schema=OFF; PRAGMA synchronous=FULL');
      if (created) this.db.exec(`BEGIN IMMEDIATE;
        CREATE TABLE schedules (
          id TEXT PRIMARY KEY, kind TEXT NOT NULL CHECK(kind IN ('alarm','reminder')),
          content TEXT NOT NULL, due_at INTEGER NOT NULL, local_date_time TEXT NOT NULL,
          time_zone TEXT NOT NULL, utc_offset_minutes INTEGER NOT NULL, created_at INTEGER NOT NULL,
          status TEXT NOT NULL CHECK(status IN ('pending','due','cancelled','acknowledged')),
          reason TEXT CHECK(reason IN ('on-time','late','recovered')),
          system_delivery TEXT NOT NULL CHECK(system_delivery IN ('not-requested','requested','shown','failed','unsupported','unknown')),
          app_displayed INTEGER NOT NULL CHECK(app_displayed IN (0,1))
        ) STRICT;
        PRAGMA application_id=${APP_ID}; PRAGMA user_version=1; COMMIT;`);
      if (this.db.prepare('PRAGMA quick_check').get()?.quick_check !== 'ok' ||
          this.db.prepare('PRAGMA application_id').get()?.application_id !== APP_ID ||
          this.db.prepare('PRAGMA user_version').get()?.user_version !== 1) throw new Error('SCHEDULE_STORAGE_INVALID');
      this.all();
    } catch { this.db.close(); throw new Error('SCHEDULE_STORAGE_INVALID'); }
  }
  all(): ScheduleRecord[] {
    return this.db.prepare('SELECT * FROM schedules ORDER BY due_at, id').all().map(row => {
      if (typeof row.id !== 'string' || !/^[\w-]{1,80}$/.test(row.id) ||
          !['alarm','reminder'].includes(String(row.kind)) || typeof row.content !== 'string' ||
          row.content.length < 1 || row.content.length > 120 || !Number.isSafeInteger(row.due_at) ||
          !Number.isSafeInteger(row.created_at) || Number(row.due_at) <= Number(row.created_at) ||
          typeof row.local_date_time !== 'string' || !/^\d{4}-\d{2}-\d{2} \d{2}:\d{2}$/.test(row.local_date_time) ||
          typeof row.time_zone !== 'string' || !row.time_zone || !Number.isInteger(row.utc_offset_minutes) ||
          Math.abs(Number(row.utc_offset_minutes)) > 840 ||
          !['pending','due','cancelled','acknowledged'].includes(String(row.status)) ||
          !['not-requested','requested','shown','failed','unsupported','unknown'].includes(String(row.system_delivery)) ||
          ![null,'on-time','late','recovered'].includes(row.reason as null | string) || ![0,1].includes(row.app_displayed as number))
        throw new Error('SCHEDULE_STORAGE_INVALID');
      const due = new Date(Number(row.due_at));
      const local = new Date(Number(row.due_at) + Number(row.utc_offset_minutes) * 60000);
      if (!Number.isFinite(due.getTime()) || !Number.isFinite(local.getTime()) ||
          local.toISOString().slice(0,16).replace('T',' ') !== row.local_date_time)
        throw new Error('SCHEDULE_STORAGE_INVALID');
      try { new Intl.DateTimeFormat('en', { timeZone: row.time_zone }); }
      catch { throw new Error('SCHEDULE_STORAGE_INVALID'); }
      return { id: row.id, kind: row.kind as ScheduleRecord['kind'], content: row.content,
        dueAt: Number(row.due_at), localDateTime: row.local_date_time, timeZone: row.time_zone,
        utcOffsetMinutes: Number(row.utc_offset_minutes), createdAt: Number(row.created_at),
        status: row.status as ScheduleRecord['status'], reason: row.reason as ScheduleRecord['reason'],
        systemDelivery: row.system_delivery as SystemDelivery, appDisplayed: row.app_displayed === 1 };
    });
  }
  insert(draft: ScheduleDraft, now: number): void {
    this.db.prepare(`INSERT INTO schedules VALUES (?, ?, ?, ?, ?, ?, ?, ?, 'pending', NULL, 'not-requested', 0)`)
      .run(draft.id, draft.kind, draft.content, draft.dueAt, draft.localDateTime, draft.timeZone, draft.utcOffsetMinutes, now);
  }
  due(id: string, reason: ScheduleRecord['reason']): boolean {
    return this.db.prepare("UPDATE schedules SET status='due', reason=? WHERE id=? AND status='pending'").run(reason, id).changes === 1;
  }
  cancel(id: string): boolean {
    return this.db.prepare("UPDATE schedules SET status='cancelled' WHERE id=? AND status='pending'").run(id).changes === 1;
  }
  acknowledge(id: string): void {
    this.db.prepare("UPDATE schedules SET status='acknowledged' WHERE id=? AND status='due'").run(id);
  }
  delivery(id: string, state: SystemDelivery): void {
    this.db.prepare("UPDATE schedules SET system_delivery=? WHERE id=? AND status IN ('due','acknowledged')").run(state, id);
  }
  displayed(id: string): void {
    this.db.prepare("UPDATE schedules SET app_displayed=1 WHERE id=? AND status='due'").run(id);
  }
  close(): void { this.db.close(); }
}
