import assert from 'node:assert/strict';
import test from 'node:test';
import { createHash } from 'node:crypto';
import { existsSync, lstatSync, mkdirSync, mkdtempSync, readdirSync, readFileSync, rmSync, symlinkSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { DatabaseSync } from 'node:sqlite';
import { seedProfile } from './fixtures/backup-seed';
import { TimerRepository } from '../src/storage/timer-repository';
import {
  createSnapshot, listSnapshots, pruneSnapshots, snapshotDirectory, snapshotDue, SNAPSHOT_INTERVAL_MS, SNAPSHOT_KEEP,
  SNAPSHOT_STORES, upgradePending,
} from '../src/storage/snapshots';

const DAY = SNAPSHOT_INTERVAL_MS;
function profile(t: test.TestContext) {
  const dir = mkdtempSync(path.join(tmpdir(), 'jarvis-snapshots-'));
  t.after(() => rmSync(dir, { recursive: true, force: true }));
  seedProfile(dir);
  return dir;
}
const digest = (file: string) => createHash('sha256').update(readFileSync(file)).digest('hex');
const sources = (dir: string) => Object.fromEntries(SNAPSHOT_STORES.map(([file]) => [file, digest(path.join(dir, file))]));
// Logical content of every table, so a VACUUM copy is compared by data, not bytes.
function rows(file: string) {
  const db = new DatabaseSync(file, { readOnly: true });
  try {
    const tables = db.prepare("SELECT name FROM sqlite_master WHERE type='table' ORDER BY name").all().map(r => String(r.name));
    return {
      format: db.prepare('PRAGMA user_version').get()?.user_version,
      id: db.prepare('PRAGMA application_id').get()?.application_id,
      tables: Object.fromEntries(tables.map(name => [name, db.prepare(`SELECT * FROM "${name}" ORDER BY rowid`).all()])),
    };
  } finally { db.close(); }
}

test('constants match the formats current repositories write, so pre-upgrade detection cannot drift', t => {
  const dir = profile(t);
  for (const [file, id, version] of SNAPSHOT_STORES) {
    const r = rows(path.join(dir, file));
    assert.equal(r.format, version, file); assert.equal(r.id, id, file);
  }
  assert.equal(upgradePending(dir), false);
});

test('a snapshot copies all four stores with identical data, a manifest and private permissions; sources unchanged', t => {
  const dir = profile(t), before = sources(dir), now = Date.UTC(2026, 9, 13, 8);
  const name = createSnapshot(dir, 'daily', now, '0.1.0');
  assert.match(name, /^20261013T080000000Z-daily-[0-9a-f]{6}$/);
  const copy = path.join(snapshotDirectory(dir), name);
  const manifest = JSON.parse(readFileSync(path.join(copy, 'manifest.json'), 'utf8'));
  assert.equal(manifest.format, 'jarvis-pet-auto-snapshot'); assert.equal(manifest.reason, 'daily');
  assert.equal(manifest.appVersion, '0.1.0'); assert.equal(manifest.createdAt, new Date(now).toISOString());
  for (const [file] of SNAPSHOT_STORES) {
    assert.deepEqual(rows(path.join(copy, file)), rows(path.join(dir, file)), file);
    assert.equal(manifest.stores[file].sha256, digest(path.join(copy, file)));
    assert.equal(lstatSync(path.join(copy, file)).mode & 0o777, 0o600);
  }
  assert.equal(lstatSync(snapshotDirectory(dir)).mode & 0o777, 0o700);
  assert.deepEqual(sources(dir), before);
  assert.deepEqual(listSnapshots(dir).map(s => s.reason), ['daily']);
});

test('a snapshot taken while a store is open for writing is consistent and later writes do not change it', t => {
  const dir = profile(t);
  const live = new TimerRepository(dir);
  try {
    const name = createSnapshot(dir, 'daily', Date.UTC(2026, 9, 13), '0.1.0');
    const file = path.join(snapshotDirectory(dir), name, 'assistant/timers.sqlite3'), saved = rows(file);
    const db = new DatabaseSync(path.join(dir, 'assistant/timers.sqlite3'));
    try { db.exec("CREATE TABLE IF NOT EXISTS later_write (x); INSERT INTO later_write VALUES (1)"); } finally { db.close(); }
    assert.deepEqual(rows(file), saved);
    assert.ok(!('later_write' in saved.tables));
  } finally { live.close(); }
});

test('daily due: none, one day later or a clock moved back a day; not within the day', t => {
  const dir = profile(t), at = Date.UTC(2026, 9, 13, 12);
  assert.equal(snapshotDue(dir, at), true);
  createSnapshot(dir, 'quit', at, '0.1.0');
  assert.equal(snapshotDue(dir, at + 60_000), false);
  assert.equal(snapshotDue(dir, at + DAY - 1), false);
  assert.equal(snapshotDue(dir, at + DAY), true);
  assert.equal(snapshotDue(dir, at - DAY), true);
  // A week asleep still needs only one new snapshot.
  createSnapshot(dir, 'daily', at + 7 * DAY, '0.1.0');
  assert.equal(snapshotDue(dir, at + 7 * DAY + 1000), false);
});

test(`pruning keeps the newest ${SNAPSHOT_KEEP}, removes leftover temp folders and never touches anything else`, t => {
  const dir = profile(t), at = Date.UTC(2026, 9, 1);
  for (let i = 0; i < SNAPSHOT_KEEP + 2; i++) createSnapshot(dir, 'daily', at + i * DAY, '0.1.0');
  const root = snapshotDirectory(dir);
  mkdirSync(path.join(root, 'my-notes')); writeFileSync(path.join(root, 'my-notes/keep.txt'), 'keep');
  mkdirSync(path.join(root, '.tmp-20261001T000000000Z-daily-abcdef'));
  const outside = mkdtempSync(path.join(tmpdir(), 'jarvis-snapshot-outside-'));
  t.after(() => rmSync(outside, { recursive: true, force: true }));
  writeFileSync(path.join(outside, 'manifest.json'), '{}');
  symlinkSync(outside, path.join(root, '20250101T000000000Z-daily-000000'));
  const before = listSnapshots(dir).map(s => s.name);
  const removed = pruneSnapshots(dir);
  const after = listSnapshots(dir).map(s => s.name);
  assert.equal(after.length, SNAPSHOT_KEEP);
  assert.deepEqual(after, before.slice(0, SNAPSHOT_KEEP));
  assert.ok(removed.includes('.tmp-20261001T000000000Z-daily-abcdef'));
  assert.equal(readFileSync(path.join(root, 'my-notes/keep.txt'), 'utf8'), 'keep');
  assert.ok(existsSync(path.join(outside, 'manifest.json')), 'a linked folder is never followed or deleted');
  assert.ok(lstatSync(path.join(root, '20250101T000000000Z-daily-000000')).isSymbolicLink());
});

test('failures leave no snapshot folder and never change the sources', t => {
  const empty = mkdtempSync(path.join(tmpdir(), 'jarvis-snapshot-empty-'));
  t.after(() => rmSync(empty, { recursive: true, force: true }));
  assert.throws(() => createSnapshot(empty, 'daily', Date.now(), '0.1.0'), /SNAPSHOT_NO_PET/);
  assert.ok(!existsSync(snapshotDirectory(empty)));

  const dir = profile(t);
  writeFileSync(path.join(dir, 'assistant/followups.sqlite3'), 'synthetic damaged store');
  const before = sources(dir);
  assert.throws(() => createSnapshot(dir, 'daily', Date.now(), '0.1.0'), /SNAPSHOT_(COPY|VERIFY)_FAILED/);
  assert.deepEqual(readdirSync(snapshotDirectory(dir)), []);
  assert.deepEqual(sources(dir), before);
});

test('only existing stores are copied, and an older store format is detected before migration', t => {
  const dir = mkdtempSync(path.join(tmpdir(), 'jarvis-snapshot-old-'));
  t.after(() => rmSync(dir, { recursive: true, force: true }));
  mkdirSync(path.join(dir, 'pet'));
  const db = new DatabaseSync(path.join(dir, 'pet/pet.sqlite3'));
  try { db.exec(`PRAGMA application_id=${SNAPSHOT_STORES[0][1]}; PRAGMA user_version=1; CREATE TABLE pet (x)`); } finally { db.close(); }
  assert.equal(upgradePending(dir), true);
  const name = createSnapshot(dir, 'pre-upgrade', Date.UTC(2026, 9, 13), '0.1.0');
  const manifest = JSON.parse(readFileSync(path.join(snapshotDirectory(dir), name, 'manifest.json'), 'utf8'));
  assert.deepEqual(Object.keys(manifest.stores), ['pet/pet.sqlite3']);
  assert.equal(manifest.stores['pet/pet.sqlite3'].format, 1);
});
