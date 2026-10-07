import assert from 'node:assert/strict';
import test from 'node:test';
import { existsSync, linkSync, lstatSync, mkdirSync, mkdtempSync, readFileSync, readdirSync, realpathSync,
  renameSync, rmSync, symlinkSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { tmpdir } from 'node:os';
import { SelectedTrashSnackBackend, SelectedTrashSnackService } from '../src/main/trash-snack';

/** Only this test-owned directory is read/modified/deleted; never os.homedir(). */
function fixture(t: test.TestContext) {
  // A fresh checkout has no .local directory. Canonicalize macOS /var aliases
  // so the production path checks still exercise the exact synthetic root.
  const directory = realpathSync(mkdtempSync(path.join(tmpdir(), 'trash-snack-fixture-')));
  const root = path.join(directory, 'SyntheticTrash'); mkdirSync(root, { mode: 0o700 });
  const support = { available: true, exactTrashOrder: false, conditionalDelete: false, dockDrop: false,
    selectionMode: 'user-selected' as const, deletionSafety: 'staged-revalidation' as const, message: 'synthetic' };
  let race: ((source: string, destination: string) => void) | undefined;
  let afterCapture: ((source: string, destination: string) => void) | undefined;
  class Backend extends SelectedTrashSnackBackend {
    protected override capture(source: string, destination: string): void {
      race?.(source, destination); super.capture(source, destination); afterCapture?.(source, destination);
    }
  }
  const backend = new Backend(root, support);
  let meals = 0, allowed = true;
  const service = new SelectedTrashSnackService(backend, {
    canEatSnack: () => allowed, finishSnack: () => { meals++; },
  });
  t.after(() => { rmSync(directory, { recursive: true, force: true }); });
  const file = (name: string, contents = name) => {
    const result = path.join(root, name); writeFileSync(result, contents); return result;
  };
  return { directory, root, backend, service, file, support,
    get meals() { return meals; }, hold() { allowed = false; },
    race(callback: typeof race) { race = callback; },
    afterCapture(callback: typeof afterCapture) { afterCapture = callback; } };
}
async function select(f: ReturnType<typeof fixture>, files: string[]) {
  const p = await f.service.prepareSelection(files);
  assert.equal(p.status, 'confirmation-required');
  if (p.status !== 'confirmation-required') throw new Error('Expected valid selection');
  return p;
}
const confirmation = (operationId: string) => ({ operationId, permanentlyDelete: true });

test('explicit selection deletes exactly the chosen two synthetic files without historical ordering', async t => {
  const f = fixture(t); const a = f.file('a.txt'), b = f.file('b.txt'), untouched = f.file('other.txt');
  const p = await select(f, [b, a]);
  assert.deepEqual(p.candidates.map(c => c.name), ['b.txt', 'a.txt']);
  assert.deepEqual(readdirSync(f.root).sort(), ['a.txt', 'b.txt', 'other.txt']);
  const r = await f.service.confirm(confirmation(p.operationId));
  assert.equal(r.status, 'completed');
  assert.equal(existsSync(a), false); assert.equal(existsSync(b), false);
  assert.equal(readFileSync(untouched, 'utf8'), 'other.txt');
  assert.deepEqual(readdirSync(f.root), ['other.txt']);
  assert.equal(f.meals, 0); assert.equal(f.service.completeMeal(p.operationId), 'recorded');
  assert.equal(f.meals, 1); assert.deepEqual(f.service.recoveryNotices(), []);
});

test('zero, more than two, duplicates, relative/outside/nested paths are rejected without touching them', async t => {
  const f = fixture(t); const a = f.file('a.txt'), b = f.file('b.txt'), c = f.file('c.txt');
  const outside = path.join(f.directory, 'outside.txt'); writeFileSync(outside, 'outside');
  for (const files of [[], [a, b, c], [a, a], [outside], ['a.txt'], [path.join(f.root, 'child', 'a.txt')],
    [`${f.root}/../outside.txt`], [null], 'not-an-array']) {
    assert.deepEqual(await f.service.prepareSelection(files), { status: 'blocked', reason: 'invalid-selection' });
  }
  assert.equal(readFileSync(outside, 'utf8'), 'outside');
  assert.deepEqual(readdirSync(f.root).sort(), ['a.txt', 'b.txt', 'c.txt']);
});

test('folders, app bundles, symlinks and hard links are rejected, not recursively deleted', async t => {
  const f = fixture(t); const ordinary = f.file('ordinary.txt');
  const folder = path.join(f.root, 'folder'), bundle = path.join(f.root, 'App.app');
  mkdirSync(folder); mkdirSync(bundle); writeFileSync(path.join(folder, 'child'), 'preserve');
  const symbolic = path.join(f.root, 'symbolic'); symlinkSync(ordinary, symbolic);
  const hard = path.join(f.root, 'hard'); linkSync(ordinary, hard);
  for (const file of [folder, bundle, symbolic, hard, ordinary]) {
    assert.deepEqual(await f.service.prepareSelection([file]), { status: 'blocked', reason: 'unsafe-target' });
  }
  assert.equal(readFileSync(path.join(folder, 'child'), 'utf8'), 'preserve');
  assert.equal(lstatSync(symbolic).isSymbolicLink(), true);
});

test('a symlink trash root cannot be used as a scope bypass', async t => {
  const f = fixture(t); const file = f.file('safe.txt');
  const aliasRoot = path.join(f.directory, 'AliasTrash'); symlinkSync(f.root, aliasRoot);
  const service = new SelectedTrashSnackService(new SelectedTrashSnackBackend(aliasRoot, f.support), {
    canEatSnack: () => true, finishSnack: () => assert.fail('no meal'),
  });
  assert.deepEqual(await service.prepareSelection([path.join(aliasRoot, 'safe.txt')]), { status: 'blocked', reason: 'unsafe-target' });
  assert.equal(readFileSync(file, 'utf8'), 'safe.txt');
});

test('unrelated trash additions do not expand a direct selection', async t => {
  const f = fixture(t); const selected = f.file('selected'); const p = await select(f, [selected]);
  const newcomer = f.file('newcomer');
  assert.equal((await f.service.confirm(confirmation(p.operationId))).status, 'completed');
  assert.equal(readFileSync(newcomer, 'utf8'), 'newcomer');
});

test('same-name replacement, in-place edit, restore and rename after confirmation display do not delete', async t => {
  const f = fixture(t);
  for (const change of ['replace', 'edit', 'restore', 'rename']) {
    const name = `${change}.txt`, file = f.file(name); const p = await select(f, [file]);
    if (change === 'edit') writeFileSync(file, 'different contents');
    else {
      renameSync(file, path.join(f.directory, name));
      if (change === 'replace') writeFileSync(file, 'new file must survive');
    }
    const result = await f.service.confirm(confirmation(p.operationId));
    assert.equal(result.status, 'blocked');
    if (change === 'edit' || change === 'replace') assert.equal(existsSync(file), true);
    else assert.equal(existsSync(path.join(f.directory, name)), true);
  }
  assert.equal(f.meals, 0);
});

test('invalid reselection invalidates previous permission', async t => {
  const f = fixture(t); const file = f.file('one'); const p = await select(f, [file]);
  await f.service.prepareSelection([path.join(f.directory, 'outside')]);
  assert.deepEqual(await f.service.confirm(confirmation(p.operationId)), { status: 'blocked', reason: 'invalid-confirmation' });
  assert.equal(existsSync(file), true);
});

test('race replacing source after its last check preserves captured replacement and original', async t => {
  const f = fixture(t); const file = f.file('chosen'); const p = await select(f, [file]);
  const original = path.join(f.directory, 'original');
  f.race(source => { renameSync(source, original); writeFileSync(source, 'replacement'); });
  const r = await f.service.confirm(confirmation(p.operationId));
  assert.equal(r.status, 'unknown'); assert.equal(f.meals, 0);
  assert.equal(readFileSync(original, 'utf8'), 'chosen');
  const [notice] = f.service.recoveryNotices();
  assert.ok(notice); assert.equal(notice.fileName, 'chosen');
  assert.equal(readFileSync(path.join(f.root, notice.folderName, notice.fileName), 'utf8'), 'replacement');
  assert.deepEqual(await f.service.prepareSelection([original]), { status: 'blocked', reason: 'busy' });
});

test('raced symlink is preserved without following or deleting its outside target', async t => {
  const f = fixture(t); const file = f.file('chosen'); const p = await select(f, [file]);
  const outside = path.join(f.directory, 'outside'); writeFileSync(outside, 'must survive');
  f.race(source => { renameSync(source, path.join(f.directory, 'original')); symlinkSync(outside, source); });
  assert.equal((await f.service.confirm(confirmation(p.operationId))).status, 'unknown');
  assert.equal(readFileSync(outside, 'utf8'), 'must survive');
  const [notice] = f.service.recoveryNotices();
  assert.equal(lstatSync(path.join(f.root, notice.folderName, notice.fileName)).isSymbolicLink(), true);
});

test('raced folder is preserved with its children, never recursively cleaned', async t => {
  const f = fixture(t); const file = f.file('chosen'); const p = await select(f, [file]);
  f.race(source => {
    renameSync(source, path.join(f.directory, 'original')); mkdirSync(source);
    writeFileSync(path.join(source, 'child'), 'preserve child');
  });
  assert.equal((await f.service.confirm(confirmation(p.operationId))).status, 'unknown');
  const [notice] = f.service.recoveryNotices();
  assert.equal(readFileSync(path.join(f.root, notice.folderName, notice.fileName, 'child'), 'utf8'), 'preserve child');
});

test('a new file at the original name after capture is never deleted', async t => {
  const f = fixture(t); const file = f.file('chosen'); const p = await select(f, [file]);
  f.afterCapture(source => { writeFileSync(source, 'new source must survive'); });
  assert.equal((await f.service.confirm(confirmation(p.operationId))).status, 'completed');
  assert.equal(readFileSync(file, 'utf8'), 'new source must survive');
  assert.deepEqual(readdirSync(f.root), ['chosen']);
});

test('observed content change after capture is preserved and reported as uncertain', async t => {
  const f = fixture(t); const file = f.file('chosen'); const p = await select(f, [file]);
  f.afterCapture((_source, destination) => { writeFileSync(destination, 'edited in stage'); });
  assert.equal((await f.service.confirm(confirmation(p.operationId))).status, 'unknown');
  const [notice] = f.service.recoveryNotices();
  assert.equal(readFileSync(path.join(f.root, notice.folderName, notice.fileName), 'utf8'), 'edited in stage');
  assert.equal(f.meals, 0);
});

test('replacement of the trash root after displaying candidates prevents any deletion', async t => {
  const f = fixture(t); const file = f.file('chosen'); const p = await select(f, [file]);
  const oldRoot = path.join(f.directory, 'PreservedTrash'); renameSync(f.root, oldRoot);
  mkdirSync(f.root, { mode: 0o700 }); writeFileSync(file, 'replacement root file');
  assert.deepEqual(await f.service.confirm(confirmation(p.operationId)), { status: 'blocked', reason: 'read-failed' });
  assert.equal(readFileSync(file, 'utf8'), 'replacement root file');
  assert.equal(readFileSync(path.join(oldRoot, 'chosen'), 'utf8'), 'chosen');
});

test('partial actual filesystem failure reports deletion only for the successful item', async t => {
  const f = fixture(t); const a = f.file('first'), b = f.file('second'); const p = await select(f, [a, b]);
  f.race(source => { if (source === b) throw new Error('synthetic move failure'); });
  const r = await f.service.confirm(confirmation(p.operationId));
  assert.equal(r.status, 'partial'); assert.equal(r.mealReady, false);
  assert.deepEqual(r.items.map(i => i.status), ['deleted', 'failed']);
  assert.equal(existsSync(a), false); assert.equal(readFileSync(b, 'utf8'), 'second');
  assert.equal(f.service.completeMeal(p.operationId), 'not-ready');
  assert.deepEqual(readdirSync(f.root), ['second']);
});

test('life hold after display stops deletion before creating a staging directory', async t => {
  const f = fixture(t); const file = f.file('one'); const p = await select(f, [file]); f.hold();
  assert.deepEqual(await f.service.confirm(confirmation(p.operationId)), { status: 'blocked', reason: 'cannot-eat' });
  assert.deepEqual(readdirSync(f.root), ['one']); assert.equal(f.meals, 0);
});

test('candidate names remain literal and returned data cannot select another file', async t => {
  const f = fixture(t); const chosen = f.file('<b>one</b>'.replaceAll('/', '-')), other = f.file('other');
  const p = await select(f, [chosen]);
  p.candidates[0].name = 'other'; p.candidates[0].id = 'fake';
  assert.equal((await f.service.confirm(confirmation(p.operationId))).status, 'completed');
  assert.equal(existsSync(chosen), false); assert.equal(readFileSync(other, 'utf8'), 'other');
});

test('app picker lists only direct regular files and names/opaque IDs; contents and paths stay private', async t => {
  const f=fixture(t);f.file('가.txt');f.file('b.txt');
  mkdirSync(path.join(f.root,'folder'));writeFileSync(path.join(f.root,'folder','nested.txt'),'keep');
  symlinkSync(path.join(f.root,'b.txt'),path.join(f.root,'symlink'));
  const linked=f.file('hard.txt');linkSync(linked,path.join(f.root,'hard-copy.txt'));
  f.file('bad‮name.txt');
  const choices=await f.service.listChoices();
  assert.deepEqual(choices.map(c=>c.name).sort(),['b.txt','가.txt'].sort());
  choices.forEach(c=>{assert.deepEqual(Object.keys(c).sort(),['id','name']);assert.notEqual(c.id,c.name);});
  const p=await f.service.prepareChoice(choices.map(c=>c.id));
  assert.equal(p.status,'confirmation-required');
  assert.equal(existsSync(path.join(f.root,'b.txt')),true,'selection is not deletion');
});

test('picker rejects stale/replaced files, arbitrary paths, more than two IDs and stale list generations', async t => {
  const f=fixture(t);const a=f.file('a.txt');f.file('b.txt');f.file('c.txt');
  let list=await f.service.listChoices();
  for (const ids of [[a],list.map(c=>c.id),[list[0].id,list[0].id]]) {
    assert.equal((await f.service.prepareChoice(ids)).status,'blocked');
  }
  writeFileSync(a,'new content');
  assert.equal((await f.service.prepareChoice([list.find(c=>c.name==='a.txt')!.id])).status,'blocked');
  const previous=list;list=await f.service.listChoices();
  assert.equal((await f.service.prepareChoice([previous[0].id])).status,'blocked');
  const p=await f.service.prepareChoice([list.find(c=>c.name==='a.txt')!.id]);
  assert.equal(p.status,'confirmation-required');
  assert.equal(readFileSync(a,'utf8'),'new content');
});

test('picker distinguishes an empty trash from a missing/unreadable root and excludes nested contents', async t => {
  const f=fixture(t);mkdirSync(path.join(f.root,'folder'));
  writeFileSync(path.join(f.root,'folder','keep.txt'),'keep');
  assert.deepEqual(await f.service.listChoices(),[]);
  renameSync(f.root,f.root+'-moved');
  await assert.rejects(f.service.listChoices());
});
