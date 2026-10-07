import { closeSync, lstatSync, mkdirSync, openSync } from 'node:fs';
import path from 'node:path';
import { DatabaseSync } from 'node:sqlite';
import { followupKey, type FollowupKey, type FollowupRecord } from '../shared/followup';

const APP_ID = 0x4a504634;
export const followupDatabasePath = (directory: string) => path.join(directory, 'assistant', 'followups.sqlite3');
const integer = (n: unknown) => Number.isSafeInteger(n);
const nullableTime = (n: unknown) => n === null || integer(n);
const answers = [null, 'not-yet', 'done'];
export function validFollowup(value: unknown): value is FollowupRecord {
  if (!value || typeof value !== 'object') return false;
  const r = value as FollowupRecord;
  if (!['timer','alarm','reminder'].includes(r.kind) || typeof r.id !== 'string' || !/^[\w-]{1,80}$/.test(r.id) ||
      typeof r.title !== 'string' || !r.title.trim() || !integer(r.dueAt) || !integer(r.firstProcessedAt) ||
      !nullableTime(r.acknowledgedAt) || !['active','done','cancelled','legacy'].includes(r.status) ||
      !integer(r.round) || r.round < 0 || !Array.isArray(r.rounds) || r.rounds.length !== r.round + 1 ||
      !nullableTime(r.nextReminderAt) || !nullableTime(r.cardAt) || !integer(r.notYetCount) || r.notYetCount < 0 || r.notYetCount > r.round + 1 ||
      !nullableTime(r.completedAt)) return false;
  if (!r.rounds.every((s,i) => s && s.number === i && integer(s.dueAt) && integer(s.processedAt) && nullableTime(s.acknowledgedAt) &&
      ['not-requested','requested','shown','failed','unsupported','unknown'].includes(s.delivery) && answers.includes(s.answer))) return false;
  if (r.status === 'done' ? r.completedAt === null : r.completedAt !== null) return false;
  if (r.status !== 'active' && (r.nextReminderAt !== null || r.cardAt !== null)) return false;
  if (r.status === 'legacy' && (r.notYetCount !== 0 || r.round !== 0)) return false;
  if (r.undo !== null && (r.status !== 'done' || !r.undo || !integer(r.undo.expiresAt) ||
      !nullableTime(r.undo.nextReminderAt) || !nullableTime(r.undo.cardAt) || !answers.includes(r.undo.answer))) return false;
  return true;
}

/** Small independent ledger. It cannot open or alter timer, schedule or pet data. */
export class FollowupRepository {
  private db: DatabaseSync;
  constructor(directory: string) {
    const file = followupDatabasePath(directory);
    mkdirSync(path.dirname(file), { recursive: true, mode: 0o700 });
    let created = false;
    try { const fd = openSync(file, 'wx', 0o600); closeSync(fd); created = true; }
    catch (error) { if ((error as NodeJS.ErrnoException).code !== 'EEXIST') throw new Error('FOLLOWUP_STORAGE_FAILED'); }
    const stat = lstatSync(file);
    if (!stat.isFile() || stat.isSymbolicLink() || (!created && stat.size === 0)) throw new Error('FOLLOWUP_STORAGE_INVALID');
    this.db = new DatabaseSync(file, { allowExtension: false, timeout: 1000 });
    try {
      this.db.exec('PRAGMA trusted_schema=OFF; PRAGMA synchronous=FULL');
      if (created) this.db.exec(`BEGIN IMMEDIATE;
        CREATE TABLE followups (key TEXT PRIMARY KEY, document TEXT NOT NULL) STRICT;
        PRAGMA application_id=${APP_ID}; PRAGMA user_version=1; COMMIT;`);
      if (this.db.prepare('PRAGMA quick_check').get()?.quick_check !== 'ok' ||
          this.db.prepare('PRAGMA application_id').get()?.application_id !== APP_ID ||
          this.db.prepare('PRAGMA user_version').get()?.user_version !== 1) throw new Error('FOLLOWUP_STORAGE_INVALID');
      this.all();
    } catch { this.db.close(); throw new Error('FOLLOWUP_STORAGE_INVALID'); }
  }
  transaction<T>(work: () => T): T {
    this.db.exec('BEGIN IMMEDIATE');
    try { const result = work(); this.db.exec('COMMIT'); return result; }
    catch (error) { this.db.exec('ROLLBACK'); throw error; }
  }
  all(): FollowupRecord[] {
    return this.db.prepare('SELECT * FROM followups ORDER BY key').all().map(row => {
      const value: unknown = JSON.parse(String(row.document));
      if (!validFollowup(value) || followupKey(value) !== row.key) throw new Error('FOLLOWUP_STORAGE_INVALID');
      return value;
    });
  }
  get(key: FollowupKey): FollowupRecord | undefined { return this.all().find(r => followupKey(r) === followupKey(key)); }
  save(record: FollowupRecord): void {
    if (!validFollowup(record)) throw new Error('FOLLOWUP_STORAGE_INVALID');
    this.db.prepare('INSERT INTO followups VALUES (?, ?) ON CONFLICT(key) DO UPDATE SET document=excluded.document')
      .run(followupKey(record), JSON.stringify(record));
  }
  close(): void { this.db.close(); }
}
