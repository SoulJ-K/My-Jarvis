/** The saved hatch sequence lives in the pet's existing transparent window. */
const hatchOverlay = document.querySelector<HTMLElement>('#hatch-overlay')!;
let inlineEpoch = -1;
let inlineGeneration = 0;
const layout = (view: import('../shared/hatch').HatchView) => {
  hatchOverlay.style.setProperty('--hatch-x', `${view.layout.x}px`);
  hatchOverlay.style.setProperty('--hatch-y', `${view.layout.y}px`);
  hatchOverlay.dataset.expanded = String(view.layout.expanded);
};
const sequence = new JarvisHatch.HatchSequence(hatchOverlay, {
  async read() {
    const view = await window.hatch.read();
    if (!view.available || view.epoch !== inlineEpoch) throw new Error('HATCH_PAUSED');
    layout(view);
    return view.state;
  },
  async apply(revision, command) {
    const epoch = inlineEpoch;
    const view = command.type === 'witness' ? await window.hatch.witness(revision, epoch, command.scene)
      : command.type === 'name' ? await window.hatch.name(revision, epoch, command.name)
      : (() => { throw new Error('HATCH_REQUEST_DENIED'); })();
    layout(view);
    return view.state;
  },
}, true);
async function refreshInlineHatch() {
  const generation = ++inlineGeneration;
  await sequence.setAvailable(false);
  try {
    const view = await window.hatch.read();
    if (generation !== inlineGeneration) return;
    inlineEpoch = view.epoch;
    layout(view);
    hatchOverlay.hidden = !view.available;
    document.documentElement.dataset.hatching = String(view.available);
    await sequence.setAvailable(view.available && !document.hidden);
  } catch {
    if (generation !== inlineGeneration) return;
    hatchOverlay.hidden = true;
    document.documentElement.dataset.hatching = 'false';
  }
}
const stopInlineHatch = window.hatch.subscribe(() => void refreshInlineHatch());
window.addEventListener('unload', () => { stopInlineHatch(); sequence.dispose(); }, { once: true });
