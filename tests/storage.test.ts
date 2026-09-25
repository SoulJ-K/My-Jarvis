import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { chmodSync, existsSync, mkdtempSync, mkdirSync, readFileSync, rmSync, statSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { DatabaseSync } from 'node:sqlite';
import test from 'node:test';
import { loadOrCreateEgg, petDatabasePath, PetStorageError } from '../src/storage/pet-repository';

const repository = require.resolve('../src/storage/pet-repository');
function workspace(t: test.TestContext) {
  const directory = mkdtempSync(path.join(tmpdir(), 'jarvis-storage-'));
  t.after(() => rmSync(directory, { recursive: true, force: true }));
  return directory;
}
function rejectsPreservingFile(directory: string) {
  const file = petDatabasePath(directory);
  const before = readFileSync(file);
  assert.throws(() => loadOrCreateEgg(directory), PetStorageError);
  assert.deepEqual(readFileSync(file), before);
}

test('fresh store contains exactly one unnamed egg; a new process restores all fields', t => {
  const directory = workspace(t);
  const first = loadOrCreateEgg(directory);
  assert.equal(first.stage, 'egg');
  assert.deepEqual(Object.keys(first).sort(), ['createdAt', 'petId', 'stage']);
  assert.equal(statSync(petDatabasePath(directory)).mode & 0o777, 0o600);
  assert.deepEqual(loadOrCreateEgg(directory), first);
  const child = spawnSync(process.execPath, ['-e',
    'const r=require(process.argv[1]);process.stdout.write(JSON.stringify(r.loadOrCreateEgg(process.argv[2])))',
    repository, directory], { encoding: 'utf8', env: { ...process.env, ELECTRON_RUN_AS_NODE: '1' } });
  assert.equal(child.status, 0, child.stderr);
  assert.deepEqual(JSON.parse(child.stdout), first);
  const db = new DatabaseSync(petDatabasePath(directory));
  try {
    assert.equal(db.prepare('SELECT count(*) AS count FROM pet').get()?.count, 1);
    assert.throws(() => db.prepare('INSERT INTO pet VALUES (2, ?, ?, ?)').run('other', first.createdAt, 'egg'));
    assert.deepEqual(db.prepare("SELECT name FROM sqlite_schema WHERE type = 'table'").all().map(r => r.name), ['pet']);
  } finally { db.close(); }
});

test('distinct stores get distinct identities', t => {
  assert.notEqual(loadOrCreateEgg(workspace(t)).petId, loadOrCreateEgg(workspace(t)).petId);
});

test('corrupt and existing empty files are preserved, never reinitialized', t => {
  for (const contents of [Buffer.from('not a SQLite database'), Buffer.alloc(0)]) {
    const directory = workspace(t);
    mkdirSync(path.dirname(petDatabasePath(directory)));
    writeFileSync(petDatabasePath(directory), contents);
    rejectsPreservingFile(directory);
  }
});

test('unsupported versions, missing identity, and invalid state fail without rewriting', t => {
  for (const sql of ['PRAGMA user_version = 2', 'PRAGMA user_version = 0',
    'DELETE FROM pet', "UPDATE pet SET created_at = 'invalid'", "UPDATE pet SET pet_id = 'invalid'",
    'PRAGMA application_id = 0']) {
    const directory = workspace(t);
    loadOrCreateEgg(directory);
    const db = new DatabaseSync(petDatabasePath(directory));
    db.exec(sql);
    db.close();
    rejectsPreservingFile(directory);
  }
});

test('filesystem write failure is reported and unrelated contents survive', t => {
  const directory = workspace(t);
  const obstacle = path.join(directory, 'pet');
  writeFileSync(obstacle, 'keep this file');
  assert.throws(() => loadOrCreateEgg(directory), PetStorageError);
  assert.equal(readFileSync(obstacle, 'utf8'), 'keep this file');
  assert.equal(existsSync(petDatabasePath(directory)), false);
});

test('real permission denial cannot create an egg', t => {
  if (process.getuid?.() === 0 || process.platform === 'win32') { t.skip('requires POSIX non-root permissions'); return; }
  const directory = workspace(t);
  chmodSync(directory, 0o500);
  try { assert.throws(() => loadOrCreateEgg(directory), PetStorageError); }
  finally { chmodSync(directory, 0o700); }
  assert.equal(existsSync(petDatabasePath(directory)), false);
});

test('injected insert failure rolls back schema and preserves failed initial file', t => {
  const directory = workspace(t);
  const child = spawnSync(process.execPath, ['-e', `
    const {DatabaseSync}=require('node:sqlite');
    const prepare=DatabaseSync.prototype.prepare;
    DatabaseSync.prototype.prepare=function(sql){
      if(sql.startsWith('INSERT INTO pet')) throw new Error('simulated SQLITE_FULL');
      return prepare.call(this,sql);
    };
    const r=require(process.argv[1]);
    try {r.loadOrCreateEgg(process.argv[2]);process.exitCode=9;}
    catch(e){process.stdout.write(e.code);}
  `, repository, directory], { encoding: 'utf8', env: { ...process.env, ELECTRON_RUN_AS_NODE: '1' } });
  assert.equal(child.status, 0, child.stderr);
  assert.equal(child.stdout, 'CREATE_FAILED');
  assert.equal(existsSync(petDatabasePath(directory)), true);
  rejectsPreservingFile(directory);
  const db = new DatabaseSync(petDatabasePath(directory), { readOnly: true });
  assert.equal(db.prepare("SELECT count(*) AS count FROM sqlite_schema WHERE type = 'table'").get()?.count, 0);
  db.close();
});

test('process termination during first transaction leaves evidence and does not mint a replacement', t => {
  const directory = workspace(t);
  mkdirSync(path.dirname(petDatabasePath(directory)));
  const child = spawnSync(process.execPath, ['-e', `
    const {DatabaseSync}=require('node:sqlite');
    const db=new DatabaseSync(process.argv[1]);
    db.exec("BEGIN IMMEDIATE; CREATE TABLE interrupted (value TEXT); INSERT INTO interrupted VALUES ('pending')");
    process.kill(process.pid,'SIGKILL');
  `, petDatabasePath(directory)], { encoding: 'utf8', env: { ...process.env, ELECTRON_RUN_AS_NODE: '1' } });
  assert.equal(child.signal, 'SIGKILL', child.stderr);
  rejectsPreservingFile(directory);
});
