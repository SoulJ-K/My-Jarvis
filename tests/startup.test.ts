import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { mkdtempSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import test from 'node:test';
import { DatabaseSync } from 'node:sqlite';
import { loadOrCreateEgg, petDatabasePath } from '../src/storage/pet-repository';

function workspace(t: test.TestContext) {
  const directory = mkdtempSync(path.join(tmpdir(), 'jarvis-startup-'));
  t.after(() => rmSync(directory, { recursive: true, force: true }));
  return directory;
}
function launch(directory: string, mode = 'once') {
  const env = { ...process.env };
  delete env.ELECTRON_RUN_AS_NODE;
  const child = spawn(process.execPath, [path.join(__dirname, 'fixtures/app-runner.js'), directory, mode],
    { env, stdio: ['ignore', 'pipe', 'pipe'] });
  let stdout = '';
  let stderr = '';
  let resolveReady: (value: unknown) => void;
  let rejectReady: (error: Error) => void;
  const ready = new Promise((resolve, reject) => { resolveReady = resolve; rejectReady = reject; });
  // Error scenarios intentionally exit without reaching ready.
  void ready.catch(() => {});
  child.stdout.on('data', chunk => {
    stdout += chunk;
    const line = stdout.split('\n').find(line => line.startsWith('TEST_READY:'));
    if (line) resolveReady(JSON.parse(line.slice('TEST_READY:'.length)));
  });
  child.stderr.on('data', chunk => { stderr += chunk; });
  const timer = setTimeout(() => child.kill('SIGKILL'), 25_000);
  const closed = new Promise<{ code: number | null; stdout: string; stderr: string }>((resolve, reject) => {
    child.once('error', reject);
    child.once('close', code => {
      clearTimeout(timer);
      rejectReady(new Error(`Exited before ready (${code}): ${stderr}`));
      resolve({ code, stdout, stderr });
    });
  });
  return { child, ready, closed };
}

test('real Electron startup restores the same stored AND rendered egg across launches', async t => {
  const directory = workspace(t);
  const first = launch(directory);
  const firstPet = await first.ready as { snapshot: { petId: string }; rendered: string };
  assert.equal((await first.closed).code, 0);
  assert.equal(firstPet.rendered, firstPet.snapshot.petId);
  const second = launch(directory);
  assert.deepEqual(await second.ready, firstPet);
  assert.equal((await second.closed).code, 0);
});

test('second app exits without opening an egg or changing its identity', async t => {
  const directory = workspace(t);
  const first = launch(directory, 'hold');
  try {
    await first.ready;
    const before = readFileSync(petDatabasePath(directory));
    const second = await launch(directory).closed;
    assert.equal(second.code, 0, second.stderr);
    assert.equal(second.stdout.includes('TEST_READY:'), false);
    assert.deepEqual(readFileSync(petDatabasePath(directory)), before);
  } finally { first.child.kill('SIGTERM'); await first.closed; }
});

test('corrupt storage makes real startup fail before any egg window is created', async t => {
  const directory = workspace(t);
  mkdirSync(path.dirname(petDatabasePath(directory)));
  writeFileSync(petDatabasePath(directory), 'preserve original');
  const result = await launch(directory).closed;
  assert.equal(result.code, 1, result.stderr);
  assert.match(result.stdout, /TEST_FAILURE:.*"windows":0/);
  assert.equal(result.stdout.includes('TEST_READY:'), false);
  assert.equal(readFileSync(petDatabasePath(directory), 'utf8'), 'preserve original');
});

test('write failure is not shown as a successful new egg', async t => {
  const directory = workspace(t);
  writeFileSync(path.join(directory, 'pet'), 'preserve obstacle');
  const result = await launch(directory).closed;
  assert.equal(result.code, 1, result.stderr);
  assert.match(result.stdout, /TEST_FAILURE:.*"windows":0/);
  assert.equal(readFileSync(path.join(directory, 'pet'), 'utf8'), 'preserve obstacle');
});

test('terminating a running app preserves the already committed identity', async t => {
  const directory = workspace(t);
  const first = launch(directory, 'hold');
  try {
    await first.ready;
    const snapshot = loadOrCreateEgg(directory);
    first.child.kill('SIGKILL');
    await first.closed;
    const next = launch(directory);
    const restored = await next.ready as { snapshot: unknown };
    assert.deepEqual(restored.snapshot, snapshot);
    assert.equal((await next.closed).code, 0);
  } finally { if (first.child.exitCode === null) first.child.kill('SIGKILL'); }
});

interface ObservedEgg {
  snapshot: { petId: string; createdAt: string; stage: 'egg' };
  state: { behavior: 'idle' | 'reacting'; revision: number };
  rendered: string;
  behavior: string;
  reacting: boolean;
}
interface ExercisedEgg {
  exercise: { initial: ObservedEgg; clicked: ObservedEgg; reloaded: ObservedEgg; rested: ObservedEgg };
}
function checkExercise(report: ExercisedEgg, expected?: ObservedEgg['snapshot']) {
  const { initial, clicked, reloaded, rested } = report.exercise;
  if (expected) assert.deepEqual(initial.snapshot, expected);
  assert.deepEqual(initial.state, { behavior: 'idle', revision: 0 });
  assert.deepEqual(clicked.state, { behavior: 'reacting', revision: 1 });
  assert.equal(clicked.reacting, true);
  assert.ok(reloaded.state.revision >= 1);
  assert.deepEqual(rested.state, { behavior: 'idle', revision: 2 });
  assert.equal(rested.reacting, false);
  for (const observation of [initial, clicked, reloaded, rested]) {
    assert.deepEqual(observation.snapshot, initial.snapshot);
    assert.equal(observation.rendered, initial.snapshot.petId);
    assert.equal(observation.behavior, observation.state.behavior);
  }
  return initial.snapshot;
}

test('combined app: create → real page click → reaction → reload → rest → quit → restore → click again', async t => {
  const directory = workspace(t);
  const first = launch(directory, 'exercise');
  const identity = checkExercise(await first.ready as ExercisedEgg);
  assert.equal((await first.closed).code, 0);
  assert.deepEqual(loadOrCreateEgg(directory), identity);
  const second = launch(directory, 'exercise');
  checkExercise(await second.ready as ExercisedEgg, identity);
  assert.equal((await second.closed).code, 0);
  // Care is durable; transient presentation state is not stored.
  const db = new DatabaseSync(petDatabasePath(directory), { readOnly: true });
  assert.equal(db.prepare('SELECT count(*) AS n FROM egg_care').get()?.n, 2);
  assert.deepEqual(db.prepare('SELECT DISTINCT kind FROM egg_care').all().map(row => row.kind), ['touch']);
  db.close();
});

test('combined app: killed during reaction restores same egg at rest and accepts another page click', async t => {
  const directory = workspace(t);
  const first = launch(directory, 'react-hold');
  try {
    const report = await first.ready as ExercisedEgg;
    assert.equal(report.exercise.clicked.state.behavior, 'reacting');
    const identity = report.exercise.initial.snapshot;
    first.child.kill('SIGKILL');
    await first.closed;
    const second = launch(directory, 'exercise');
    checkExercise(await second.ready as ExercisedEgg, identity);
    assert.equal((await second.closed).code, 0);
    assert.deepEqual(loadOrCreateEgg(directory), identity);
    const db = new DatabaseSync(petDatabasePath(directory), { readOnly: true });
    assert.equal(db.prepare('SELECT count(*) AS n FROM egg_care').get()?.n, 2);
    db.close();
  } finally { if (first.child.exitCode === null) first.child.kill('SIGKILL'); }
});

test('care app: mouse hold/stroke vs move, cancel, departure, reload, write failure and restart', async t => {
  const directory = workspace(t);
  const first = launch(directory, 'care');
  const result = await first.ready as { snapshot: unknown; exercise: { kinds: string[]; life: { elapsed_ms: number }; state: { behavior: string } } };
  assert.equal((await first.closed).code, 0);
  assert.deepEqual(result.exercise.kinds, ['stroke', 'stroke', 'touch']);
  assert.equal(result.exercise.state.behavior, 'idle');
  const second = launch(directory);
  const restored = await second.ready as { snapshot: unknown; state: { behavior: string } };
  assert.equal((await second.closed).code, 0);
  assert.deepEqual(restored.snapshot, result.snapshot);
  assert.equal(restored.state.behavior, 'idle');
  const db = new DatabaseSync(petDatabasePath(directory), { readOnly: true });
  assert.deepEqual(db.prepare('SELECT kind FROM egg_care ORDER BY id').all().map(row => row.kind), ['stroke', 'stroke', 'touch']);
  assert.ok(Number(db.prepare('SELECT elapsed_ms FROM egg_life').get()?.elapsed_ms) >= result.exercise.life.elapsed_ms);
  db.close();
});
