import { advanceBabySocial, initialBabySocial, socialView, validateBabySocial, type BabySocial, type SocialCommand } from '../pet/baby-social';
import { constants, copyFileSync, lstatSync, readFileSync } from 'node:fs';
import { DatabaseSync } from 'node:sqlite';
import { advanceBabyLife, babyView, cycle, initialBabyLife, validateBabyLife, validateAttention, canStartMeal, QUIET_ATTENTION, type BabyAttention, type BabyPosition, type BabyLife, type BabyCommand } from '../pet/baby-life';
import { loadOrCreateEgg, petDatabasePath } from './pet-repository';

/** Same pet DB: identity remains unchanged. State and experiences commit together. */
export class BabyLifeRepository {
  private readonly db: DatabaseSync;
  private attention: BabyAttention = { ...QUIET_ATTENTION };
  private attentionInitialized = false;
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
      } else if (version !== 4 && version !== 5) throw new Error();
      this.db.prepare('SELECT kind, at_ms, duration_ms FROM baby_experience LIMIT 0').all();
      const rows = this.db.prepare('SELECT snapshot FROM baby_life').all();
      const pet = this.db.prepare('SELECT stage, name FROM pet WHERE singleton=1').get();
      const named = pet?.stage === 'baby' && typeof pet.name === 'string';
      if (rows.length !== (named ? 1 : 0)) throw new Error();
      if (rows.length) this.read();
      if (this.db.prepare('PRAGMA user_version').get()?.user_version === 4) {
        const backup = `${file}.v4-backup`;
        try { copyFileSync(file, backup, constants.COPYFILE_EXCL); }
        catch (error) {
          if ((error as NodeJS.ErrnoException).code !== 'EEXIST') throw error;
          const stat = lstatSync(backup);
          if (!stat.isFile() || stat.isSymbolicLink() || !readFileSync(backup).equals(readFileSync(file))) throw new Error();
        }
        this.transaction(() => {
          this.db.exec(`CREATE TABLE baby_social (singleton INTEGER PRIMARY KEY CHECK(singleton=1) REFERENCES pet(singleton), snapshot TEXT NOT NULL) STRICT;
            CREATE TABLE baby_social_experience (id INTEGER PRIMARY KEY, kind TEXT NOT NULL CHECK(kind IN ('praise','reunion','repeated_touch','cursor_play','orb_play')), at_ms INTEGER NOT NULL CHECK(at_ms>=0)) STRICT;
            PRAGMA user_version=5;`);
          const life = this.read();
          if (life) this.db.prepare('INSERT INTO baby_social VALUES(1, ?)').run(JSON.stringify(initialBabySocial(life.elapsedMs)));
        });
      }
      const socialRows = this.db.prepare('SELECT snapshot FROM baby_social').all();
      if (socialRows.length !== rows.length) throw new Error();
      this.db.prepare('SELECT kind, at_ms FROM baby_social_experience LIMIT 0').all();
      if (rows.length) this.readSocial();
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
  readSocial(): BabySocial {
    const row = this.db.prepare('SELECT snapshot FROM baby_social WHERE singleton=1').get();
    if (!row) throw new Error('SOCIAL_STATE_MISSING');
    const state = JSON.parse(String(row.snapshot)) as BabySocial;
    validateBabySocial(state);
    if (state.elapsedMs !== this.read()?.elapsedMs) throw new Error('SOCIAL_STATE_MISMATCH');
    return state;
  }
  view(state: BabyLife) {
    const lifecycle = JSON.parse(String(this.db.prepare('SELECT snapshot FROM lifecycle WHERE singleton=1').get()!.snapshot));
    if (typeof lifecycle.orbId !== 'string') throw new Error('ORB_MISSING');
    const view = babyView(state, this.attention);
    return { ...view, social: socialView(this.readSocial(), lifecycle.orbId,
      view.behavior === 'resting', view.behavior === 'drowsy') };
  }
  apply(command: BabyCommand | SocialCommand): BabyLife {
    try {
      return this.transaction(() => {
        const pet = this.db.prepare('SELECT stage, name FROM pet WHERE singleton=1').get();
        if (pet?.stage !== 'baby' || typeof pet.name !== 'string') throw new Error('BABY_NOT_READY');
        const now = this.now();
        const saved = this.read();
        if (!saved) throw new Error('BABY_STATE_MISSING');
        const before = saved;
        const socialBefore = this.readSocial();
        const bodyCommand = command.type === 'feed' || command.type === 'touch' || command.type === 'snack-begin' || command.type === 'snack-finished' || command.type === 'meal-deferred' ? command : { type: 'tick' } as const;
        const { state, events } = advanceBabyLife(before, now, bodyCommand, this.attention);
        if (!state.attentionPreference) {
          const identity = String(this.db.prepare('SELECT snapshot FROM lifecycle WHERE singleton=1').get()!.snapshot);
          const hash = [...String(JSON.parse(identity).orbId)].reduce((sum, c) => sum + c.charCodeAt(0), 0);
          state.attentionPreference = hash % 2 ? 'cursor' : 'bottom'; state.revision++;
        }
        const behavior = babyView(state, this.attention).behavior;
        const sleepEndsAt = behavior === 'sleeping' ? state.elapsedMs + cycle - state.elapsedMs % cycle : undefined;
        const social = advanceBabySocial(socialBefore, state.elapsedMs, behavior === 'resting',
          command.type === 'feed' || command.type === 'snack-begin' || command.type === 'snack-finished' || command.type === 'meal-deferred' ? { type: 'stop' } : command, sleepEndsAt);
        if (JSON.stringify(social.state) !== JSON.stringify(socialBefore) && state.revision === saved.revision) state.revision++;
        if (state.revision === saved.revision) return state;
        this.db.prepare('INSERT INTO baby_life VALUES(1, ?) ON CONFLICT(singleton) DO UPDATE SET snapshot=excluded.snapshot').run(JSON.stringify(state));
        this.db.prepare('UPDATE baby_social SET snapshot=? WHERE singleton=1').run(JSON.stringify(social.state));
        for (const kind of social.events) this.db.prepare('INSERT INTO baby_social_experience(kind,at_ms) VALUES(?,?)').run(kind, state.observedAtMs);
        for (const event of events) this.db.prepare('INSERT INTO baby_experience(kind,at_ms,duration_ms) VALUES(?,?,?)')
          .run(event.kind, event.atMs, event.durationMs ?? null);
        return state;
      });
    } catch { throw new Error('BABY_WRITE_FAILED'); }
  }
  setAttention(attention: BabyAttention): void {
    validateAttention(attention);
    if (this.attentionInitialized && attention.holdLife === this.attention.holdLife &&
      attention.level === this.attention.level && attention.intervalSeconds === this.attention.intervalSeconds) return;
    if (this.attentionInitialized && this.read()) this.apply({ type: 'tick' });
    const previous = this.attention;
    this.attention = { ...attention };
    try { if (this.read()) this.apply({ type: 'tick' }); }
    catch (error) { this.attention = previous; throw error; }
    this.attentionInitialized = true;
  }
  canEatSnack(): boolean {
    if (!this.read()) return false;
    const state = this.apply({ type: 'tick' });
    const allowed = canStartMeal(state, this.attention) && babyView(state, this.attention).behavior !== 'sleeping';
    if (!allowed) this.apply({ type: 'meal-deferred' });
    return allowed;
  }
  /** Call once per successful deletion receipt. Eating resumes across restart and
   * completes through the normal tick, then starts the shared fifteen-minute gap. */
  beginSnackMeal(receiptId?: string): void { this.apply({ type: 'snack-begin', receiptId }); }
  /** Call only after an actually successful snack. Never use for an attempted deletion. */
  finishSnack(): void { this.apply({ type: 'snack-finished' }); }
  readHome(): BabyPosition | null { return this.read()?.home ?? null; }
  setHome(home: BabyPosition): void {
    if (!home || !Number.isFinite(home.x) || !Number.isFinite(home.y)) throw new Error('BABY_HOME_INVALID');
    this.transaction(() => {
      const state = this.read();
      if (!state) throw new Error('BABY_NOT_READY');
      state.home = { x: Math.round(home.x), y: Math.round(home.y) }; state.revision++;
      validateBabyLife(state);
      this.db.prepare('UPDATE baby_life SET snapshot=? WHERE singleton=1').run(JSON.stringify(state));
    });
  }
  close() { this.db.close(); }
}
