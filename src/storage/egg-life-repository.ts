import { constants, copyFileSync, lstatSync, readFileSync } from 'node:fs';
import { DatabaseSync } from 'node:sqlite';
import { loadOrCreateEgg, petDatabasePath, PetStorageError } from './pet-repository';
import { advanceEggLife, careForEgg, type EggCareEvent, type EggCareKind, type EggLife } from '../pet/egg-life';

/** Read on the caller's transaction so elapsed time and real care records agree. */
export function readEggLife(db: DatabaseSync): EggLife {
  const rows = db.prepare('SELECT elapsed_ms, observed_at_ms FROM egg_life WHERE singleton = 1').all();
  const row = rows[0];
  if (rows.length !== 1 || !Number.isSafeInteger(row.elapsed_ms) || Number(row.elapsed_ms) < 0 ||
      !Number.isSafeInteger(row.observed_at_ms) || Number(row.observed_at_ms) < 0) {
    throw new PetStorageError('INVALID_STORE');
  }
  return { elapsedMs: Number(row.elapsed_ms), observedAtMs: Number(row.observed_at_ms) };
}

export function readEggCare(db: DatabaseSync): EggCareEvent[] {
  return db.prepare('SELECT kind, occurred_at_ms, elapsed_ms FROM egg_care ORDER BY id').all().map(row => ({
    kind: row.kind as EggCareKind, occurredAtMs: Number(row.occurred_at_ms), elapsedMs: Number(row.elapsed_ms),
  }));
}

/** Open only after the single-instance lock. Identity is validated before writable access. */
export function openEggLife(userData: string, now: () => number = Date.now) {
  const pet = loadOrCreateEgg(userData);
  const db = new DatabaseSync(petDatabasePath(userData), { allowExtension: false, timeout: 1000 });
  const transaction = <T>(work: () => T): T => {
    db.exec('BEGIN IMMEDIATE');
    try { const result = work(); db.exec('COMMIT'); return result; }
    catch (error) { db.exec('ROLLBACK'); throw error; }
  };
  function read(): EggLife {
    return readEggLife(db);
  }
  function write(life: EggLife) {
    db.prepare('UPDATE egg_life SET elapsed_ms = ?, observed_at_ms = ? WHERE singleton = 1')
      .run(life.elapsedMs, life.observedAtMs);
  }
  try {
    db.exec('PRAGMA trusted_schema = OFF; PRAGMA synchronous = FULL');
    if (db.prepare('PRAGMA user_version').get()?.user_version === 1) {
      // Preserve the validated v1 bytes before the first schema change (ADR-001).
      // The app owns the single-instance lock; this repository is its only writer.
      const file = petDatabasePath(userData);
      const backup = `${file}.v1-backup`;
      try { copyFileSync(file, backup, constants.COPYFILE_EXCL); }
      catch (error) {
        if ((error as NodeJS.ErrnoException).code !== 'EEXIST') throw error;
        const stat = lstatSync(backup);
        if (!stat.isFile() || stat.isSymbolicLink() || !readFileSync(backup).equals(readFileSync(file))) {
          throw new PetStorageError('INVALID_STORE');
        }
      }
      transaction(() => {
        db.exec(`CREATE TABLE egg_life (
          singleton INTEGER PRIMARY KEY CHECK (singleton = 1) REFERENCES pet(singleton),
          elapsed_ms INTEGER NOT NULL CHECK (elapsed_ms >= 0),
          observed_at_ms INTEGER NOT NULL CHECK (observed_at_ms >= 0)
        ) STRICT;
        CREATE TABLE egg_care (
          id INTEGER PRIMARY KEY,
          kind TEXT NOT NULL CHECK (kind IN ('touch', 'stroke')),
          occurred_at_ms INTEGER NOT NULL CHECK (occurred_at_ms >= 0),
          elapsed_ms INTEGER NOT NULL CHECK (elapsed_ms >= 0)
        ) STRICT;`);
        const life = advanceEggLife({ elapsedMs: 0, observedAtMs: Date.parse(pet.createdAt) }, now());
        db.prepare('INSERT INTO egg_life VALUES (1, ?, ?)').run(life.elapsedMs, life.observedAtMs);
        db.exec('PRAGMA user_version = 2');
      });
    }
    read();
    // Validate the required event columns even if no event has been saved yet.
    db.prepare('SELECT id, kind, occurred_at_ms, elapsed_ms FROM egg_care LIMIT 0').all();
  } catch (error) {
    db.close();
    if (error instanceof PetStorageError) throw error;
    throw new PetStorageError('READ_FAILED');
  }
  return {
    read,
    checkpoint() {
      try { return transaction(() => { const life = advanceEggLife(read(), now()); write(life); return life; }); }
      catch { throw new PetStorageError('WRITE_FAILED'); }
    },
    care(kind: EggCareKind) {
      try {
        return transaction(() => {
          const result = careForEgg(read(), kind, now());
          write(result.life);
          db.prepare('INSERT INTO egg_care (kind, occurred_at_ms, elapsed_ms) VALUES (?, ?, ?)')
            .run(result.event.kind, result.event.occurredAtMs, result.event.elapsedMs);
          return result.life;
        });
      } catch { throw new PetStorageError('WRITE_FAILED'); }
    },
    close() { db.close(); },
  };
}
