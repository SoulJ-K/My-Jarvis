import { constants, copyFileSync, lstatSync, readFileSync } from 'node:fs';
import { DatabaseSync } from 'node:sqlite';
import { loadOrCreateEgg, petDatabasePath } from './pet-repository';
import { openEggLife } from './egg-life-repository';
import { advanceLifecycle, initialLifecycle, validateLifecycle, type Lifecycle, type LifecycleCommand, type NamePolicy } from '../pet/lifecycle';

export const lifecycleDatabasePath = petDatabasePath;
export interface LifecycleOptions {
  namePolicy: NamePolicy;
  /** Integration must keep this false for packaged/ordinary product runs. */
  developmentTrigger?: boolean;
}

/** Main process only, after the app single-instance lock. The original pet row is
 * identity provenance. Growth, name and scene checkpoint share one transaction.
 * A v2 backup is preserved before migration; invalid stores are never replaced. */
export class LifecycleRepository {
  private readonly db: DatabaseSync;
  private readonly petId: string;
  private readonly options: LifecycleOptions;
  constructor(directory: string, options: LifecycleOptions) {
    this.options = { ...options, namePolicy: { ...options.namePolicy } };
    // Validate policy even before a name exists.
    if (!Number.isSafeInteger(options.namePolicy.maxCodePoints) || options.namePolicy.maxCodePoints < 1 ||
        typeof options.namePolicy.trim !== 'boolean') throw new Error('INVALID_NAME_POLICY');
    this.petId = loadOrCreateEgg(directory).petId;
    // Reuse the validated v1→v2 migration and its original backup policy.
    openEggLife(directory).close();
    const file = lifecycleDatabasePath(directory);
    let db: DatabaseSync | undefined;
    try {
      db = new DatabaseSync(file, { allowExtension: false, timeout: 1000 });
      this.db = db;
      db.exec('PRAGMA trusted_schema=OFF; PRAGMA synchronous=FULL');
      if (db.prepare('PRAGMA user_version').get()?.user_version === 2) {
        const backup = `${file}.v2-backup`;
        try { copyFileSync(file, backup, constants.COPYFILE_EXCL); }
        catch (error) {
          if ((error as NodeJS.ErrnoException).code !== 'EEXIST') throw error;
          const stat = lstatSync(backup);
          if (!stat.isFile() || stat.isSymbolicLink() || !readFileSync(backup).equals(readFileSync(file))) throw new Error();
        }
        // SQLite table rebuild: temporarily disable FK enforcement outside the
        // transaction, then validate all references before committing.
        db.exec('PRAGMA foreign_keys=OFF');
        this.transaction(() => {
          db!.exec(`CREATE TABLE pet_v3 (
            singleton INTEGER PRIMARY KEY CHECK(singleton=1), pet_id TEXT NOT NULL UNIQUE,
            created_at TEXT NOT NULL, stage TEXT NOT NULL CHECK(stage IN ('egg','baby')), name TEXT
          ) STRICT;
          INSERT INTO pet_v3 SELECT singleton, pet_id, created_at, stage, NULL FROM pet;
          DROP TABLE pet;
          ALTER TABLE pet_v3 RENAME TO pet;
          CREATE TABLE lifecycle (singleton INTEGER PRIMARY KEY CHECK(singleton=1) REFERENCES pet(singleton), snapshot TEXT NOT NULL) STRICT;`);
          db!.prepare('INSERT INTO lifecycle VALUES (1, ?)').run(JSON.stringify(initialLifecycle(this.petId)));
          db!.exec('PRAGMA user_version=3');
          this.read();
          if (db!.prepare('PRAGMA foreign_key_check').all().length) throw new Error();
        });
        db.exec('PRAGMA foreign_keys=ON');
      }
      this.read();
    } catch { db?.close(); throw new Error('LIFECYCLE_STORAGE_INVALID'); }
  }
  private transaction<T>(work: () => T): T {
    this.db.exec('BEGIN IMMEDIATE');
    try { const result = work(); this.db.exec('COMMIT'); return result; }
    catch (error) { try { this.db.exec('ROLLBACK'); } catch { /* Preserve original failure. */ } throw error; }
  }
  read(): Lifecycle {
    try {
      const rows = this.db.prepare('SELECT singleton, snapshot FROM lifecycle LIMIT 2').all();
      if (rows.length !== 1 || rows[0].singleton !== 1 || typeof rows[0].snapshot !== 'string') throw new Error();
      const state: Lifecycle = JSON.parse(rows[0].snapshot);
      validateLifecycle(state, this.petId, this.options.namePolicy);
      const pet = this.db.prepare('SELECT stage, name FROM pet WHERE singleton=1').get();
      if (pet?.stage !== state.stage || pet.name !== state.name) throw new Error();
      return Object.freeze(state);
    } catch { throw new Error('LIFECYCLE_STORAGE_INVALID'); }
  }
  /** Revision belongs to the displayed scene. Duplicate/late callbacks cannot skip
   * another scene. Callers render only the returned committed snapshot. */
  apply(expectedRevision: number, command: LifecycleCommand): Lifecycle {
    if (command.type === 'prepare' && this.options.developmentTrigger !== true) throw new Error('HATCH_TRIGGER_DISABLED');
    if (!Number.isSafeInteger(expectedRevision) || expectedRevision < 0) throw new Error('INVALID_REVISION');
    try {
      return this.transaction(() => {
        const before = this.read();
        if (before.revision !== expectedRevision) return before;
        const after = advanceLifecycle(before, command, this.options.namePolicy);
        validateLifecycle(after, this.petId, this.options.namePolicy);
        if (after !== before) {
          this.db.prepare('UPDATE pet SET stage=?, name=? WHERE singleton=1').run(after.stage, after.name);
          this.db.prepare('UPDATE lifecycle SET snapshot=? WHERE singleton=1').run(JSON.stringify(after));
        }
        return Object.freeze(after);
      });
    } catch (error) {
      if (error instanceof Error && ['INVALID_NAME', 'INVALID_HATCH_ORDER', 'LIFECYCLE_STORAGE_INVALID'].includes(error.message)) throw error;
      throw new Error('LIFECYCLE_WRITE_FAILED');
    }
  }
  close(): void { this.db.close(); }
}
