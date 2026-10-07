/** Temporary tuning for the basic-life prototype, not hatch/growth requirements. */
export const BABY_TIMING = Object.freeze({ hungry: 30 * 60_000, foodEvery: 10 * 60_000,
  foodVisible: 90_000, awake: 45 * 60_000, drowsy: 5 * 60_000, sleep: 15 * 60_000,
  // Old saved meals have no approachMs and retain their original timing.
  approach: 1200, meal: 5000, approachMin: 8000, approachMax: 20_000, chew: 5500,
  mealGap: 15 * 60_000, careCooldown: 30_000 });
export const BABY_STAGE = Object.freeze({ width: 420, height: 300,
  startX: 36, startY: 152, bodyWidth: 104, bodyHeight: 92,
  bodyMinX: 8, bodyMaxX: 308, bodyMinY: 8, bodyMaxY: 200,
  foodStartX: 372, foodStartY: 200,
  foodMinX: 74, foodMaxX: 374, foodMinY: 71, foodMaxY: 263 });
export interface BabyPosition { x: number; y: number }
export function reachableFoodPoint(x: number, y: number): BabyPosition {
  return { x: Math.max(BABY_STAGE.foodMinX, Math.min(BABY_STAGE.foodMaxX, x)),
    y: Math.max(BABY_STAGE.foodMinY, Math.min(BABY_STAGE.foodMaxY, y)) };
}
export function babyTargetForFood(x: number, y: number): BabyPosition {
  const food = reachableFoodPoint(x, y);
  // Food is held near the lower body; the baby has no mouth drawing.
  return { x: food.x - 66, y: food.y - 63 };
}
export function babyApproachDuration(from: BabyPosition, x: number, y: number): number {
  const target = babyTargetForFood(x, y);
  return Math.round(Math.max(BABY_TIMING.approachMin, Math.min(BABY_TIMING.approachMax,
    Math.hypot(target.x - from.x, target.y - from.y) * 72)));
}
export interface BabyLife {
  revision: number; observedAtMs: number; elapsedMs: number; hungerMs: number;
  lastCareElapsedMs: number | null;
  lastMealFinishedElapsedMs?: number;
  pendingSleepMs?: number;
  mealDeferredUntil?: number;
  snackPending?: boolean;
  lastSnackReceiptId?: string;
  home?: BabyPosition;
  attentionPreference?: 'bottom' | 'cursor';
  meal: { id: string; startedElapsedMs: number; x: number; y: number; approachMs?: number; kind?: 'snack' } | null;
}
export interface BabyExperience { kind: 'food_offered' | 'meal_finished' | 'sleep_completed' | 'touch' | 'sleep_touch'; atMs: number; durationMs?: number }
export type BabyCommand = { type: 'tick' } | { type: 'touch' } |
  { type: 'snack-begin'; receiptId?: string } | { type: 'snack-finished' } | { type: 'meal-deferred' } |
  { type: 'feed'; offerId: string; x: number; y: number; approachMs: number };
export const cycle = BABY_TIMING.awake + BABY_TIMING.sleep;
/** Provisional device-local boundaries, not a learned schedule or final product policy. */
export const BABY_DAY_HOURS = Object.freeze({ day: 7, night: 20, lateNight: 23 });
export function babyDayPeriod(atMs: number): 'day' | 'night' | 'late-night' {
  const hour = new Date(atMs).getHours();
  return hour < BABY_DAY_HOURS.day || hour >= BABY_DAY_HOURS.lateNight ? 'late-night' :
    hour >= BABY_DAY_HOURS.night ? 'night' : 'day';
}
export function initialBabyLife(now: number): BabyLife {
  return { revision: 0, observedAtMs: now, elapsedMs: 0, hungerMs: 0, lastCareElapsedMs: null, meal: null };
}
export function validateBabyLife(s: BabyLife): void {
  const integer = (n: unknown) => Number.isSafeInteger(n) && Number(n) >= 0;
  if (!s || ![s.revision, s.observedAtMs, s.elapsedMs, s.hungerMs].every(integer) ||
    s.hungerMs > BABY_TIMING.hungry || (s.lastCareElapsedMs !== null && (!integer(s.lastCareElapsedMs) || s.lastCareElapsedMs > s.elapsedMs)) ||
    (s.meal !== null && (!s.meal || typeof s.meal.id !== 'string' || !integer(s.meal.startedElapsedMs) ||
      s.meal.startedElapsedMs > s.elapsedMs || !validFoodPoint(s.meal.x, s.meal.y) ||
      s.meal.approachMs !== undefined && !validApproachMs(s.meal.approachMs) ||
      s.meal.kind !== undefined && s.meal.kind !== 'snack'))) throw new Error('BABY_STATE_INVALID');
  if (s.lastMealFinishedElapsedMs !== undefined && (!integer(s.lastMealFinishedElapsedMs) || s.lastMealFinishedElapsedMs > s.elapsedMs) ||
    s.pendingSleepMs !== undefined && !integer(s.pendingSleepMs) ||
    s.mealDeferredUntil !== undefined && !integer(s.mealDeferredUntil) ||
    s.snackPending !== undefined && typeof s.snackPending !== 'boolean' ||
    s.lastSnackReceiptId !== undefined && !validSnackReceipt(s.lastSnackReceiptId) ||
    s.home !== undefined && (!s.home || !Number.isFinite(s.home.x) || !Number.isFinite(s.home.y)) ||
    s.attentionPreference !== undefined && !['bottom', 'cursor'].includes(s.attentionPreference)) throw new Error('BABY_STATE_INVALID');
}
// Coordinates are local logical pixels within the expanded baby window.
export function validFoodPoint(x: unknown, y: unknown): boolean {
  return typeof x === 'number' && typeof y === 'number' && Number.isFinite(x) && Number.isFinite(y) &&
    x >= 0 && x <= BABY_STAGE.width && y >= 0 && y <= BABY_STAGE.height;
}
function validApproachMs(value: unknown): value is number {
  return Number.isSafeInteger(value) && Number(value) >= BABY_TIMING.approachMin &&
    Number(value) <= BABY_TIMING.approachMax;
}
function validSnackReceipt(id: unknown): id is string { return typeof id === 'string' && /^[A-Za-z0-9:_-]{1,160}$/.test(id); }
function mealTiming(meal: NonNullable<BabyLife['meal']>) {
  if (meal.kind === 'snack') return { approachMs: 0, chewMs: BABY_TIMING.chew };
  const approachMs = meal.approachMs ?? BABY_TIMING.approach;
  return { approachMs, chewMs: meal.approachMs === undefined ? BABY_TIMING.meal - BABY_TIMING.approach : BABY_TIMING.chew };
}
export interface BabyAttention { holdLife: boolean; level: 0 | 1 | 2; intervalSeconds: number }
export const QUIET_ATTENTION: BabyAttention = Object.freeze({ holdLife: false, level: 0, intervalSeconds: 60 });
export function validateAttention(a: BabyAttention): void {
  if (!a || typeof a.holdLife !== 'boolean' || ![0, 1, 2].includes(a.level) ||
    ![15, 30, 45, 60].includes(a.intervalSeconds)) throw new Error('BABY_ATTENTION_INVALID');
}
export function canStartMeal(s: BabyLife, attention: BabyAttention = QUIET_ATTENTION): boolean {
  return !s.meal && !attention.holdLife && (s.lastMealFinishedElapsedMs === undefined ||
    s.elapsedMs - s.lastMealFinishedElapsedMs >= BABY_TIMING.mealGap);
}
export function babyView(s: BabyLife, attention: BabyAttention = QUIET_ATTENTION) {
  const phase = s.elapsedMs % cycle;
  const dayPeriod = babyDayPeriod(s.observedAtMs);
  const behavior: 'approaching' | 'eating' | 'sleeping' | 'drowsy' | 'resting' = s.meal ? (s.elapsedMs - s.meal.startedElapsedMs < mealTiming(s.meal).approachMs ? 'approaching' : 'eating') :
    phase >= BABY_TIMING.awake && !attention.holdLife ? 'sleeping' : dayPeriod === 'late-night' || phase >= BABY_TIMING.awake - BABY_TIMING.drowsy ? 'drowsy' : 'resting';
  const food = canStartMeal(s, attention) && behavior !== 'sleeping' && s.hungerMs >= BABY_TIMING.hungry &&
    (s.elapsedMs - BABY_TIMING.hungry) % BABY_TIMING.foodEvery < BABY_TIMING.foodVisible;
  return { revision: s.revision, behavior, dayPeriod, mealDeferred: s.elapsedMs < (s.mealDeferredUntil ?? 0), attention: { ...attention, preference: s.attentionPreference ?? 'bottom' }, offerId: food ? `food:${Math.floor(s.elapsedMs / BABY_TIMING.foodEvery)}` : null,
    meal: s.meal ? { id: s.meal.id, kind: s.meal.kind ?? 'food', ...reachableFoodPoint(s.meal.x, s.meal.y),
      progressMs: s.elapsedMs - s.meal.startedElapsedMs, ...mealTiming(s.meal) } : null };
}
export type BabyView = ReturnType<typeof babyView>;
// Integrate actual sleep intervals, including long absences, without synthesizing
// a full sleep after a schedule woke the baby or a meal occupied that interval.
function sleepTotal(elapsed: number): number {
  return Math.floor(elapsed / cycle) * BABY_TIMING.sleep + Math.max(0, elapsed % cycle - BABY_TIMING.awake);
}
export function advanceBabyLife(before: BabyLife, now: number, command: BabyCommand,
  attention: BabyAttention = QUIET_ATTENTION) {
  validateBabyLife(before); validateAttention(attention);
  if (command.type === 'snack-begin' && command.receiptId !== undefined && !validSnackReceipt(command.receiptId)) throw new Error('BABY_SNACK_RECEIPT_INVALID');
  if (!Number.isSafeInteger(now) || now < 0) throw new Error('BABY_CLOCK_INVALID');
  const delta = Math.max(0, now - before.observedAtMs);
  const s: BabyLife = { ...before, observedAtMs: Math.max(now, before.observedAtMs),
    elapsedMs: before.elapsedMs + delta, hungerMs: Math.min(BABY_TIMING.hungry, before.hungerMs + delta) };
  const events: BabyExperience[] = [];
  const add = (kind: BabyExperience['kind'], durationMs?: number) => events.push({ kind, atMs: s.observedAtMs, ...(durationMs === undefined ? {} : { durationMs }) });
  if (s.meal && s.elapsedMs - s.meal.startedElapsedMs >= mealTiming(s.meal).approachMs + mealTiming(s.meal).chewMs) {
    const mealMs = mealTiming(s.meal).approachMs + mealTiming(s.meal).chewMs;
    s.hungerMs = Math.min(BABY_TIMING.hungry, s.elapsedMs - s.meal.startedElapsedMs - mealMs);
    s.lastMealFinishedElapsedMs = s.meal.startedElapsedMs + mealMs;
    s.meal = null; add('meal_finished');
  }
  const sleepStart = before.meal ? Math.max(before.elapsedMs,
    before.meal.startedElapsedMs + mealTiming(before.meal).approachMs + mealTiming(before.meal).chewMs) : before.elapsedMs;
  const slept = attention.holdLife || sleepStart >= s.elapsedMs ? 0 : sleepTotal(s.elapsedMs) - sleepTotal(sleepStart);
  s.pendingSleepMs = (before.pendingSleepMs ?? 0) + slept;
  const crossedWake = Math.floor(s.elapsedMs / cycle) > Math.floor(before.elapsedMs / cycle);
  if (s.pendingSleepMs > 0 && (crossedWake || babyView(s, attention).behavior !== 'sleeping')) {
    // Retain only the currently ongoing sleep segment after any completed cycles.
    const ongoing = babyView(s, attention).behavior === 'sleeping'
      ? Math.min(s.pendingSleepMs, Math.max(0, s.elapsedMs % cycle - BABY_TIMING.awake)) : 0;
    if (s.pendingSleepMs > ongoing) add('sleep_completed', s.pendingSleepMs - ongoing);
    s.pendingSleepMs = ongoing;
  }
  if (command.type === 'feed') {
    const view = babyView(s, attention);
    if (!validFoodPoint(command.x, command.y)) throw new Error('BABY_DROP_INVALID');
    if (!validApproachMs(command.approachMs)) throw new Error('BABY_APPROACH_INVALID');
    if (view.offerId !== null && command.offerId === view.offerId) {
      s.meal = { id: command.offerId, startedElapsedMs: s.elapsedMs,
        ...reachableFoodPoint(command.x, command.y), approachMs: command.approachMs };
      add('food_offered');
    } else if (!s.meal) { s.mealDeferredUntil = s.elapsedMs + 2000; }
  } else if (command.type === 'snack-begin' && s.meal?.kind !== 'snack' &&
    (command.receiptId === undefined || command.receiptId !== s.lastSnackReceiptId)) {
    s.snackPending = true;
    if (command.receiptId !== undefined) s.lastSnackReceiptId = command.receiptId;
  } else if (command.type === 'meal-deferred') {
    s.mealDeferredUntil = s.elapsedMs + 2000;
  } else if (command.type === 'snack-finished') {
    s.hungerMs = 0; s.lastMealFinishedElapsedMs = s.elapsedMs; add('meal_finished');
  } else if (command.type === 'touch' && (s.lastCareElapsedMs === null || s.elapsedMs - s.lastCareElapsedMs >= BABY_TIMING.careCooldown)) {
    add(babyView(s, attention).behavior === 'sleeping' ? 'sleep_touch' : 'touch');
    s.lastCareElapsedMs = s.elapsedMs;
  }
  if (s.snackPending && !s.meal) {
    // This is a receipt of a successful authorized snack, not a new food offer.
    // Preserve any normal meal already in progress, then eat this receipt once.
    s.meal = { id: `snack:${s.elapsedMs}:${s.revision}`, kind: 'snack', startedElapsedMs: s.elapsedMs, x: 200, y: 200 };
    s.snackPending = false; s.mealDeferredUntil = 0;
  }
  if (delta > 0 || events.length || s.snackPending !== before.snackPending || s.lastSnackReceiptId !== before.lastSnackReceiptId || s.meal !== before.meal || s.pendingSleepMs !== before.pendingSleepMs || s.mealDeferredUntil !== before.mealDeferredUntil) s.revision++;
  validateBabyLife(s);
  return { state: s, events };
}

export type BabyPresentation = BabyView & { social: import('./baby-social').BabySocialView;
  position: BabyPosition; reunion?: boolean; dragging?: boolean; attentionAct?: 'bottom' | 'cursor' | null };

export interface BabyArea { x: number; y: number; width: number; height: number }
/** The painted shell (80% of the hit box), anchored at its bottom centre. */
export function babyBodyInset(level: 0 | 1 | 2 = 0) {
  const scale = 1 + level / 10;
  return { x: (104 - 83.2 * scale) / 2, y: 92 - 73.6 * scale,
    width: 83.2 * scale, height: 73.6 * scale };
}
/** Keep the transparent window on screen while letting the painted body reach all four edges. */
export function layoutBabyAt(anchor: BabyPosition, area: BabyArea, level: 0 | 1 | 2 = 0) {
  const body = babyBodyInset(level);
  const visible = { x: Math.max(area.x, Math.min(area.x + area.width - body.width, anchor.x)),
    y: Math.max(area.y, Math.min(area.y + area.height - body.height, anchor.y)) };
  const window = { x: Math.round(Math.max(area.x, Math.min(area.x + area.width - BABY_STAGE.width,
    visible.x - (BABY_STAGE.width - body.width) / 2))),
    y: Math.round(Math.max(area.y, Math.min(area.y + area.height - BABY_STAGE.height,
      visible.y - (BABY_STAGE.height - body.height) / 2))) };
  return { window, position: { x: visible.x - window.x - body.x, y: visible.y - window.y - body.y }, visible };
}
/** Explicit levels/intervals are provided externally; time never escalates them. */
export class BabyAttentionMotion {
  private startedAt: number | null = null;
  private until = 0;
  private strong = false;
  step(now: number, attention: BabyAttention, suppressed: boolean): boolean {
    if (attention.level !== 2) { this.strong = false; this.until = 0; this.startedAt = null; return false; }
    if (!this.strong) { this.strong = true; this.startedAt = null; }
    if (suppressed) { this.until = 0; this.startedAt = now; return false; }
    if (this.until > now) return true;
    if (this.startedAt === null || now >= this.startedAt + attention.intervalSeconds * 1000) { this.until = now + 5000; this.startedAt = now; return true; }
    return false;
  }
}
