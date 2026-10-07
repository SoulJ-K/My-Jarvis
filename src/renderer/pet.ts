const motionPreference = window.matchMedia('(prefers-reduced-motion: reduce)');
const sendMotionPreference = () => window.babyLife.setReducedMotion(motionPreference.matches);
sendMotionPreference();
motionPreference.addEventListener('change', sendMotionPreference);
window.addEventListener('unload', () => motionPreference.removeEventListener('change', sendMotionPreference), { once: true });
const egg = document.querySelector<HTMLButtonElement>('#egg')!;
let babyName = '아기';
// Identity comes from the app-owned store, never generated or persisted by the page.
window.petWindow.snapshot().then(pet => {
  egg.dataset.petId = pet.petId;
  egg.dataset.stage = pet.stage;
  if (pet.stage === 'baby') {
    document.documentElement.dataset.stage = 'baby';
    egg.classList.add('baby-idle');
    egg.title = '클릭: 입력창 · 드래그: 이동';
    babyName = pet.name ?? '아기';
    updateBabyLabel();
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
  const hit = Boolean(document.elementFromPoint(x, y)?.closest('#egg, #food, #hatch-overlay form, #hatch-overlay button, [data-pet-interactive]'));
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
window.addEventListener('pointerup', async event => {
  if (event.pointerId !== activePointer) return;
  activePointer = undefined;
  if (egg.hasPointerCapture(event.pointerId)) egg.releasePointerCapture(event.pointerId);
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
const unsubscribeNativeDrag = window.petWindow.onNativeDragReset(() => {
  const pointer=activePointer; activePointer=undefined; hovering=false;
  if(pointer!==undefined && egg.hasPointerCapture(pointer)) egg.releasePointerCapture(pointer);
  egg.classList.remove('pressed','stroking');
});
window.addEventListener('unload',unsubscribeNativeDrag,{once:true});
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
const sleepSymbol = document.querySelector<HTMLElement>('#sleep-symbol')!;
let babyRevision = -1;
let babyState: import('../pet/baby-life').BabyPresentation | null = null;
let foodPointer: number | undefined;
let foodStart = { x: 0, y: 0 };
let foodMoved = false;
let feeding = false;
let babySaveFailed = false;
let activeMealId: string | undefined;
let displayedBabyPosition = { x: 36, y: 152 };
const wakeMotion = new BabyWakeMotion(() => { if (babyState) renderBaby(babyState); });
function moveBaby(position: { x: number; y: number }) {
  displayedBabyPosition = position;
  egg.style.setProperty('--body-x', `${position.x}px`);
  egg.style.setProperty('--body-y', `${position.y}px`);
  egg.style.setProperty('--baby-x', `${position.x - 36}px`);
  egg.style.setProperty('--baby-y', `${position.y - 152}px`);
  const shadow = document.querySelector<HTMLElement>('.shadow')!;
  shadow.style.setProperty('--baby-x', `${position.x - 36}px`);
  shadow.style.setProperty('--baby-y', `${position.y - 152}px`);
}
function updateBabyLabel() {
  const state = babyState;
  const activity = !state ? '' : wakeMotion.active ? '잠에서 깨어나고 있습니다' :
    state.behavior === 'sleeping' ? '자고 있습니다' :
    state.behavior === 'drowsy' ? '졸려 꾸벅이고 있습니다' :
    state.behavior === 'approaching' ? '먹이로 다가가고 있습니다' :
    state.behavior === 'eating' ? '먹이를 먹고 있습니다' :
    state.social.motion === 'away' ? '잠시 거리를 두고 있습니다' :
    state.reunion ? '반가워하는 모습입니다' :
    state.social.motion === 'bounce' ? '기쁜 모습입니다' :
    state.social.motion === 'tilt' ? '궁금해하는 모습입니다' :
    state.social.motion === 'chase' ? '커서를 따라 놀고 있습니다' :
    state.social.motion === 'play-orb' ? '구슬을 가지고 놀고 있습니다' : '쉬고 있습니다';
  egg.setAttribute('aria-label', `${babyName}${activity ? `, ${activity}` : ''}${state && !state.social.accepting ? ', 지금은 혼자 있고 싶어합니다' : ''}${state?.attention.level ? ', 남은 일을 챙기고 있습니다' : ''}. 클릭하면 입력창을 열고, 드래그하면 이동합니다.`);
}
function renderBaby(state: import('../pet/baby-life').BabyPresentation | null) {
  if (!state || state.revision < babyRevision) return;
  const firstFrame = babyRevision < 0;
  babyRevision = state.revision;
  if (state.attentionAct || babyState?.attentionAct) hovering = false;
  // Compatibility for an older main caller; integration should use refreshBabyPresentation.
  state = { ...state, position: state.position ?? displayedBabyPosition };
  babyState = state;
  document.documentElement.dataset.stage = 'baby';
  egg.classList.add('baby-idle');
  const waking = wakeMotion.observe(state.behavior);
  egg.dataset.waking = String(waking);
  egg.dataset.life = waking ? 'resting' : state.behavior;
  egg.dataset.dayPeriod = state.dayPeriod;
  egg.dataset.mealDeferred = String(state.mealDeferred);
  egg.dataset.dragging = String(state.dragging ?? false);
  egg.dataset.attention = String(state.attention.level);
  egg.dataset.attentionAct = state.attentionAct ?? '';
  egg.style.setProperty('--attention-scale', String(1 + state.attention.level / 10));
  document.querySelector<HTMLElement>('.shadow')!.dataset.approaching = String(!waking && state.behavior === 'approaching');
  // Wake presents first; the latest meal, distance or return expression follows.
  const reunion = Boolean(!waking && state.reunion && (state.behavior === 'resting' || state.behavior === 'drowsy') && state.social.motion !== 'away');
  egg.dataset.reunion = String(reunion);
  const snapPlacement = firstFrame || !state.meal && (displayedBabyPosition.x !== state.position.x || displayedBabyPosition.y !== state.position.y);
  if (snapPlacement) {
    const shadow = document.querySelector<HTMLElement>('.shadow')!;
    egg.style.transition = 'none'; shadow.style.transition = 'none';
    moveBaby(state.position);
    void egg.getBoundingClientRect();
    // Leave transition disabled until all position and social offsets are committed below.
  }
  if (waking) {
    // Keep the body at its sleeping location until the brief wake movement ends.
    egg.style.setProperty('--social-x', '0px');
  } else if (state.dragging) {
    egg.style.setProperty('--social-x', '0px');
    moveBaby(state.position);
  } else if (state.meal) {
    if (activeMealId !== state.meal.id) {
      activeMealId = state.meal.id;
      const remaining = Math.max(0, state.meal.approachMs - state.meal.progressMs);
      egg.style.setProperty('--approach-ms', `${remaining}ms`);
      document.querySelector<HTMLElement>('.shadow')!.style.setProperty('--approach-ms', `${remaining}ms`);
      moveBaby(state.position);
      // Commit the start frame before moving. This also resumes a meal after a page reload.
      void egg.getBoundingClientRect();
      if (state.meal.kind !== 'snack') moveBaby({ x: state.meal.x - 66, y: state.meal.y - 63 });
    }
  } else {
    activeMealId = undefined;
    if (displayedBabyPosition.x !== state.position.x || displayedBabyPosition.y !== state.position.y) moveBaby(state.position);
  }
  if (!waking) {
    const socialStep = state.behavior === 'resting' || state.behavior === 'drowsy' ?
      state.social.motion === 'away' ? 18 : state.social.motion === 'near' ? -8 :
        state.social.motion === 'chase' ? (egg.dataset.direction === 'left' ? -14 : 14) : 0 : 0;
    egg.style.setProperty('--social-x', `${state.dragging || state.attentionAct || state.position.x < 18 || state.position.x > 290 ? 0 : socialStep}px`);
  }
  if (foodPointer === undefined) {
    food.hidden = !state.offerId && !state.meal;
    food.disabled = Boolean(state.meal) || feeding || state.attention.holdLife;
    food.style.left = `${(state.meal?.x ?? Math.max(22, Math.min(398, state.position.x < 210 ? state.position.x + 170 : state.position.x - 66))) - 22}px`;
    food.style.top = `${(state.meal?.y ?? Math.max(22, Math.min(278, state.position.y + 60))) - 22}px`;
  }
  food.dataset.eating = String(!waking && state.behavior === 'eating');
  const chewProgress = !waking && state.meal ? Math.max(0, Math.min(1,
    (state.meal.progressMs - state.meal.approachMs) / state.meal.chewMs)) : 0;
  food.style.setProperty('--food-bite', String(1 - chewProgress * .9));
  sleepSymbol.hidden = state.behavior !== 'sleeping';
  updateBabyLabel();
  egg.dataset.social = waking ? 'quiet' : state.social.motion;
  const orb = document.querySelector<HTMLElement>('#emotion-orb')!;
  orb.hidden = false;
  orb.dataset.orbId = state.social.orb?.id ?? '';
  orb.dataset.expression = state.social.orb?.expression ?? 'quiet';
  orb.dataset.refusing = String(!state.social.accepting);
  orb.dataset.play = String(!waking && state.social.motion === 'play-orb');
  const position = displayedBabyPosition;
  // Place the orb beside the feet. Choose the roomy side at an edge and keep a
  // stable per-pet preference in the middle; the name owns the above/below row.
  const scale = 1 + state.attention.level / 10;
  const insetX = (104 - 83.2 * scale) / 2;
  const preferredRight = [...(state.social.orb?.id ?? '')].reduce((sum, c) => sum + c.charCodeAt(0), 0) % 2 === 0;
  const leftX = position.x + insetX - 40;
  const rightX = position.x + 104 - insetX + (state.social.motion === 'play-orb' ? 32 : 18);
  const useRight = leftX < 28 || rightX <= 394 && preferredRight;
  orb.style.left = `${Math.max(28, Math.min(394, useRight ? rightX : leftX)) - position.x}px`;
  orb.style.top = `${Math.max(4, Math.min(272, position.y + 68)) - position.y}px`;
  const name = document.querySelector<HTMLElement>('#pet-name')!;
  name.style.top = `${position.y + 121 <= 296 ? 100 : Math.max(4, position.y + 92 - 73.6 * scale - 29) - position.y}px`;
  if (snapPlacement) {
    // OS window coordinates and the body offset must settle in the same frame,
    // especially when a native Dock drag ends near a screen edge.
    void egg.getBoundingClientRect();
    egg.style.removeProperty('transition');
    document.querySelector<HTMLElement>('.shadow')!.style.removeProperty('transition');
  }
  if (babySaveFailed) { document.querySelector('#save-status')!.textContent = ''; babySaveFailed = false; }
}
function showBabyFailure() {
  babySaveFailed = true;
  document.querySelector('#save-status')!.textContent = '생활을 저장하지 못했어요. 잠시 후 다시 시도해요.';
}
const unsubscribeBaby = window.babyLife.subscribe(renderBaby);
const unsubscribeBabyFailure = window.babyLife.onSaveFailed(showBabyFailure);
void window.babyLife.read().then(renderBaby).catch(showBabyFailure);
window.addEventListener('unload', () => { unsubscribeBaby(); unsubscribeBabyFailure(); wakeMotion.dispose(); }, { once: true });
async function placeFood(x: number, y: number) {
  if (!babyState?.offerId || feeding) return;
  if (x < 0 || x > 420 || y < 0 || y > 300) {
    renderBaby(babyState); return;
  }
  feeding = true; food.disabled = true;
  try { renderBaby(await window.babyLife.feed(babyState.offerId, x, y)); }
  catch { showBabyFailure(); }
  finally { feeding = false; if (babyState) { food.disabled = Boolean(babyState.meal) || babyState.attention.holdLife; } }
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
