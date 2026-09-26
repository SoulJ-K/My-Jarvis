import { constants, copyFileSync, lstatSync, readFileSync } from 'node:fs';
import { DatabaseSync } from 'node:sqlite';
import { advanceBabyLife, initialBabyLife, validateBabyLife, type BabyLife, type BabyCommand } from '../pet/baby-life';
import { loadOrCreateEgg, petDatabasePath } from './pet-repository';

/** Same pet DB: identity remains unchanged. State and experiences commit together. */
export class BabyLifeRepository {
  private readonly db: DatabaseSync;
  constructor(directory: string, private readonly now: () => number = Date.now) {
    loadOrCreateEgg(directory);
    const file = petDatabasePath(directory);
    this.db = new DatabaseSync(file, { allowExtension: false, timeout: 1000 });
    try {
      this.db.exec('PRAGMA trusted_schema=OFF; PRAGMA synchronous=FULL; PRAGMA foreign_keys=ON');
      const version = this.db.prepare('PRAGMA user_version').get()?.user_version;
      if (version === 3) {
        const backup = `${file}.v3-backup`;
        try { copyFileSync(file, backup, constants.COPYFILE_EXCL); }
        catch (error) {
          if ((error as NodeJS.ErrnoException).code !== 'EEXIST') throw error;
          const stat = lstatSync(backup);
          if (!stat.isFile() || stat.isSymbolicLink() || !readFileSync(backup).equals(readFileSync(file))) throw new Error();
        }
        this.transaction(() => {
          this.db.exec(`CREATE TABLE baby_life (singleton INTEGER PRIMARY KEY CHECK(singleton=1) REFERENCES pet(singleton), snapshot TEXT NOT NULL) STRICT;
            CREATE TABLE baby_experience (id INTEGER PRIMARY KEY, kind TEXT NOT NULL CHECK(kind IN ('food_offered','meal_finished','sleep_completed','touch','sleep_touch')), at_ms INTEGER NOT NULL CHECK(at_ms>=0), duration_ms INTEGER CHECK(duration_ms>=0)) STRICT;
            PRAGMA user_version=4;`);
          // Legacy v3 has no naming timestamp. Start tracking at migration,
          // without inventing a historical birth time or care history.
          const pet = this.db.prepare('SELECT stage, name FROM pet WHERE singleton=1').get();
          if (pet?.stage === 'baby' && typeof pet.name === 'string') {
            const state = initialBabyLife(this.now()); validateBabyLife(state);
            this.db.prepare('INSERT INTO baby_life VALUES(1, ?)').run(JSON.stringify(state));
          }
        });
      } else if (version !== 4) throw new Error();
      this.db.prepare('SELECT kind, at_ms, duration_ms FROM baby_experience LIMIT 0').all();
      const rows = this.db.prepare('SELECT snapshot FROM baby_life').all();
      const pet = this.db.prepare('SELECT stage, name FROM pet WHERE singleton=1').get();
      const named = pet?.stage === 'baby' && typeof pet.name === 'string';
      if (rows.length !== (named ? 1 : 0)) throw new Error();
      if (rows.length) this.read();
    } catch { this.db.close(); throw new Error('BABY_STORAGE_INVALID'); }
  }
  private transaction<T>(work: () => T): T {
    this.db.exec('BEGIN IMMEDIATE');
    try { const value = work(); this.db.exec('COMMIT'); return value; }
    catch (error) { try { this.db.exec('ROLLBACK'); } catch {} throw error; }
  }
  read(): BabyLife | null {
    const row = this.db.prepare('SELECT snapshot FROM baby_life WHERE singleton=1').get();
    if (!row) return null;
    const state = JSON.parse(String(row.snapshot)) as BabyLife;
    validateBabyLife(state); return state;
  }
  apply(command: BabyCommand): BabyLife {
    try {
      return this.transaction(() => {
        const pet = this.db.prepare('SELECT stage, name FROM pet WHERE singleton=1').get();
        if (pet?.stage !== 'baby' || typeof pet.name !== 'string') throw new Error('BABY_NOT_READY');
        const now = this.now();
        const saved = this.read();
        if (!saved) throw new Error('BABY_STATE_MISSING');
        const before = saved;
        const { state, events } = advanceBabyLife(before, now, command);
        if (saved && state.revision === saved.revision) return state;
        this.db.prepare('INSERT INTO baby_life VALUES(1, ?) ON CONFLICT(singleton) DO UPDATE SET snapshot=excluded.snapshot').run(JSON.stringify(state));
        for (const event of events) this.db.prepare('INSERT INTO baby_experience(kind,at_ms,duration_ms) VALUES(?,?,?)')
          .run(event.kind, event.atMs, event.durationMs ?? null);
        return state;
      });
    } catch { throw new Error('BABY_WRITE_FAILED'); }
  }
  close() { this.db.close(); }
}
