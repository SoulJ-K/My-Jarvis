interface Window { hatch: import('../shared/hatch').HatchAPI }
let hatchEpoch = -1;
let refreshGeneration = 0;
const hatchStatus = document.querySelector<HTMLElement>('#hatch-status')!;
const hatchRetry = document.querySelector<HTMLButtonElement>('#hatch-retry')!;
const hatchSequence = new JarvisHatch.HatchSequence(document.querySelector<HTMLElement>('#hatch')!, {
  async read() {
    const view = await window.hatch.read();
    if (!view.available || view.epoch !== hatchEpoch) throw new Error('HATCH_PAUSED');
    return view.state;
  },
  async apply(revision, command) {
    const epoch = hatchEpoch;
    const view = command.type === 'witness' ? await window.hatch.witness(revision, epoch, command.scene)
      : command.type === 'name' ? await window.hatch.name(revision, epoch, command.name)
      : (() => { throw new Error('HATCH_REQUEST_DENIED'); })();
    return view.state;
  },
});
async function refreshHatch() {
  const generation = ++refreshGeneration;
  // Invalidate old callbacks immediately, before the asynchronous main read.
  await hatchSequence.setAvailable(false);
  try {
    const view = await window.hatch.read();
    if (generation !== refreshGeneration) return;
    hatchEpoch = view.epoch;
    hatchStatus.textContent = view.available ? '' : '돌아오시면 같은 장면에서 이어갈게요.';
    hatchRetry.hidden = true;
    await hatchSequence.setAvailable(view.available && !document.hidden);
  } catch {
    if (generation !== refreshGeneration) return;
    hatchStatus.textContent = '진행을 불러오지 못했어요. 다시 시도해 주세요.';
    hatchRetry.hidden = false;
  }
}
hatchRetry.addEventListener('click', () => void refreshHatch());
const stopHatch = window.hatch.subscribe(() => void refreshHatch());
window.addEventListener('unload', () => { stopHatch(); hatchSequence.dispose(); }, { once: true });
void refreshHatch();
