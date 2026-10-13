import { createHash, randomBytes } from 'node:crypto';
import { chmodSync, closeSync, fsyncSync, lstatSync, mkdirSync, openSync, readdirSync, readFileSync, renameSync, rmSync, writeSync } from 'node:fs';
import path from 'node:path';
import { DatabaseSync } from 'node:sqlite';

// D-072: automatic same-disk snapshots of the four stores while the pet runs.
// Main process only. Never restores, never touches the live stores' contents,
// and only ever deletes complete snapshot folders it created itself.

/** Store files, their application ids and the format each repository currently writes. */
export const SNAPSHOT_STORES = [
  ['pet/pet.sqlite3', 0x4a505431, 5],
  ['assistant/timers.sqlite3', 0x4a505432, 2],
  ['assistant/schedules.sqlite3', 0x4a505333, 1],
  ['assistant/followups.sqlite3', 0x4a504634, 1],
] as const;
export const SNAPSHOT_KEEP = 7;
export const SNAPSHOT_INTERVAL_MS = 24 * 60 * 60 * 1000;
export type SnapshotReason = 'daily' | 'quit' | 'pre-upgrade';

const NAME = /^(\d{8}T\d{6}\d{3}Z)-(daily|quit|pre-upgrade)-[0-9a-f]{6}$/;
const TEMP = /^\.tmp-\d{8}T\d{6}\d{3}Z-(daily|quit|pre-upgrade)-[0-9a-f]{6}$/;

export class SnapshotError extends Error {
  constructor(readonly code: 'SNAPSHOT_DIRECTORY_INVALID' | 'SNAPSHOT_NO_PET' | 'SNAPSHOT_COPY_FAILED' | 'SNAPSHOT_VERIFY_FAILED' | 'SNAPSHOT_WRITE_FAILED') {
    super(code);
    this.name = 'SnapshotError';
  }
}

export function snapshotDirectory(userData: string): string {
  return path.join(userData, 'snapshots');
}

function stamp(ms: number): string {
  return new Date(ms).toISOString().replace(/[-:.]/g, '');
}
function parseStamp(value: string): number {
  const m = /^(\d{4})(\d{2})(\d{2})T(\d{2})(\d{2})(\d{2})(\d{3})Z$/.exec(value)!;
  return Date.UTC(+m[1], +m[2] - 1, +m[3], +m[4], +m[5], +m[6], +m[7]);
}
function realDirectory(dir: string): boolean {
  try {
    const stat = lstatSync(dir);
    if (!stat.isDirectory() || stat.isSymbolicLink()) throw new SnapshotError('SNAPSHOT_DIRECTORY_INVALID');
    return true;
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'ENOENT') return false;
    throw error;
  }
}
function storeExists(file: string): boolean {
  try {
    const stat = lstatSync(file);
    return stat.isFile() && !stat.isSymbolicLink() && stat.size > 0;
  } catch { return false; }
}

/** Complete snapshots only (folder name + manifest), newest first. */
export function listSnapshots(userData: string): { name: string; createdAtMs: number; reason: SnapshotReason }[] {
  const dir = snapshotDirectory(userData);
  if (!realDirectory(dir)) return [];
  const result = [];
  for (const name of readdirSync(dir)) {
    const match = NAME.exec(name);
    if (!match) continue;
    try {
      if (!realDirectory(path.join(dir, name))) continue;
      const manifest = lstatSync(path.join(dir, name, 'manifest.json'));
      if (!manifest.isFile() || manifest.isSymbolicLink()) continue;
    } catch { continue; }
    result.push({ name, createdAtMs: parseStamp(match[1]), reason: match[2] as SnapshotReason });
  }
  return result.sort((a, b) => b.name.localeCompare(a.name));
}

/** A daily snapshot is due when none exists, a day passed, or the clock moved far backwards. */
export function snapshotDue(userData: string, now: number): boolean {
  const latest = listSnapshots(userData)[0];
  if (!latest) return true;
  return now - latest.createdAtMs >= SNAPSHOT_INTERVAL_MS || latest.createdAtMs - now >= SNAPSHOT_INTERVAL_MS;
}

/** True when an existing store is older than the format its repository will migrate it to. */
export function upgradePending(userData: string): boolean {
  for (const [file, , version] of SNAPSHOT_STORES) {
    const full = path.join(userData, file);
    if (!storeExists(full)) continue;
    let db: DatabaseSync | undefined;
    try {
      db = new DatabaseSync(full, { readOnly: true, allowExtension: false, timeout: 1000 });
      const current = Number(db.prepare('PRAGMA user_version').get()?.user_version);
      if (Number.isSafeInteger(current) && current < version) return true;
    } catch { /* The repository reports unreadable stores; a snapshot cannot help here. */ }
    finally { db?.close(); }
  }
  return false;
}

function writeManifest(file: string, value: unknown) {
  const fd = openSync(file, 'wx', 0o600);
  try { writeSync(fd, JSON.stringify(value, null, 2) + '\n'); fsyncSync(fd); } finally { closeSync(fd); }
}

/**
 * Copy each existing store with SQLite's VACUUM INTO into a hidden temp folder,
 * verify it, then rename it into place. Main-process writes are synchronous, so
 * no write can interleave between the four copies. Failure leaves no folder.
 */
export function createSnapshot(userData: string, reason: SnapshotReason, now: number, appVersion: string): string {
  if (!storeExists(path.join(userData, SNAPSHOT_STORES[0][0]))) throw new SnapshotError('SNAPSHOT_NO_PET');
  const dir = snapshotDirectory(userData);
  if (!realDirectory(dir)) mkdirSync(dir, { mode: 0o700 });
  const name = `${stamp(now)}-${reason}-${randomBytes(3).toString('hex')}`;
  const temp = path.join(dir, `.tmp-${name}`);
  mkdirSync(temp, { mode: 0o700 });
  try {
    const stores: Record<string, { sha256: string; format: number }> = {};
    for (const [file, applicationId, maxVersion] of SNAPSHOT_STORES) {
      const source = path.join(userData, file);
      if (!storeExists(source)) continue;
      const target = path.join(temp, file);
      mkdirSync(path.dirname(target), { recursive: true, mode: 0o700 });
      let db: DatabaseSync | undefined;
      try {
        db = new DatabaseSync(source, { readOnly: true, allowExtension: false, timeout: 1000 });
        db.prepare('VACUUM INTO ?').run(target);
        chmodSync(target, 0o600);
      } catch { throw new SnapshotError('SNAPSHOT_COPY_FAILED'); }
      finally { db?.close(); }
      let copy: DatabaseSync | undefined;
      try {
        copy = new DatabaseSync(target, { readOnly: true, allowExtension: false });
        const check = copy.prepare('PRAGMA integrity_check').all();
        const format = Number(copy.prepare('PRAGMA user_version').get()?.user_version);
        if (check.length !== 1 || check[0].integrity_check !== 'ok' ||
            copy.prepare('PRAGMA application_id').get()?.application_id !== applicationId ||
            !Number.isSafeInteger(format) || format < 1 || format > maxVersion) throw new Error();
        copy.close(); copy = undefined;
        stores[file] = { sha256: createHash('sha256').update(readFileSync(target)).digest('hex'), format };
      } catch { throw new SnapshotError('SNAPSHOT_VERIFY_FAILED'); }
      finally { copy?.close(); }
    }
    try {
      writeManifest(path.join(temp, 'manifest.json'), {
        format: 'jarvis-pet-auto-snapshot', version: 1, createdAt: new Date(now).toISOString(), reason, appVersion, stores,
      });
      renameSync(temp, path.join(dir, name));
    } catch { throw new SnapshotError('SNAPSHOT_WRITE_FAILED'); }
  } catch (error) {
    rmSync(temp, { recursive: true, force: true });
    throw error;
  }
  return name;
}

/** Keep the newest complete snapshots; remove leftover temp folders from interrupted runs. */
export function pruneSnapshots(userData: string, keep = SNAPSHOT_KEEP): string[] {
  const dir = snapshotDirectory(userData);
  if (!realDirectory(dir)) return [];
  const removed: string[] = [];
  const remove = (name: string) => {
    const target = path.join(dir, name);
    // Only real folders matching our own names, directly inside snapshots/.
    if (!realDirectory(target)) return;
    rmSync(target, { recursive: true, force: true });
    removed.push(name);
  };
  for (const old of listSnapshots(userData).slice(keep)) remove(old.name);
  for (const name of readdirSync(dir)) if (TEMP.test(name)) remove(name);
  return removed;
}
