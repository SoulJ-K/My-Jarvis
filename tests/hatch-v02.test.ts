import assert from 'node:assert/strict';
import test from 'node:test';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';

// Minimal DOM double: verifies saved-scene control and node continuity, not pixels.
class Element {
  children: Element[] = [];
  parentElement: Element | null = null;
  dataset: Record<string, string> = {};
  attributes: Record<string, string> = {};
  className = '';
  classList = { add: (_name: string) => {} };
  textContent = '';
  hidden = false;
  disabled = false;
  listeners = new Map<string, () => unknown>();
  constructor(readonly tag = 'div') {}
  setAttribute(name: string, value: string) { this.attributes[name] = value; }
  append(...elements: Element[]) { for (const e of elements) { e.remove(); e.parentElement = this; this.children.push(e); } }
  prepend(e: Element) { e.remove(); e.parentElement = this; this.children.unshift(e); }
  remove() { if (this.parentElement) this.parentElement.children = this.parentElement.children.filter(e => e !== this); this.parentElement = null; }
  replaceChildren() { for (const e of [...this.children]) e.remove(); }
  addEventListener(name: string, listener: () => unknown) { this.listeners.set(name, listener); }
  focus() {}
}
function setup() {
  const timers = new Map<number, () => Promise<void>>(); let serial = 0;
  const prompts: { save: (name: string) => Promise<void>; element: Element }[] = [];
  const root = new Element();
  const context = vm.createContext({
    document: { hidden: false, createElement: (tag: string) => new Element(tag), addEventListener() {}, removeEventListener() {} },
    setTimeout: (fn: () => Promise<void>) => { timers.set(++serial, fn); return serial; },
    clearTimeout: (id: number) => timers.delete(id),
    JarvisHatch: { NamePrompt: class {
      element = new Element('form'); value = '';
      constructor(readonly save: (name: string) => Promise<void>) { prompts.push(this); }
      focus() {} dispose() { this.element.remove(); }
    } },
  });
  vm.runInContext(readFileSync(path.join(__dirname, '../src/renderer/HatchSequence.js'), 'utf8'), context);
  const Constructor = vm.runInContext('JarvisHatch.HatchSequence', context) as new (root: Element, transport: unknown, auto: boolean) => {
    setAvailable(v: boolean): Promise<void>; dispose(): void;
  };
  let state = { petId: 'test-id', orbId: 'test-id:orb', revision: 0, ready: true, name: null as string | null,
    completed: null as string | null };
  let fail = false;
  const requests: string[] = [];
  const sequence = new Constructor(root, {
    async read() { return { ...state }; },
    async apply(revision: number, command: { type: string; scene: string; name: string }) {
      assert.equal(revision, state.revision);
      if (fail) throw new Error('SIMULATED_SAVE_FAILURE');
      requests.push(command.type === 'name' ? 'name' : command.scene);
      state = { ...state, revision: state.revision + 1,
        completed: command.type === 'name' ? state.completed : command.scene,
        name: command.type === 'name' ? command.name : state.name };
      return { ...state };
    },
  }, true);
  return { root, timers, prompts, requests, sequence, fail: (v: boolean) => { fail = v; },
    async next() { const [id, run] = [...timers][0]; timers.delete(id); await run(); } };
}
test('hatch reuses the same art through committed scenes and keeps the naming orb side fixed', async () => {
  const h = setup(); await h.sequence.setAvailable(true);
  const art = h.root.children[0]; const parts = [...art.children];
  for (const step of ['prelude', 'crack', 'orb', 'shell', 'baby', 'contact']) {
    assert.equal(h.root.dataset.step, step); assert.equal(h.root.children[0], art);
    assert.deepEqual(art.children, parts);
    await h.next();
  }
  assert.equal(h.root.dataset.step, 'naming');
  const side = h.root.dataset.orbSide;
  await h.sequence.setAvailable(false); assert.equal(h.timers.size, 0);
  await h.sequence.setAvailable(true);
  assert.equal(h.root.dataset.orbSide, side); assert.equal(h.root.dataset.step, 'naming');
  await h.prompts.at(-1)!.save('시험'); assert.equal(h.root.dataset.step, 'life');
  assert.deepEqual(h.requests, ['prelude', 'crack', 'orb', 'shell', 'baby', 'contact', 'name']);
  h.sequence.dispose(); assert.equal(h.timers.size, 0);
});
test('failed hatch checkpoint stays in its visible scene and advances only after explicit retry saves', async () => {
  const h = setup(); await h.sequence.setAvailable(true); const art = h.root.children[0];
  h.fail(true); await h.next();
  assert.equal(h.root.dataset.step, 'prelude'); assert.equal(h.root.children[0], art);
  assert.equal(h.timers.size, 0); assert.equal(h.requests.length, 0);
  const retry = h.root.children.find(e => e.tag === 'button')!;
  assert.equal(retry.hidden, false); h.fail(false);
  await retry.listeners.get('click')!(); assert.equal(h.root.dataset.step, 'crack');
  assert.deepEqual(h.requests, ['prelude']); h.sequence.dispose();
});
