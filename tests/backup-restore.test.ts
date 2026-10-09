import assert from 'node:assert/strict';
import test from 'node:test';
import { spawnSync } from 'node:child_process';
import { cpSync, existsSync, mkdirSync, mkdtempSync, readFileSync, realpathSync, readdirSync, symlinkSync, unlinkSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { DatabaseSync } from 'node:sqlite';
import { backupClosedProfile, restoreClosedProfile, hashes, readProfile, stores } from './fixtures/backup-profile';
import { seedProfile } from './fixtures/backup-seed';
import type { AssistantPanelState } from '../src/shared/assistant-panel';

// Retain all synthetic artifacts, including failed candidates, for inspection.
const parent = process.env.JARVIS_BACKUP_TEST_ROOT ?? tmpdir();
const root = realpathSync(mkdtempSync(path.join(parent, 'backup-cases-')));
console.log('SYNTHETIC_BACKUP_ARTIFACTS:' + root);
function fixture(stage: 'egg' | 'baby' = 'baby') {
  const dir = mkdtempSync(path.join(root, `${stage}-`));
  const source = path.join(dir, 'source'); mkdirSync(source, { mode: 0o700 });
  return { dir, source, now: seedProfile(source, stage), backup: path.join(dir, 'backup'), restored: path.join(dir, 'restored') };
}
function launch(directory: string, at: number, stage = 'baby') {
  const env = { ...process.env }; delete env.ELECTRON_RUN_AS_NODE;
  const result = spawnSync(process.execPath, [path.join(__dirname, 'fixtures/backup-app-runner.js'), directory, String(at), stage],
    { env, encoding: 'utf8', timeout: 20000 });
  const log = mkdtempSync(path.join(root, 'launch-'));
  writeFileSync(path.join(log, 'stdout.log'), result.stdout ?? '', { flag: 'wx' });
  writeFileSync(path.join(log, 'stderr.log'), result.stderr ?? '', { flag: 'wx' });
  assert.equal(result.error, undefined, `child failed; see ${log}`);
  assert.equal(result.status, 0, `child exit ${result.status}; see ${log}`);
  assert.ok(result.stdout.includes('BACKUP_APP_CLEAN_EXIT'), 'wait for clean lifecycle and process exit before copying');
  assert.doesNotMatch(result.stderr, /저장소 오류|저장 오류|연결 오류|실행 실패|Unhandled|Error:/);
  const line = result.stdout.split('\n').find(line => line.startsWith('BACKUP_APP_READY:'));
  assert.ok(line, `missing app readiness; see ${log}`);
  return JSON.parse(line.slice('BACKUP_APP_READY:'.length)) as {
    pet: { petId: string; createdAt: string; stage: string; name?: string };
    state: AssistantPanelState; hidden: boolean; requests: number;
  };
}
function clone(source: string, target: string) { cpSync(source, target, { recursive: true, force: false, errorOnExist: true }); }
function sql(dir: string, file: string, statement: string) {
  const db = new DatabaseSync(path.join(dir, file));
  try { db.exec(statement); } finally { db.close(); }
}
function bytes(dir: string): Record<string, string> {
  const result: Record<string, string> = {};
  for (const entry of readdirSync(dir, { recursive: true, withFileTypes: true })) {
    if (entry.isFile()) {
      const file = path.join(entry.parentPath, entry.name);
      result[path.relative(dir, file)] = readFileSync(file).toString('base64');
    }
  }
  return result;
}

test('cleanly stopped baby restores all four stores, experiences and joined tasks; two app launches do not duplicate work', () => {
  const f = fixture();
  const initial = launch(f.source, f.now);
  const before = readProfile(f.source), sourceHashes = hashes(f.source);
  assert.equal(before.care.length, 2);
  for (const kind of ['touch', 'food_offered', 'meal_finished', 'sleep_completed']) assert.ok(before.experiences.some(row => row.kind === kind), kind);
  assert.ok(before.socialExperiences.some(row => row.kind === 'praise'));
  assert.deepEqual(before.life?.home, { x: 300, y: 300 });
  backupClosedProfile(f.source, f.backup);
  const backupBytes = bytes(f.backup);
  restoreClosedProfile(f.backup, f.restored);
  assert.deepEqual(hashes(f.restored), sourceHashes, 'copy equality before time advances');
  assert.deepEqual(readProfile(f.restored), before, 'every persisted state and event survives');
  assert.ok(!existsSync(path.join(f.restored, 'browser-session')), 'fresh browser session requires no copied settings');
  const first = launch(f.restored, f.now + 600000);
  const after = readProfile(f.restored);
  assert.deepEqual(first.pet, initial.pet);
  assert.deepEqual(after.pet, before.pet); assert.deepEqual(after.lifecycle, before.lifecycle);
  assert.deepEqual(after.care, before.care);
  assert.deepEqual(after.experiences.slice(0, before.experiences.length), before.experiences);
  assert.deepEqual(after.socialExperiences.slice(0, before.socialExperiences.length), before.socialExperiences);
  assert.ok(after.life!.observedAtMs > before.life!.observedAtMs, 'time evolution is expected, not byte equality');
  assert.deepEqual(after.life?.home, before.life?.home);
  for (const kind of ['timer', 'alarm', 'reminder'] as const) {
    const rows = kind === 'timer' ? after.timers : after.schedules;
    const recovered = rows.find(row => row.id === `${kind}-offline`)!;
    assert.equal(recovered.status, 'due'); assert.equal(recovered.reason, 'recovered');
    assert.equal(recovered.systemDelivery, 'not-requested', 'overdue initial alerts are app-only');
    assert.equal(rows.find(row => row.id === `${kind}-requested`)!.systemDelivery, 'unknown');
    assert.equal(rows.find(row => row.id === `${kind}-future`)!.status, 'pending');
    for (const state of ['done', 'cancelled', 'legacy']) {
      const record = after.followups.find(row => row.id === `${kind}-${state}`)!;
      assert.equal(record.status, state);
      assert.ok(!first.state.items.some(row => row.id === record.id), 'terminal work must not revive');
    }
    const receipt = after.followups.find(row => row.id === `${kind}-receipt`)!;
    assert.equal(receipt.status, 'active'); assert.ok(receipt.acknowledgedAt !== null);
    assert.equal(after.followups.find(row => row.id === `${kind}-unanswered`)!.status, 'active');
    const snoozed = after.followups.find(row => row.id === `${kind}-snoozed`)!;
    assert.equal(snoozed.round, 1); assert.equal(snoozed.nextReminderAt, f.now + 1800000);
    const repeated = after.followups.find(row => row.id === `${kind}-repeated`)!;
    assert.equal(repeated.round, 2); assert.equal(repeated.nextReminderAt, null);
    assert.equal(repeated.notYetCount, 2); assert.equal(repeated.rounds.length, 3);
    assert.equal(repeated.rounds[2].delivery, 'unsupported', 'hidden runner never invokes native alerts');
    assert.equal(repeated.rounds[0].answer, 'not-yet');
  }
  const paused = after.timers.find(row => row.id === 'timer-paused')!;
  assert.equal(paused.status, 'paused'); assert.equal(paused.pausedRemainingMs, 180000); assert.equal(paused.menu, 'pinned');
  assert.ok(first.state.card && !first.state.card.completed);
  const second = launch(f.restored, f.now + 600000);
  const twice = readProfile(f.restored);
  assert.deepEqual(second, first);
  assert.deepEqual(twice.timers, after.timers); assert.deepEqual(twice.schedules, after.schedules);
  assert.deepEqual(twice.followups, after.followups); assert.deepEqual(twice.experiences, after.experiences);
  assert.deepEqual(twice.socialExperiences, after.socialExperiences);
  assert.deepEqual(hashes(f.source), sourceHashes); assert.deepEqual(bytes(f.backup), backupBytes);
});

test('egg identity, care and stage survive clean backup and isolated application restart', () => {
  const f = fixture('egg');
  const first = launch(f.source, f.now, 'egg'), before = readProfile(f.source);
  backupClosedProfile(f.source, f.backup); restoreClosedProfile(f.backup, f.restored);
  assert.deepEqual(readProfile(f.restored), before);
  const second = launch(f.restored, f.now + 600000, 'egg');
  assert.deepEqual(second.pet, first.pet); assert.deepEqual(readProfile(f.restored).care, before.care);
  assert.equal(second.state.card, null);
});

test('existing backup and restore targets including dangling links are never overwritten', () => {
  const f = fixture(); backupClosedProfile(f.source, f.backup); restoreClosedProfile(f.backup, f.restored);
  const before = bytes(f.dir);
  assert.throws(() => backupClosedProfile(f.source, f.backup), /EEXIST/);
  assert.throws(() => restoreClosedProfile(f.backup, f.restored), /EEXIST/);
  assert.deepEqual(bytes(f.dir), before);
  for (const type of ['empty-directory', 'file', 'link']) {
    const target = path.join(f.dir, type);
    if (type === 'empty-directory') mkdirSync(target);
    else if (type === 'file') writeFileSync(target, 'preserve', { flag: 'wx' });
    else symlinkSync(path.join(f.dir, 'never-create'), target);
    assert.throws(() => backupClosedProfile(f.source, target), /EEXIST/);
    assert.throws(() => restoreClosedProfile(f.backup, target), /EEXIST/);
  }
  assert.equal(readFileSync(path.join(f.dir, 'file'), 'utf8'), 'preserve');
  assert.ok(!existsSync(path.join(f.dir, 'never-create')));
});

test('missing, empty, corrupt, unsupported and foreign databases fail without modifying the source', () => {
  const f = fixture();
  for (const [file] of stores) for (const damage of ['missing', 'empty', 'corrupt', 'future', 'foreign']) {
    const dir = path.join(f.dir, `${path.basename(file)}-${damage}`); clone(f.source, dir);
    if (damage === 'missing') unlinkSync(path.join(dir, file));
    else if (damage === 'empty' || damage === 'corrupt') writeFileSync(path.join(dir, file), damage === 'empty' ? '' : 'synthetic broken database');
    else sql(dir, file, damage === 'future' ? 'PRAGMA user_version=999' : 'PRAGMA application_id=0');
    const before = bytes(dir), target = dir + '-backup';
    assert.throws(() => backupClosedProfile(dir, target));
    assert.deepEqual(bytes(dir), before, `${file} ${damage}`);
    assert.ok(!existsSync(target));
  }
});

test('missing required records leave an incomplete copy which cannot be restored; no source replacement', () => {
  const f = fixture();
  for (const [file, statement] of [
    ['pet/pet.sqlite3', 'DELETE FROM baby_life'],
    ['assistant/timers.sqlite3', 'DROP TABLE timers'],
    ['assistant/schedules.sqlite3', 'DROP TABLE schedules'],
    ['assistant/followups.sqlite3', "UPDATE followups SET document='{}'"],
  ]) {
    const dir = path.join(f.dir, path.basename(file)); clone(f.source, dir); sql(dir, file, statement);
    const before = bytes(dir), target = dir + '-backup';
    assert.throws(() => backupClosedProfile(dir, target));
    assert.deepEqual(bytes(dir), before);
    assert.ok(existsSync(path.join(target, 'INCOMPLETE')));
    assert.throws(() => restoreClosedProfile(target, target + '-restored'), /BACKUP_INCOMPLETE/);
    assert.ok(!existsSync(target + '-restored'));
  }
});

test('backup manifest rejects missing files, altered valid data, invalid format and incomplete copies before restoring', () => {
  const f = fixture(); backupClosedProfile(f.source, f.backup);
  const original = bytes(f.backup);
  for (const damage of ['missing', 'changed', 'manifest', 'incomplete']) {
    const backup = path.join(f.dir, damage); clone(f.backup, backup);
    if (damage === 'missing') unlinkSync(path.join(backup, 'data/assistant/followups.sqlite3'));
    if (damage === 'changed') sql(path.join(backup, 'data'), 'assistant/timers.sqlite3', "UPDATE timers SET title='changed synthetic title'");
    if (damage === 'manifest') writeFileSync(path.join(backup, 'manifest.json'), '{"format":999}');
    if (damage === 'incomplete') writeFileSync(path.join(backup, 'INCOMPLETE'), 'interrupted');
    const before = bytes(backup), target = backup + '-restore';
    assert.throws(() => restoreClosedProfile(backup, target));
    assert.ok(!existsSync(target)); assert.deepEqual(bytes(backup), before);
  }
  assert.deepEqual(bytes(f.backup), original);
});

test('SQLite sidecars, unknown state and linked sources are rejected instead of silently omitted', () => {
  const f = fixture();
  for (const suffix of ['-wal', '-shm', '-journal', '.unexpected']) {
    const dir = path.join(f.dir, suffix); clone(f.source, dir);
    writeFileSync(path.join(dir, 'pet/pet.sqlite3' + suffix), 'preserve sidecar');
    const before = bytes(dir);
    assert.throws(() => backupClosedProfile(dir, dir + '-backup'), /PROFILE_UNEXPECTED_FILE/);
    assert.deepEqual(bytes(dir), before);
  }
  const dir = path.join(f.dir, 'linked'); clone(f.source, dir);
  unlinkSync(path.join(dir, 'pet/pet.sqlite3'));
  symlinkSync(path.join(f.source, 'pet/pet.sqlite3'), path.join(dir, 'pet/pet.sqlite3'));
  const before = hashes(f.source);
  assert.throws(() => backupClosedProfile(dir, dir + '-backup'), /PROFILE_FILE_INVALID/);
  assert.deepEqual(hashes(f.source), before);
  const trial = path.join(f.dir, 'appearance'); clone(f.source, trial);
  writeFileSync(path.join(trial, 'appearance.json'), '{"family":"leaf"}');
  assert.throws(() => backupClosedProfile(trial, trial + '-backup'), /PROFILE_UNEXPECTED_ROOT_FILE/);
});

test('interrupted backup and restore copying preserves both inputs and marks only the new target incomplete', t => {
  const f = fixture(); backupClosedProfile(f.source, f.backup);
  const sourceBefore = hashes(f.source), backupBefore = bytes(f.backup);
  const fs = require('node:fs') as typeof import('node:fs');
  const originalCopy = fs.copyFileSync;
  for (const operation of ['backup', 'restore']) {
    let copies = 0;
    const injection = t.mock.method(fs, 'copyFileSync', (...args: Parameters<typeof originalCopy>) => {
      if (++copies === 2) throw new Error('SYNTHETIC_COPY_FAILURE');
      return originalCopy(...args);
    });
    const target = path.join(f.dir, `${operation}-interrupted`);
    try {
      assert.throws(() => operation === 'backup' ? backupClosedProfile(f.source, target) : restoreClosedProfile(f.backup, target), /SYNTHETIC_COPY_FAILURE/);
    } finally { injection.mock.restore(); }
    assert.ok(existsSync(path.join(target, 'INCOMPLETE')));
    assert.ok(!existsSync(path.join(target, 'manifest.json')));
    assert.throws(() => backupClosedProfile(target, target + '-copy'), /PROFILE_INCOMPLETE/);
    assert.throws(() => restoreClosedProfile(target, target + '-restore'), /BACKUP_INCOMPLETE/);
    assert.deepEqual(hashes(f.source), sourceBefore); assert.deepEqual(bytes(f.backup), backupBefore);
  }
});
