const egg = document.querySelector<HTMLButtonElement>('#egg')!;
let activePointer: number | undefined;
let hovering = false;

function syncHover(x: number, y: number) {
  const hit = document.elementFromPoint(x, y)?.closest('#egg') === egg;
  if (hovering !== hit) {
    hovering = hit;
    window.petWindow.hover(hit);
  }
}

window.addEventListener('pointermove', event => {
  if (activePointer !== undefined) window.petWindow.moveDrag();
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
  egg.classList.remove('pressed');
  const moved = await window.petWindow.endDrag();
  // Main resets click-through after each gesture; force the current hover to resync.
  hovering = false;
  syncHover(event.clientX, event.clientY);
  if (!moved) {
    egg.classList.remove('reacting');
    void egg.offsetWidth;
    egg.classList.add('reacting');
  }
});
function cancelGesture() {
  if (activePointer === undefined) return;
  activePointer = undefined;
  egg.classList.remove('pressed');
  hovering = false;
  window.petWindow.cancelDrag();
}
egg.addEventListener('pointercancel', cancelGesture);
egg.addEventListener('lostpointercapture', cancelGesture);
window.addEventListener('blur', cancelGesture);
egg.addEventListener('animationend', () => egg.classList.remove('reacting'));
window.addEventListener('contextmenu', event => event.preventDefault());
