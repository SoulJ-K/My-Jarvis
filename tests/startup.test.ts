import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { mkdtempSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import test from 'node:test';
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
      rejectReady(new Error(`Exited before ready (${code})`));
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
