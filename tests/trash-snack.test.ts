import assert from 'node:assert/strict';
import test from 'node:test';
import { TrashSnackService, type TrashSnackBackend, type TrashSnackEntry,
  type TrashSnackSnapshot } from '../src/assistant/trash-snack';
import { createTrashSnackService, getTrashSnackCapabilities } from '../src/main/trash-snack';

const entry = (id: string, order: number, patch: Partial<TrashSnackEntry> = {}): TrashSnackEntry => ({
  id, name: `${id}.txt`, identity: `${id}:version1`, kind: 'file', location: 'home-trash-root',
  linkCount: 1, trashOrder: order, ...patch,
});
function fixture(entries = [entry('new', 3), entry('old', 1), entry('middle', 2)]) {
  const f = {
    snapshot: { complete: true, exactOrder: true, revision: '1', entries } as TrashSnackSnapshot,
    allowed: true, finishCount: 0, reads: 0, deletes: [] as string[], clock: 0,
    beforeRead: undefined as undefined | (() => void | Promise<void>),
    beforeDelete: undefined as undefined | ((e: Readonly<TrashSnackEntry>) => void | Promise<void>),
    outcomes: new Map<string, 'failed' | 'unknown'>(),
    failFinish: false,
  };
  const backend: TrashSnackBackend = {
    capabilities: () => ({ available: true, exactTrashOrder: true, conditionalDelete: true, dockDrop: false, message: 'synthetic only' }),
    async snapshot() { f.reads++; await f.beforeRead?.(); return structuredClone(f.snapshot); },
    async deleteIfUnchanged(expected) {
      f.deletes.push(expected.id);
      await f.beforeDelete?.(expected);
      const found = f.snapshot.entries.find(e => e.id === expected.id);
      if (!found || JSON.stringify(found) !== JSON.stringify(expected)) return 'changed';
      const failure = f.outcomes.get(expected.id);
      if (failure) return failure;
      f.snapshot.entries = f.snapshot.entries.filter(e => e.id !== expected.id);
      return 'deleted';
    },
  };
  const hooks = { canEatSnack: () => f.allowed, finishSnack: () => {
    f.finishCount++; if (f.failFinish) throw new Error('synthetic storage interruption');
  } };
  const service = new TrashSnackService(backend, hooks, () => f.clock);
  return Object.assign(f, { backend, service, hooks });
}
async function prepare(f: ReturnType<typeof fixture>) {
  const result = await f.service.prepare();
  assert.equal(result.status, 'confirmation-required');
  if (result.status !== 'confirmation-required') throw new Error('Expected proposal');
  return result;
}
const confirm = (operationId: string) => ({ operationId, permanentlyDelete: true });

test('production factory does not inspect trash without selection and rejects forged confirmation', async () => {
  const service = createTrashSnackService({ canEatSnack() { return true; }, finishSnack() { assert.fail('must not finish'); } });
  const supported = process.platform === 'darwin';
  assert.deepEqual(await service.prepare(), { status: 'blocked', reason: supported ? 'empty' : 'unsupported' });
  assert.deepEqual(await service.confirm(confirm('forged')), { status: 'blocked', reason: supported ? 'invalid-confirmation' : 'unsupported' });
  assert.equal(service.completeMeal('forged'), 'not-ready');
  assert.equal(getTrashSnackCapabilities().exactTrashOrder, false);
  assert.equal(getTrashSnackCapabilities().conditionalDelete, false);
  assert.equal(getTrashSnackCapabilities().dockDrop, false);
});

test('selects only oldest two and performs no deletion until explicit confirmation', async () => {
  const f = fixture(); const p = await prepare(f);
  assert.deepEqual(p.candidates.map(e => e.id), ['old', 'middle']);
  assert.equal(p.warning.includes('영구삭제'), true);
  assert.equal(p.warning.includes('되돌릴 수 없습니다'), true);
  assert.deepEqual(f.deletes, []);
  assert.deepEqual(Object.keys(p.candidates[0]).sort(), ['id', 'name']);
  const result = await f.service.confirm(confirm(p.operationId));
  assert.equal(result.status, 'completed');
  assert.deepEqual(f.deletes, ['old', 'middle']);
  assert.deepEqual(f.snapshot.entries.map(e => e.id), ['new']);
  assert.equal(f.finishCount, 0);
  assert.deepEqual(await f.service.prepare(), { status: 'blocked', reason: 'busy' });
  assert.equal(f.service.completeMeal('wrong'), 'not-ready');
  assert.equal(f.service.completeMeal(p.operationId), 'recorded');
  assert.equal(f.service.completeMeal(p.operationId), 'not-ready');
  assert.equal(f.finishCount, 1);
});

test('folders, symbolic links, aliases, app bundles and special files are never deletion targets', async () => {
  const ignored = (['directory', 'symlink', 'alias', 'package', 'other'] as const)
    .map((kind, i) => entry(`ignored-${kind}`, i, { kind }));
  const f = fixture([...ignored, entry('safe', 100)]);
  const p = await prepare(f); assert.deepEqual(p.candidates, [{ id: 'safe', name: 'safe.txt' }]);
  await f.service.confirm(confirm(p.operationId));
  assert.deepEqual(f.deletes, ['safe']);
  assert.equal(f.snapshot.entries.length, 5);
});

test('unknown/tied order and incomplete snapshots never fall back to names or filesystem dates', async () => {
  const patches = [
    { exactOrder: false }, { complete: false }, { revision: '' },
    { entries: [entry('a', 1, { trashOrder: null })] },
    { entries: [entry('a', 1), entry('b', 1)] },
    { entries: [entry('a', NaN)] }, { entries: [entry('a', -1)] },
    { entries: [entry('a', Number.MAX_SAFE_INTEGER + 1)] },
  ];
  for (const patch of patches) {
    const f = fixture(); Object.assign(f.snapshot, patch);
    assert.deepEqual(await f.service.prepare(), { status: 'blocked', reason: 'untrusted-order' });
    assert.deepEqual(f.deletes, []);
  }
});

test('duplicate identities, unsafe names, hard links, external volumes and out-of-scope files fail closed', async () => {
  const variants: TrashSnackEntry[][] = [
    [entry('dup', 1), entry('dup', 2)],
    [entry('a', 1), entry('b', 2, { identity: 'a:version1' })],
    ...[{ location: 'outside-trash' }, { location: 'external-trash' }, { linkCount: 2 },
      { linkCount: 0 }, { identity: '' }, { name: '../outside' }, { name: '.' },
      { name: 'line\nname' }, { name: 'fake\u202efile' }].map(patch => [entry('a', 1, patch as Partial<TrashSnackEntry>)]),
  ];
  for (const entries of variants) {
    const f = fixture(entries);
    assert.deepEqual(await f.service.prepare(), { status: 'blocked', reason: 'unsafe-target' });
    assert.deepEqual(f.deletes, []);
  }
});

test('empty eligible list does not invent food or record eating', async () => {
  const f = fixture([entry('folder', 1, { kind: 'directory' })]);
  assert.deepEqual(await f.service.prepare(), { status: 'blocked', reason: 'empty' });
  assert.equal(f.finishCount, 0);
});

test('confirmation accepts only the current operation and explicit boolean, not paths or altered targets', async () => {
  const f = fixture(); const p = await prepare(f);
  for (const input of [null, [], true, {}, { operationId: p.operationId },
    { operationId: p.operationId, permanentlyDelete: 'true' }, confirm('forged'),
    { ...confirm(p.operationId), path: '/synthetic/not-authorized' },
    { ...confirm(p.operationId), candidates: ['new'] }]) {
    assert.deepEqual(await f.service.confirm(input), { status: 'blocked', reason: 'invalid-confirmation' });
  }
  p.candidates[0].id = 'new'; // Returned DTO cannot mutate stored authority.
  p.candidates[0].name = 'changed in renderer';
  await f.service.confirm(confirm(p.operationId));
  assert.deepEqual(f.deletes, ['old', 'middle']);
});

test('cancel, new prompt and restart invalidate previous confirmation', async () => {
  const f = fixture(); const a = await prepare(f); const b = await prepare(f);
  assert.deepEqual(await f.service.confirm(confirm(a.operationId)), { status: 'blocked', reason: 'invalid-confirmation' });
  assert.equal(f.service.cancel(b.operationId), true);
  assert.equal(f.service.cancel(b.operationId), false);
  assert.deepEqual(await f.service.confirm(confirm(b.operationId)), { status: 'blocked', reason: 'invalid-confirmation' });
  const c = await prepare(f);
  const restarted = new TrashSnackService(f.backend, f.hooks);
  assert.deepEqual(await restarted.confirm(confirm(c.operationId)), { status: 'blocked', reason: 'invalid-confirmation' });
  assert.deepEqual(f.deletes, []);
});

test('timeout consumes confirmation and prevents late deletion', async () => {
  const f = fixture(); const p = await prepare(f); f.clock = 120000;
  assert.deepEqual(await f.service.confirm(confirm(p.operationId)), { status: 'blocked', reason: 'expired' });
  f.clock = 0;
  assert.deepEqual(await f.service.confirm(confirm(p.operationId)), { status: 'blocked', reason: 'invalid-confirmation' });
  assert.deepEqual(f.deletes, []);
});

test('slow validation also expires confirmation', async () => {
  const f = fixture(); const p = await prepare(f);
  f.beforeRead = () => { f.clock = 120000; };
  assert.deepEqual(await f.service.confirm(confirm(p.operationId)), { status: 'blocked', reason: 'expired' });
  assert.deepEqual(f.deletes, []);
});

test('lifecycle hold/cooldown are checked before listing and again after asynchronous listing', async () => {
  const f = fixture(); f.allowed = false;
  assert.deepEqual(await f.service.prepare(), { status: 'blocked', reason: 'cannot-eat' });
  assert.equal(f.reads, 0);
  f.allowed = true; f.beforeRead = () => { f.allowed = false; };
  assert.deepEqual(await f.service.prepare(), { status: 'blocked', reason: 'cannot-eat' });
  f.allowed = true; f.beforeRead = undefined; const p = await prepare(f);
  f.beforeRead = () => { f.allowed = false; };
  assert.deepEqual(await f.service.confirm(confirm(p.operationId)), { status: 'blocked', reason: 'cannot-eat' });
  assert.deepEqual(f.deletes, []);
});

test('every observed membership/name/identity/type change requires a fresh proposal', async () => {
  for (const mutate of [
    (s: TrashSnackSnapshot) => { s.entries[1].identity = 'replacement'; },
    (s: TrashSnackSnapshot) => { s.entries[1].name = 'renamed'; },
    (s: TrashSnackSnapshot) => { s.entries[1].kind = 'symlink'; },
    (s: TrashSnackSnapshot) => { s.entries.splice(1, 1); },
    (s: TrashSnackSnapshot) => { s.entries.push(entry('added', 4)); },
    (s: TrashSnackSnapshot) => { s.revision = 'another-directory'; },
  ]) {
    const f = fixture(); const p = await prepare(f); mutate(f.snapshot);
    assert.deepEqual(await f.service.confirm(confirm(p.operationId)), { status: 'blocked', reason: 'changed' });
    assert.deepEqual(f.deletes, []);
  }
});

test('conditional backend stops a replacement that races after the final snapshot', async () => {
  const f = fixture(); const p = await prepare(f);
  f.beforeDelete = () => { f.snapshot.entries[1] = entry('old', 1, { identity: 'replaced', kind: 'symlink' }); };
  const result = await f.service.confirm(confirm(p.operationId));
  assert.equal(result.status, 'failed');
  assert.deepEqual(result.items.map(i => i.status), ['changed', 'not-attempted']);
  assert.equal(f.snapshot.entries.length, 3); assert.equal(f.finishCount, 0);
});

test('overlapping confirmation cannot delete twice and preparation stays locked during execution', async () => {
  const f = fixture(); const p = await prepare(f);
  let release!: () => void;
  f.beforeRead = () => new Promise<void>(resolve => { release = resolve; });
  const first = f.service.confirm(confirm(p.operationId));
  assert.deepEqual(await f.service.confirm(confirm(p.operationId)), { status: 'blocked', reason: 'busy' });
  assert.deepEqual(await f.service.prepare(), { status: 'blocked', reason: 'busy' });
  release(); assert.equal((await first).status, 'completed');
  f.service.completeMeal(p.operationId);
  assert.deepEqual(await f.service.confirm(confirm(p.operationId)), { status: 'blocked', reason: 'invalid-confirmation' });
  assert.deepEqual(f.deletes, ['old', 'middle']); assert.equal(f.finishCount, 1);
});

test('partial failure reports real success, stops retry and never records a complete meal', async () => {
  const f = fixture(); f.outcomes.set('middle', 'failed'); const p = await prepare(f);
  const result = await f.service.confirm(confirm(p.operationId));
  assert.equal(result.status, 'partial');
  assert.deepEqual(result.items.map(i => i.status), ['deleted', 'failed']);
  assert.equal(result.mealReady, false); assert.equal(f.service.completeMeal(p.operationId), 'not-ready');
  assert.equal(f.finishCount, 0); assert.equal(f.snapshot.entries.some(e => e.id === 'old'), false);
  assert.deepEqual(await f.service.confirm(confirm(p.operationId)), { status: 'blocked', reason: 'invalid-confirmation' });
});

test('first failure stops the remaining deletion', async () => {
  const f = fixture(); f.outcomes.set('old', 'failed'); const p = await prepare(f);
  const result = await f.service.confirm(confirm(p.operationId));
  assert.equal(result.status, 'failed'); assert.deepEqual(f.deletes, ['old']);
  assert.deepEqual(result.items.map(i => i.status), ['failed', 'not-attempted']);
});

test('lost eligibility between deletions stops remaining work and does not fake a completed meal', async () => {
  const f = fixture(); const p = await prepare(f); f.beforeDelete = () => { f.allowed = false; };
  const result = await f.service.confirm(confirm(p.operationId));
  assert.equal(result.status, 'partial'); assert.deepEqual(f.deletes, ['old']);
  assert.equal(f.finishCount, 0);
});

test('unknown outcomes, including a thrown deletion, block retries and eating', async () => {
  for (const throwing of [false, true]) {
    const f = fixture(); const p = await prepare(f);
    if (throwing) f.beforeDelete = () => { throw new Error('synthetic interrupted response'); };
    else f.outcomes.set('old', 'unknown');
    const result = await f.service.confirm(confirm(p.operationId));
    assert.equal(result.status, 'unknown'); assert.deepEqual(f.deletes, ['old']);
    assert.deepEqual(await f.service.prepare(), { status: 'blocked', reason: 'busy' });
    assert.equal(f.service.completeMeal(p.operationId), 'not-ready'); assert.equal(f.finishCount, 0);
  }
});

test('a storage exception after meal completion is uncertain and is not retried', async () => {
  const f = fixture(); const p = await prepare(f); await f.service.confirm(confirm(p.operationId));
  f.failFinish = true;
  assert.equal(f.service.completeMeal(p.operationId), 'unknown');
  assert.equal(f.service.completeMeal(p.operationId), 'not-ready'); assert.equal(f.finishCount, 1);
  assert.deepEqual(await f.service.prepare(), { status: 'blocked', reason: 'busy' });
});

test('read errors do not expose paths/errors and do not record eating', async () => {
  const f = fixture(); f.beforeRead = () => { throw new Error('/synthetic/private/name'); };
  assert.deepEqual(await f.service.prepare(), { status: 'blocked', reason: 'read-failed' });
  f.beforeRead = undefined; const p = await prepare(f);
  f.beforeRead = () => { throw new Error('/synthetic/private/name'); };
  assert.deepEqual(await f.service.confirm(confirm(p.operationId)), { status: 'blocked', reason: 'read-failed' });
  assert.deepEqual(f.deletes, []); assert.equal(f.finishCount, 0);
});
