import { randomUUID } from 'node:crypto';
import { closeSync, lstatSync, mkdirSync, openSync } from 'node:fs';
import path from 'node:path';
import { DatabaseSync } from 'node:sqlite';
import { validateLifecycle, type Lifecycle } from '../pet/lifecycle';
import type { EggSnapshot } from '../shared/pet';

const FORMAT_VERSION = 1;
const APPLICATION_ID = 0x4a505431; // JPT1
export class PetStorageError extends Error {
  constructor(readonly code: 'CREATE_FAILED' | 'INVALID_STORE' | 'UNSUPPORTED_FORMAT' | 'READ_FAILED' | 'WRITE_FAILED') {
    super(code);
    this.name = 'PetStorageError';
  }
}

export function petDatabasePath(userData: string): string {
  return path.join(userData, 'pet', 'pet.sqlite3');
}

function readEgg(db: DatabaseSync): EggSnapshot {
  db.exec('PRAGMA trusted_schema = OFF');
  const check = db.prepare('PRAGMA quick_check').all();
  if (check.length !== 1 || check[0].quick_check !== 'ok') throw new PetStorageError('INVALID_STORE');
  if (db.prepare('PRAGMA application_id').get()?.application_id !== APPLICATION_ID) {
    throw new PetStorageError('INVALID_STORE');
  }
  const version = Number(db.prepare('PRAGMA user_version').get()?.user_version);
  if (![1, 2, 3].includes(version)) {
    throw new PetStorageError('UNSUPPORTED_FORMAT');
  }
  const rows = db.prepare('SELECT singleton, pet_id, created_at, stage FROM pet LIMIT 2').all();
  const row = rows[0];
  if (rows.length !== 1 || row.singleton !== 1 || !(version === 3 ? ['egg', 'baby'] : ['egg']).includes(String(row.stage)) ||
      typeof row.pet_id !== 'string' ||
      !/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/.test(row.pet_id) ||
      typeof row.created_at !== 'string' || !Number.isFinite(Date.parse(row.created_at)) ||
      new Date(row.created_at).toISOString() !== row.created_at) {
    throw new PetStorageError('INVALID_STORE');
  }
  if (version === 3) {
    const lifecycle = db.prepare('SELECT singleton, snapshot FROM lifecycle LIMIT 2').all();
    const name = db.prepare('SELECT name FROM pet WHERE singleton=1').get()?.name;
    if (lifecycle.length !== 1 || lifecycle[0].singleton !== 1 || typeof lifecycle[0].snapshot !== 'string') throw new PetStorageError('INVALID_STORE');
    try {
      const state: Lifecycle = JSON.parse(lifecycle[0].snapshot);
      validateLifecycle(state, row.pet_id, { trim: false, maxCodePoints: Number.MAX_SAFE_INTEGER });
      if (state.stage !== row.stage || state.name !== name) throw new Error();
    } catch { throw new PetStorageError('INVALID_STORE'); }
  }
  return Object.freeze({ petId: row.pet_id, createdAt: row.created_at, stage: row.stage as 'egg' | 'baby' });
}

/** Main process only. Call after acquiring Electron's single-instance lock.
 * An existing empty/invalid file is NEVER treated as a first launch.
 * Reserve with wx so a racing creator cannot truncate an existing pet.
 */
export function loadOrCreateEgg(userData: string): EggSnapshot {
  const file = petDatabasePath(userData);
  let created = false;
  let db: DatabaseSync | undefined;
  try {
    mkdirSync(path.dirname(file), { recursive: true, mode: 0o700 });
    try {
      const fd = openSync(file, 'wx', 0o600);
      created = true;
      closeSync(fd);
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== 'EEXIST') throw error;
    }
    const stat = lstatSync(file);
    if (!stat.isFile() || stat.isSymbolicLink() || (!created && stat.size === 0)) {
      throw new PetStorageError('INVALID_STORE');
    }
    db = new DatabaseSync(file, { readOnly: !created, allowExtension: false, timeout: 1000 });
    if (created) {
      db.exec('PRAGMA journal_mode = DELETE; PRAGMA synchronous = FULL; PRAGMA trusted_schema = OFF');
      db.exec('BEGIN IMMEDIATE');
      try {
        db.exec(`
          CREATE TABLE pet (
            singleton INTEGER PRIMARY KEY CHECK (singleton = 1),
            pet_id TEXT NOT NULL UNIQUE,
            created_at TEXT NOT NULL,
            stage TEXT NOT NULL CHECK (stage = 'egg')
          ) STRICT;
          PRAGMA application_id = ${APPLICATION_ID};
          PRAGMA user_version = ${FORMAT_VERSION};
        `);
        db.prepare('INSERT INTO pet (singleton, pet_id, created_at, stage) VALUES (1, ?, ?, ?)')
          .run(randomUUID(), new Date().toISOString(), 'egg');
        // Validate before committing or showing a pet; identity + format are one transaction.
        readEgg(db);
        db.exec('COMMIT');
      } catch (error) {
        try { db.exec('ROLLBACK'); } catch { /* Preserve original failure and file. */ }
        throw error;
      }
    }
    return readEgg(db);
  } catch (error) {
    // Do not log raw SQLite errors or contents; keep the original file for recovery.
    if (error instanceof PetStorageError) throw error;
    throw new PetStorageError(created ? 'CREATE_FAILED' : 'READ_FAILED');
  } finally {
    db?.close();
  }
}
