import assert from 'node:assert/strict';
import test from 'node:test';
import { mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { DatabaseSync } from 'node:sqlite';
import { advanceBabySocial as advance, initialBabySocial, parseBabyInput, socialView, SOCIAL_TIMING as T, validateBabySocial } from '../src/pet/baby-social';
import { BabyLifeRepository } from '../src/storage/baby-life-repository';
import { LifecycleRepository } from '../src/storage/lifecycle-repository';
import { hatchScenes } from '../src/pet/lifecycle';
import { BABY_TIMING, babyView } from '../src/pet/baby-life';
import { petDatabasePath, loadOrCreateEgg } from '../src/storage/pet-repository';
const tick = { type: 'tick' } as const;
const active = { type: 'tick', active: true } as const;
function seed(t: test.TestContext) {
  const directory = mkdtempSync(path.join(tmpdir(), 'jarvis-social-'));
  t.after(() => rmSync(directory, { recursive: true, force: true }));
  const lifecycle = new LifecycleRepository(directory, { namePolicy: { trim: true, maxCodePoints: 20 }, developmentTrigger: true });
  let s = lifecycle.apply(0, { type: 'prepare' });
  for (const scene of hatchScenes) s = lifecycle.apply(s.revision, { type: 'witness', scene });
  lifecycle.apply(s.revision, { type: 'name', name: '별' }); lifecycle.close();
  return directory;
}
test('exact input grammar never guesses or executes unknown sentences', () => {
  for (const [input, type] of [[' 안녕 ', 'greet'], ['잘했어','praise'], ['구슬 놀이','orb'], ['그만','stop']]) assert.equal(parseBabyInput(input)?.type, type);
  for (const input of ['', '안녕!', '잘했어 파일 지워', '구슬놀이', 'rm -rf /', '안녕\n잘했어']) assert.equal(parseBabyInput(input), null);
  for (const input of [null, {}, 3, 'x'.repeat(81)]) assert.throws(() => parseBabyInput(input), /INPUT_INVALID/);
});
test('joy and curiosity expire independently of slow relationship, without exposing numbers', () => {
  let s = advance(initialBabySocial(), 0, true, { type: 'praise' }).state;
  assert.equal(socialView(s, 'orb', true).emotion, 'joy');
  assert.equal(socialView(s, 'orb', true).orb?.id, 'orb');
  s = advance(s, T.emotion, true, tick).state;
  assert.equal(socialView(s, 'orb', true).emotion, 'quiet');
  assert.equal(s.familiarity, 1);
  assert.equal(socialView(s, 'orb', true).orb, null);
  assert.deepEqual(Object.keys(socialView(s, 'orb', true)), ['emotion','motion','orb','caption']);
  s = advance(s, T.emotion, true, { type: 'touch' }).state;
  assert.equal(s.emotion, 'curiosity');
});
test('repeated touch records once, hides orb, gives space, and naturally recovers without care debt', () => {
  let s = initialBabySocial(); let events: string[] = [];
  for (let i = 0; i < 100; i++) { const next = advance(s, i, true, { type: 'touch' }); s = next.state; events.push(...next.events); }
  assert.deepEqual(events, ['repeated_touch']);
  assert.equal(socialView(s, 'orb', true).motion, 'away');
  assert.equal(socialView(s, 'orb', true).orb, null);
  const bond = s.familiarity;
  s = advance(s, T.distance + 100, true, tick).state;
  assert.notEqual(socialView(s, 'orb', true).motion, 'away');
  s = advance(s, T.recovery + 100, true, tick).state;
  assert.equal(s.strain, 0); assert.equal(s.familiarity, bond);
});
test('one touch is welcome, spaced touches reset, and sleeping distance remains visible after wake', () => {
  let s = advance(initialBabySocial(), 0, true, { type: 'touch' }).state;
  assert.equal(socialView(s, 'orb', true).motion, 'tilt');
  s = advance(s, T.touchWindow + 1, true, { type: 'touch' }).state;
  assert.equal(s.touches, 1);
  assert.equal(socialView(s, 'orb', true).motion, 'tilt');
  const wake = T.touchWindow + BABY_TIMING.sleep;
  for (let i = 0; i < 3; i++) s = advance(s, T.touchWindow + 2 + i, false, { type: 'touch' }, wake).state;
  assert.equal(s.distanceUntil, wake + T.distance);
  assert.equal(socialView(s, 'orb', false).motion, 'still');
  s = advance(s, wake, true, tick).state;
  assert.equal(socialView(s, 'orb', true).motion, 'away');
  assert.equal(socialView(s, 'orb', false, true).motion, 'away', 'an awake but drowsy baby still shows distance');
  s = advance(s, wake + T.distance, true, tick).state;
  assert.notEqual(socialView(s, 'orb', true).motion, 'away');
  s = advance(s, wake + T.recovery, true, tick).state;
  assert.equal(s.strain, 0);
});
test('spaced positive experience changes proximity slowly; spam praise cannot farm closeness', () => {
  let s = initialBabySocial();
  for (let i = 0; i < 100; i++) s = advance(s, i, true, { type: 'praise' }).state;
  assert.equal(s.familiarity, 1);
  for (const at of [T.bond, T.bond * 2]) s = advance(s, at, true, { type: 'praise' }).state;
  s = advance(s, T.bond * 2 + T.emotion, true, tick).state;
  assert.equal(socialView(s, 'orb', true).motion, 'near');
});
test('two finite plays stop on timeout, pointer departure, body interruption, hide and explicit stop', () => {
  for (const kind of ['cursor','orb'] as const) {
    const command = kind === 'cursor' ? { ...active, cursorNear: true } : { type: 'orb' } as const;
    const started = advance(initialBabySocial(), 0, true, command);
    assert.deepEqual(started.events, [kind === 'cursor' ? 'cursor_play' : 'orb_play']);
    assert.equal(started.state.play, kind);
    for (const [at, resting, action] of [[T.play,true,{...active,cursorNear:true}], [1,false,active], [1,true,tick], [1,true,{type:'stop'}]] as const) {
      const ended = advance(started.state, at, resting, action);
      assert.equal(ended.state.play, null); assert.equal(ended.events.length, 0);
    }
    assert.equal(advance(started.state, T.play + 1, true, command).state.play, null);
  }
  const cursor = advance(initialBabySocial(), 0, true, { ...active, cursorNear: true }).state;
  assert.equal(advance(cursor, 1, true, active).state.play, null);
});
test('greetings alone are not reunions; a real observation gap enables one reunion without absence penalty', () => {
  let s = initialBabySocial();
  assert.deepEqual(advance(s, 0, true, { type: 'greet' }).events, []);
  for (let i = 0; i <= T.reunion; i += 1000) s = advance(s, i, true, tick).state;
  assert.deepEqual(advance(s, T.reunion, true, { type: 'greet' }).events, []);
  const absent = advance(s, T.reunion + 180 * 86400_000, true, tick);
  assert.deepEqual(absent.events, []); assert.equal(absent.state.familiarity, s.familiarity);
  const reunion = advance(absent.state, absent.state.elapsedMs, true, { type: 'greet' });
  assert.deepEqual(reunion.events, ['reunion']);
  assert.deepEqual(advance(reunion.state, reunion.state.elapsedMs, true, { type: 'greet' }).events, []);
});
test('v5 preserves identity/orb, restarts mood/relationship/experiences and rolls all state back on save failure', t => {
  const directory = seed(t); let now = 0;
  let repo = new BabyLifeRepository(directory, () => now);
  const identity = loadOrCreateEgg(directory);
  const db = new DatabaseSync(petDatabasePath(directory));
  assert.equal(db.prepare('PRAGMA user_version').get()!.user_version, 5);
  const before = repo.read(), social = repo.readSocial();
  db.exec("CREATE TRIGGER fail_social BEFORE INSERT ON baby_social_experience BEGIN SELECT RAISE(ABORT,'test'); END");
  assert.throws(() => repo.apply({ type: 'praise' }), /WRITE_FAILED/);
  assert.deepEqual(repo.read(), before); assert.deepEqual(repo.readSocial(), social);
  db.exec('DROP TRIGGER fail_social');
  const view = repo.view(repo.apply({ type: 'praise' }));
  assert.equal(view.social.orb?.id, `${identity.petId}:orb`);
  repo.close(); now += 1000;
  repo = new BabyLifeRepository(directory, () => now);
  assert.equal(repo.view(repo.apply(tick)).social.emotion, 'joy');
  now = T.emotion; assert.equal(repo.view(repo.apply(tick)).social.orb, null);
  assert.equal(repo.readSocial().familiarity, 1);
  assert.equal(db.prepare('SELECT COUNT(*) AS n FROM baby_social_experience').get()!.n, 1);
  const persisted = JSON.stringify(db.prepare('SELECT * FROM baby_social_experience').all());
  assert.ok(!persisted.includes('잘했어')); assert.ok(!persisted.includes('cursorX'));
  assert.deepEqual(loadOrCreateEgg(directory), identity);
  repo.close(); db.close();
});
test('hunger and autonomous sleep do not become orb emotions; repeated sleep touch cannot wake or delay alerts', t => {
  const directory = seed(t); let now = 0;
  const repo = new BabyLifeRepository(directory, () => now);
  now = BABY_TIMING.hungry;
  let view = repo.view(repo.apply(tick)); assert.ok(view.offerId); assert.equal(view.social.orb, null);
  view = repo.view(repo.apply({ type: 'praise' })); assert.ok(view.offerId); assert.equal(view.social.emotion, 'joy');
  now = BABY_TIMING.awake;
  for (let i = 0; i < 5; i++) view = repo.view(repo.apply({ type: 'touch' }));
  assert.equal(view.behavior, 'sleeping'); assert.equal(view.social.orb, null);
  assert.equal(babyView(repo.read()!).behavior, 'sleeping'); repo.close();
});
test('sleeping repeat persists through restart and shows finite distance after natural wake', t => {
  const directory = seed(t); let now = 0;
  let repo = new BabyLifeRepository(directory, () => now);
  now = BABY_TIMING.awake + 1000;
  for (let i = 0; i < 3; i++) { repo.apply({ type: 'touch' }); now++; }
  assert.equal(repo.view(repo.read()!).behavior, 'sleeping');
  assert.equal(repo.view(repo.read()!).social.motion, 'still');
  repo.close();
  now = BABY_TIMING.awake + BABY_TIMING.sleep;
  repo = new BabyLifeRepository(directory, () => now);
  let view = repo.view(repo.apply(tick));
  assert.equal(view.behavior, 'resting');
  assert.equal(view.social.motion, 'away');
  now += T.distance;
  view = repo.view(repo.apply(tick));
  assert.notEqual(view.social.motion, 'away');
  repo.close();
});
test('invalid social snapshot and clock fail closed without replacing history', t => {
  assert.throws(() => advance(initialBabySocial(), -1, true, tick), /CLOCK_INVALID/);
  assert.throws(() => validateBabySocial({ ...initialBabySocial(), strain: Infinity }), /STATE_INVALID/);
  const directory = seed(t); new BabyLifeRepository(directory, () => 0).close();
  const file = petDatabasePath(directory), db = new DatabaseSync(file);
  db.prepare('UPDATE baby_social SET snapshot=?').run('{}'); db.close(); const before = readFileSync(file);
  assert.throws(() => new BabyLifeRepository(directory), /STORAGE_INVALID/);
  assert.deepEqual(readFileSync(file), before);
});
test('v4 migration rollback and backup preserve existing life/experiences', t => {
  const directory = seed(t); new BabyLifeRepository(directory, () => 0).close();
  const file = petDatabasePath(directory);
  // Restore genuine v4 snapshot made by the migration and induce a schema conflict.
  const { copyFileSync, unlinkSync } = require('node:fs') as typeof import('node:fs');
  copyFileSync(`${file}.v4-backup`, file); unlinkSync(`${file}.v4-backup`);
  const db = new DatabaseSync(file); db.exec('CREATE TABLE baby_social(blocker TEXT)'); db.close();
  const before = readFileSync(file);
  assert.throws(() => new BabyLifeRepository(directory), /STORAGE_INVALID/);
  assert.deepEqual(readFileSync(file), before); assert.deepEqual(readFileSync(`${file}.v4-backup`), before);
});
test('successful v4 upgrade preserves existing body and experience, and supports lifecycle reopen', t => {
  const directory = seed(t); new BabyLifeRepository(directory, () => 0).close();
  const file = petDatabasePath(directory);
  const { copyFileSync, unlinkSync } = require('node:fs') as typeof import('node:fs');
  copyFileSync(`${file}.v4-backup`, file); unlinkSync(`${file}.v4-backup`);
  const db = new DatabaseSync(file);
  db.prepare('INSERT INTO baby_experience(kind,at_ms) VALUES(?,?)').run('touch', 0);
  const old = db.prepare('SELECT snapshot FROM baby_life').get()!.snapshot;
  db.close();
  const repo = new BabyLifeRepository(directory, () => 0);
  assert.equal(JSON.stringify(repo.read()), old);
  const check = new DatabaseSync(file);
  assert.equal(check.prepare('SELECT kind FROM baby_experience').get()!.kind, 'touch');
  assert.equal(check.prepare('SELECT COUNT(*) AS n FROM baby_social_experience').get()!.n, 0);
  new LifecycleRepository(directory, { namePolicy: { trim: true, maxCodePoints: 20 } }).close();
  check.close(); repo.close();
});
test('v5 first social snapshot commits with name and body, never half a new baby', t => {
  const directory = mkdtempSync(path.join(tmpdir(), 'jarvis-social-name-'));
  t.after(() => rmSync(directory, { recursive: true, force: true }));
  const lifecycle = new LifecycleRepository(directory, { namePolicy: { trim: true, maxCodePoints: 20 }, developmentTrigger: true });
  const repo = new BabyLifeRepository(directory, () => 0);
  let stage = lifecycle.apply(0, { type: 'prepare' });
  for (const scene of hatchScenes) stage = lifecycle.apply(stage.revision, { type: 'witness', scene });
  const db = new DatabaseSync(petDatabasePath(directory));
  db.exec("CREATE TRIGGER fail_social_name BEFORE INSERT ON baby_social BEGIN SELECT RAISE(ABORT,'test'); END");
  assert.throws(() => lifecycle.apply(stage.revision, { type: 'name', name: '별' }), /WRITE_FAILED/);
  assert.equal(lifecycle.read().name, null); assert.equal(repo.read(), null);
  db.exec('DROP TRIGGER fail_social_name');
  lifecycle.apply(stage.revision, { type: 'name', name: '별' });
  assert.equal(repo.readSocial().elapsedMs, repo.read()!.elapsedMs);
  db.close(); repo.close(); lifecycle.close();
});
test('autonomous solo orb play does not manufacture closeness to an absent user', () => {
  const played = advance(initialBabySocial(), T.playGap, true, active);
  assert.equal(played.state.play, 'orb');
  assert.equal(played.state.familiarity, 0);
  assert.deepEqual(played.events, ['orb_play']);
});

test('an explicit orb request can take over autonomous play without resetting its own five-minute gap', () => {
  const solo = advance(initialBabySocial(), T.playGap, true, active);
  const requested = advance(solo.state, T.playGap + 1, true, { type: 'orb' });
  assert.equal(requested.state.play, 'orb');
  assert.equal(requested.state.playUntil, T.playGap + 1 + T.play);
  assert.deepEqual(requested.events, ['orb_play']);
  assert.equal(requested.state.nextRequestedPlay, T.playGap + 1 + T.playGap);
  const repeated = advance(requested.state, T.playGap + T.play + 2, true, { type: 'orb' });
  assert.equal(repeated.state.play, null);
  assert.deepEqual(repeated.events, []);
});

test('an older v5 snapshot without the request clock still accepts an explicit orb request', () => {
  const old = initialBabySocial();
  delete old.nextRequestedPlay;
  old.nextPlay = T.playGap;
  validateBabySocial(old);
  const requested = advance(old, 1, true, { type: 'orb' });
  assert.deepEqual(requested.events, ['orb_play']);
  assert.equal(requested.state.nextRequestedPlay, 1 + T.playGap);
});
