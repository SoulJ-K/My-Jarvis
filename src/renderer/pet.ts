const egg = document.querySelector<HTMLButtonElement>('#egg')!;
// Identity comes from the app-owned store, never generated or persisted by the page.
window.petWindow.snapshot().then(pet => {
  egg.dataset.petId = pet.petId;
  egg.dataset.stage = pet.stage;
}).catch(() => {
  egg.disabled = true;
  egg.setAttribute('aria-label', '알 정보를 불러오지 못했습니다. 앱을 다시 실행해 주세요.');
});
let activePointer: number | undefined;
let hovering = false;
let lastRevision = -1;

function renderBrain(state: import('../shared/pet-state').EggSnapshot) {
  // A delayed initial read must not overwrite a more recent state notification.
  if (state.revision <= lastRevision) return;
  lastRevision = state.revision;
  egg.dataset.behavior = state.behavior;
  egg.classList.toggle('reacting', state.behavior === 'reacting');
  egg.classList.toggle('soothed', state.behavior === 'soothed');
  if (state.behavior !== 'idle') document.querySelector('#save-status')!.textContent = '';
}
const unsubscribeBrain = window.petBrain.subscribe(renderBrain);
void window.petBrain.read().then(renderBrain).catch(() => {
  console.error('알 상태를 불러오지 못했습니다.');
});
window.addEventListener('unload', unsubscribeBrain, { once: true });

function syncHover(x: number, y: number) {
  const hit = document.elementFromPoint(x, y)?.closest('#egg') === egg;
  if (hovering !== hit) {
    hovering = hit;
    window.petWindow.hover(hit);
  }
}

window.addEventListener('pointermove', event => {
  if (activePointer !== undefined) {
    if (event.pointerId === activePointer) window.petWindow.moveDrag();
  }
  else syncHover(event.clientX, event.clientY);
});
document.documentElement.addEventListener('pointerleave', () => {
  if (activePointer !== undefined) return;
  hovering = false;
  window.petWindow.hover(false);
});
egg.addEventListener('pointerdown', event => {
  if (event.button !== 0 || activePointer !== undefined) return;
  event.preventDefault();
  activePointer = event.pointerId;
  egg.setPointerCapture(event.pointerId);
  egg.classList.add('pressed');
  window.petWindow.beginDrag();
});
egg.addEventListener('pointerup', async event => {
  if (event.pointerId !== activePointer) return;
  activePointer = undefined;
  egg.releasePointerCapture(event.pointerId);
  egg.classList.remove('pressed', 'stroking');
  await window.petWindow.endDrag();
  // Main resets click-through after each gesture; force the current hover to resync.
  hovering = false;
  syncHover(event.clientX, event.clientY);
});
function cancelGesture() {
  if (activePointer === undefined) return;
  activePointer = undefined;
  egg.classList.remove('pressed', 'stroking');
  hovering = false;
  window.petWindow.cancelDrag();
}
egg.addEventListener('pointercancel', cancelGesture);
egg.addEventListener('lostpointercapture', cancelGesture);
window.addEventListener('blur', cancelGesture);
window.addEventListener('contextmenu', event => event.preventDefault());

const unsubscribeSave = window.petWindow.onSaveFailed(() => {
  document.querySelector('#save-status')!.textContent = '돌봄을 저장하지 못했어요. 다시 시도해 주세요.';
});
window.addEventListener('unload', unsubscribeSave, { once: true });

const unsubscribeReady = window.petWindow.onStrokeReady(() => {
  if (activePointer !== undefined) egg.classList.add('stroking');
});
window.addEventListener('unload', unsubscribeReady, { once: true });
