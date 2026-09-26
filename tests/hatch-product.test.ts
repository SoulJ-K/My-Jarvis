import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import test from 'node:test';
import { LifecycleRepository } from '../src/storage/lifecycle-repository';
import { hatchScenes, type Lifecycle } from '../src/pet/lifecycle';

const options = { namePolicy: { trim: true, maxCodePoints: 20 }, developmentTrigger: true };
function workspace(t: test.TestContext) {
  const directory = mkdtempSync(path.join(tmpdir(), 'jarvis-hatch-product-'));
  t.after(() => rmSync(directory, { recursive: true, force: true }));
  return directory;
}
function launch(directory: string, mode: string): Lifecycle {
  const env = { ...process.env }; delete env.ELECTRON_RUN_AS_NODE;
  const run = spawnSync(process.execPath, [path.join(__dirname, 'fixtures/hatch-product-runner.js'), directory, mode],
    { env, encoding: 'utf8', timeout: 30000 });
  assert.equal(run.status, 0, run.stderr);
  const line = run.stdout.split('\n').find(line => line.startsWith('HATCH_PRODUCT:'));
  assert.ok(line, run.stderr);
  return JSON.parse(line.slice('HATCH_PRODUCT:'.length));
}
test('ordinary app does not prepare automatically; every witnessed checkpoint restores through production startup', t => {
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
