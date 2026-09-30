const egg = document.querySelector<HTMLButtonElement>('#egg')!;
// Identity comes from the app-owned store, never generated or persisted by the page.
window.petWindow.snapshot().then(pet => {
  egg.dataset.petId = pet.petId;
  egg.dataset.stage = pet.stage;
  if (pet.stage === 'baby') {
    document.documentElement.dataset.stage = 'baby';
    egg.classList.add('baby-idle');
    egg.title = '클릭: 입력창 · 드래그: 이동';
    egg.setAttribute('aria-label', `${pet.name ?? '아기'}, 클릭하면 입력창을 열고, 드래그하면 이동합니다.`);
    document.querySelector('#pet-name')!.textContent = pet.name ?? '';
    document.querySelector('main')!.setAttribute('aria-label', 'Jarvis Pet 아기');
  }
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
  const hit = Boolean(document.elementFromPoint(x, y)?.closest('#egg, #food'));
  if (hovering !== hit) {
    hovering = hit;
    window.petWindow.hover(hit);
  }
}

window.addEventListener('pointermove', event => {
  if (foodPointer !== undefined) return;
  if (activePointer !== undefined) {
    if (event.pointerId === activePointer) window.petWindow.moveDrag();
  }
  else syncHover(event.clientX, event.clientY);
});
document.documentElement.addEventListener('pointerleave', () => {
  if (activePointer !== undefined || foodPointer !== undefined) return;
  hovering = false;
  window.petWindow.hover(false);
});
egg.addEventListener('pointerdown', event => {
  if (event.button !== 0 || activePointer !== undefined || foodPointer !== undefined) return;
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

const food = document.querySelector<HTMLButtonElement>('#food')!;
const caption = document.querySelector<HTMLParagraphElement>('#life-caption')!;
let babyRevision = -1;
let babyState: import('../pet/baby-life').BabyPresentation | null = null;
let foodPointer: number | undefined;
let foodStart = { x: 0, y: 0 };
let foodMoved = false;
let feeding = false;
let babySaveFailed = false;
let activeMealId: string | undefined;
let displayedBabyPosition = { x: 36, y: 152 };
function moveBaby(position: { x: number; y: number }) {
  displayedBabyPosition = position;
  egg.style.setProperty('--baby-x', `${position.x - 36}px`);
  egg.style.setProperty('--baby-y', `${position.y - 152}px`);
  const shadow = document.querySelector<HTMLElement>('.shadow')!;
  shadow.style.setProperty('--baby-x', `${position.x - 36}px`);
  shadow.style.setProperty('--baby-y', `${position.y - 152}px`);
}
function renderBaby(state: import('../pet/baby-life').BabyPresentation | null) {
  if (!state || state.revision < babyRevision) return;
  babyRevision = state.revision;
  babyState = state;
  document.documentElement.dataset.stage = 'baby';
  egg.classList.add('baby-idle');
  egg.dataset.life = state.behavior;
  egg.dataset.dayPeriod = state.dayPeriod;
  document.querySelector<HTMLElement>('.shadow')!.dataset.approaching = String(state.behavior === 'approaching');
  // Sleeping/eating and requests for space take priority; no queued greeting.
  const reunion = Boolean(state.reunion && (state.behavior === 'resting' || state.behavior === 'drowsy') && state.social.motion !== 'away');
  egg.dataset.reunion = String(reunion);
  if (state.meal) {
    if (activeMealId !== state.meal.id) {
      activeMealId = state.meal.id;
      const remaining = Math.max(0, state.meal.approachMs - state.meal.progressMs);
      egg.style.setProperty('--approach-ms', `${remaining}ms`);
      document.querySelector<HTMLElement>('.shadow')!.style.setProperty('--approach-ms', `${remaining}ms`);
      moveBaby(state.position);
      // Commit the start frame before moving. This also resumes a meal after a page reload.
      void egg.getBoundingClientRect();
      moveBaby({ x: state.meal.x - 66, y: state.meal.y - 63 });
    }
  } else {
    activeMealId = undefined;
    if (displayedBabyPosition.x !== state.position.x || displayedBabyPosition.y !== state.position.y) moveBaby(state.position);
  }
  const socialStep = state.behavior === 'resting' || state.behavior === 'drowsy' ?
    state.social.motion === 'away' ? 18 : state.social.motion === 'near' ? -8 :
      state.social.motion === 'chase' ? (egg.dataset.direction === 'left' ? -14 : 14) : 0 : 0;
  egg.style.setProperty('--social-x', `${Math.max(8, Math.min(308, state.position.x + socialStep)) - state.position.x}px`);
  if (foodPointer === undefined) {
    food.hidden = !state.offerId && !state.meal;
    food.disabled = Boolean(state.meal) || feeding;
    food.style.left = `${(state.meal?.x ?? 372) - 22}px`;
    food.style.top = `${(state.meal?.y ?? 200) - 22}px`;
  }
  food.dataset.eating = String(state.behavior === 'eating');
  const chewProgress = state.meal ? Math.max(0, Math.min(1,
    (state.meal.progressMs - state.meal.approachMs) / state.meal.chewMs)) : 0;
  food.style.setProperty('--food-bite', String(1 - chewProgress * .9));
  const text = { resting: '', drowsy: '졸려…', sleeping: '새근새근', approaching: '다가가는 중', eating: '냠냠' }[state.behavior];
  caption.textContent = state.social.motion === 'away' ? state.social.caption :
    reunion ? (state.behavior === 'drowsy' ? '왔어…?' : '왔어!') : text || state.social.caption;
  egg.dataset.social = state.social.motion;
  const orb = document.querySelector<HTMLElement>('#emotion-orb')!;
  orb.hidden = !state.social.orb;
  orb.dataset.orbId = state.social.orb?.id ?? '';
  orb.dataset.expression = state.social.orb?.expression ?? 'quiet';
  orb.dataset.play = String(state.social.motion === 'play-orb');
  if (babySaveFailed) { document.querySelector('#save-status')!.textContent = ''; babySaveFailed = false; }
}
function showBabyFailure() {
  babySaveFailed = true;
  document.querySelector('#save-status')!.textContent = '생활을 저장하지 못했어요. 잠시 후 다시 시도해요.';
}
const unsubscribeBaby = window.babyLife.subscribe(renderBaby);
const unsubscribeBabyFailure = window.babyLife.onSaveFailed(showBabyFailure);
void window.babyLife.read().then(renderBaby).catch(showBabyFailure);
window.addEventListener('unload', () => { unsubscribeBaby(); unsubscribeBabyFailure(); }, { once: true });
async function placeFood(x: number, y: number) {
  if (!babyState?.offerId || feeding) return;
  if (x < 0 || x > 420 || y < 0 || y > 300) {
    renderBaby(babyState); return;
  }
  feeding = true; food.disabled = true;
  try { renderBaby(await window.babyLife.feed(babyState.offerId, x, y)); }
  catch { showBabyFailure(); }
  finally { feeding = false; if (babyState) { food.disabled = Boolean(babyState.meal); } }
}
food.addEventListener('pointerdown', event => {
  if (event.button !== 0 || foodPointer !== undefined || activePointer !== undefined || feeding) return;
  event.preventDefault(); foodPointer = event.pointerId; foodMoved = false;
  foodStart = { x: event.clientX, y: event.clientY };
  food.setPointerCapture(event.pointerId); window.petWindow.hover(true);
});
food.addEventListener('pointermove', event => {
  if (event.pointerId !== foodPointer) return;
  if (Math.hypot(event.clientX - foodStart.x, event.clientY - foodStart.y) > 5) foodMoved = true;
  food.style.left = `${Math.max(0, Math.min(376, event.clientX - 22))}px`;
  food.style.top = `${Math.max(0, Math.min(256, event.clientY - 22))}px`;
});
food.addEventListener('pointerup', event => {
  if (event.pointerId !== foodPointer) return;
  const moved = foodMoved;
  foodPointer = undefined; food.releasePointerCapture(event.pointerId);
  void placeFood(moved ? event.clientX : 220, moved ? event.clientY : 190);
  hovering = false; syncHover(event.clientX, event.clientY);
});
function cancelFood() {
  if (foodPointer === undefined) return;
  const pointer = foodPointer; foodPointer = undefined;
  if (food.hasPointerCapture(pointer)) food.releasePointerCapture(pointer);
  renderBaby(babyState); hovering = false; window.petWindow.hover(false);
}
food.addEventListener('pointercancel', cancelFood);
food.addEventListener('lostpointercapture', cancelFood);
window.addEventListener('blur', cancelFood);
food.addEventListener('click', event => { if (event.detail === 0) void placeFood(220, 190); });

const unsubscribeDirection = window.babyLife.onDirection(direction => { egg.dataset.direction = direction; });
window.addEventListener('unload', unsubscribeDirection, { once: true });
