import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import test from 'node:test';
import { LifecycleRepository } from '../src/storage/lifecycle-repository';
import { loadOrCreateEgg, petDatabasePath } from '../src/storage/pet-repository';
import { openEggLife } from '../src/storage/egg-life-repository';
import { DatabaseSync } from 'node:sqlite';
import { hatchScenes, type Lifecycle } from '../src/pet/lifecycle';

const options = { namePolicy: { trim: true, maxCodePoints: 20 }, developmentTrigger: true };
function workspace(t: test.TestContext) {
  const directory = mkdtempSync(path.join(tmpdir(), 'jarvis-hatch-product-'));
  t.after(() => rmSync(directory, { recursive: true, force: true }));
  return directory;
}
function launch(directory: string, mode: string, now?: number): Lifecycle {
  const env = { ...process.env }; delete env.ELECTRON_RUN_AS_NODE;
  const run = spawnSync(process.execPath, [path.join(__dirname, 'fixtures/hatch-product-runner.js'), directory, mode, ...(now === undefined ? [] : [String(now)])],
    { env, encoding: 'utf8', timeout: 30000 });
  assert.equal(run.status, 0, run.stderr);
  const line = run.stdout.split('\n').find(line => line.startsWith('HATCH_PRODUCT:'));
  assert.ok(line, run.stderr);
  return JSON.parse(line.slice('HATCH_PRODUCT:'.length));
}
test('fresh egg waits for its deadline; test seed and every witnessed checkpoint still restore through production startup', t => {
  const directory = workspace(t);
  const egg = launch(directory, 'inspect');
  assert.equal(egg.ready, false);
  const seed = new LifecycleRepository(directory, options);
  let state = seed.apply(egg.revision, { type: 'prepare' }); seed.close();
  for (const step of [...hatchScenes, 'naming']) {
    assert.deepEqual(launch(directory, 'inspect'), state);
    const next = launch(directory, 'step');
    assert.equal(next.petId, egg.petId);
    assert.equal(next.revision, state.revision + 1);
    if (step !== 'naming') assert.equal(next.completed, step);
    state = next;
  }
  assert.equal(state.name, '별');
  assert.deepEqual(launch(directory, 'inspect'), state);
});
test('production IPC, pause epochs, scene/name write failures and committed baby idle view', t => {
  const directory = workspace(t);
  const seed = new LifecycleRepository(directory, options);
  const prepared = seed.apply(0, { type: 'prepare' }); seed.close();
  const result = launch(directory, 'exercise');
  assert.equal(result.petId, prepared.petId);
  assert.equal(result.orbId, `${prepared.petId}:orb`);
  assert.equal(result.name, '별');
  assert.deepEqual(launch(directory, 'inspect'), result);
});
test('bottom-edge hatch keeps the naming card below the baby', t => {
  const directory = workspace(t);
  const seed = new LifecycleRepository(directory, options);
  seed.apply(0, { type: 'prepare' }); seed.close();
  assert.equal(launch(directory, 'exercise-edge').name, '별');
});
test('injected readiness policy: startup, resume and real care prepare without opening or witnessing; restart retains it', t => {
  for (const mode of ['ready-startup', 'ready-live', 'ready-care']) {
    const directory = workspace(t);
    const ready = launch(directory, mode);
    assert.equal(ready.ready, true);
    assert.equal(ready.completed, null);
    assert.equal(ready.stage, 'egg');
    assert.deepEqual(launch(directory, 'inspect'), ready);
  }
});
test('activation and second launch only show a ready egg; the tray starts hatching and activation resumes a witnessed scene', t => {
  const directory = workspace(t);
  const seed = new LifecycleRepository(directory, options);
  seed.apply(0, { type: 'prepare' }); seed.close();
  const result = launch(directory, 'activation');
  assert.equal(result.completed, 'prelude');
  assert.equal(result.stage, 'egg');
});

test('default product policy prepares at 24h without care and survives long absence without witnessing', t => {
  const directory = workspace(t);
  const pet = loadOrCreateEgg(directory); const start = Date.parse(pet.createdAt);
  const hour = 60 * 60 * 1000;
  assert.equal(launch(directory, 'policy-inspect', start + 24 * hour - 1).ready, false);
  const ready = launch(directory, 'policy-inspect', start + 24 * hour);
  assert.equal(ready.ready, true); assert.equal(ready.petId, pet.petId);
  assert.deepEqual(launch(directory, 'policy-inspect', start + 30 * 24 * hour), ready);
  const db = new DatabaseSync(petDatabasePath(directory), { readOnly: true });
  assert.equal(db.prepare('SELECT count(*) n FROM egg_care').get()?.n, 0); db.close();
  const absentDirectory = workspace(t);
  const absentStart = Date.parse(loadOrCreateEgg(absentDirectory).createdAt);
  const returned = launch(absentDirectory, 'policy-inspect', absentStart + 30 * 24 * hour);
  assert.equal(returned.ready, true); assert.equal(returned.revision, 1);
});

test('default product policy uses real mixed care with a 1h gap and 6h cap, including restart and spam', t => {
  const directory = workspace(t);
  const start = Date.parse(loadOrCreateEgg(directory).createdAt);
  const hour = 60 * 60 * 1000;
  let now = start;
  const care = openEggLife(directory, () => now);
  for (let index = 0; index < 18; index++) {
    now = start + index * hour;
    care.care(index % 2 ? 'stroke' : 'touch');
    now++; care.care('touch'); // Preserved real event, ineligible for another reduction.
  }
  care.close();
  assert.equal(launch(directory, 'policy-inspect', start + 18 * hour - 1).ready, false);
  const ready = launch(directory, 'policy-inspect', start + 18 * hour);
  assert.equal(ready.ready, true);
  assert.deepEqual(launch(directory, 'policy-inspect', start + 17 * hour), ready);
  const db = new DatabaseSync(petDatabasePath(directory), { readOnly: true });
  assert.equal(db.prepare('SELECT count(*) n FROM egg_care').get()?.n, 36); db.close();
});

test('default product policy runs on live resume/care and still requires the tray for first start', t => {
  for (const mode of ['policy-live', 'policy-care']) {
    const directory = workspace(t);
    const ready = launch(directory, mode);
    assert.equal(ready.ready, true); assert.equal(ready.completed, null);
  }
  const directory = workspace(t);
  const start = Date.parse(loadOrCreateEgg(directory).createdAt);
  // No readiness seed or policy override: normal startup reaches the 24h boundary.
  const started = launch(directory, 'policy-activation', start + 24 * 60 * 60 * 1000);
  assert.equal(started.completed, 'prelude'); assert.equal(started.stage, 'egg');
});
