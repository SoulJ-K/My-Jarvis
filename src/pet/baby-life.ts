/** Temporary tuning for the basic-life prototype, not hatch/growth requirements. */
export const BABY_TIMING = Object.freeze({ hungry: 30 * 60_000, foodEvery: 10 * 60_000,
  foodVisible: 90_000, awake: 45 * 60_000, drowsy: 5 * 60_000, sleep: 15 * 60_000,
  // Old saved meals have no approachMs and retain their original timing.
  approach: 1200, meal: 5000, approachMin: 8000, approachMax: 20_000, chew: 5500,
  careCooldown: 30_000 });
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
  // The food's near edge meets the right side of the mouth, not the eye.
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
  meal: { id: string; startedElapsedMs: number; x: number; y: number; approachMs?: number } | null;
}
export interface BabyExperience { kind: 'food_offered' | 'meal_finished' | 'sleep_completed' | 'touch' | 'sleep_touch'; atMs: number; durationMs?: number }
export type BabyCommand = { type: 'tick' } | { type: 'touch' } |
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
      s.meal.approachMs !== undefined && !validApproachMs(s.meal.approachMs)))) throw new Error('BABY_STATE_INVALID');
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
function mealTiming(meal: NonNullable<BabyLife['meal']>) {
  const approachMs = meal.approachMs ?? BABY_TIMING.approach;
  return { approachMs, chewMs: meal.approachMs === undefined ? BABY_TIMING.meal - BABY_TIMING.approach : BABY_TIMING.chew };
}
export function babyView(s: BabyLife) {
  const phase = s.elapsedMs % cycle;
  const dayPeriod = babyDayPeriod(s.observedAtMs);
  const behavior: 'approaching' | 'eating' | 'sleeping' | 'drowsy' | 'resting' = s.meal ? (s.elapsedMs - s.meal.startedElapsedMs < mealTiming(s.meal).approachMs ? 'approaching' : 'eating') :
    phase >= BABY_TIMING.awake ? 'sleeping' : dayPeriod === 'late-night' || phase >= BABY_TIMING.awake - BABY_TIMING.drowsy ? 'drowsy' : 'resting';
  const food = !s.meal && behavior !== 'sleeping' && s.hungerMs >= BABY_TIMING.hungry &&
    (s.elapsedMs - BABY_TIMING.hungry) % BABY_TIMING.foodEvery < BABY_TIMING.foodVisible;
  return { revision: s.revision, behavior, dayPeriod, offerId: food ? `food:${Math.floor(s.elapsedMs / BABY_TIMING.foodEvery)}` : null,
    meal: s.meal ? { id: s.meal.id, ...reachableFoodPoint(s.meal.x, s.meal.y),
      progressMs: s.elapsedMs - s.meal.startedElapsedMs, ...mealTiming(s.meal) } : null };
}
export type BabyView = ReturnType<typeof babyView>;
export function advanceBabyLife(before: BabyLife, now: number, command: BabyCommand) {
  validateBabyLife(before);
  if (!Number.isSafeInteger(now) || now < 0) throw new Error('BABY_CLOCK_INVALID');
  const delta = Math.max(0, now - before.observedAtMs);
  const s: BabyLife = { ...before, observedAtMs: Math.max(now, before.observedAtMs),
    elapsedMs: before.elapsedMs + delta, hungerMs: Math.min(BABY_TIMING.hungry, before.hungerMs + delta) };
  const events: BabyExperience[] = [];
  const add = (kind: BabyExperience['kind'], durationMs?: number) => events.push({ kind, atMs: s.observedAtMs, ...(durationMs === undefined ? {} : { durationMs }) });
  if (s.meal && s.elapsedMs - s.meal.startedElapsedMs >= mealTiming(s.meal).approachMs + mealTiming(s.meal).chewMs) {
    const mealMs = mealTiming(s.meal).approachMs + mealTiming(s.meal).chewMs;
    s.hungerMs = Math.min(BABY_TIMING.hungry, s.elapsedMs - s.meal.startedElapsedMs - mealMs);
    s.meal = null; add('meal_finished');
  }
  // A completion summary, not a start/end pair. One row covers any number of
  // completed rest cycles across absence; no simulated touch/meal history.
  const sleeps = Math.floor(s.elapsedMs / cycle) - Math.floor(before.elapsedMs / cycle);
  if (sleeps > 0) add('sleep_completed', sleeps * BABY_TIMING.sleep);
  if (command.type === 'feed') {
    const view = babyView(s);
    if (!validFoodPoint(command.x, command.y)) throw new Error('BABY_DROP_INVALID');
    if (!validApproachMs(command.approachMs)) throw new Error('BABY_APPROACH_INVALID');
    if (view.offerId !== null && command.offerId === view.offerId) {
      s.meal = { id: command.offerId, startedElapsedMs: s.elapsedMs,
        ...reachableFoodPoint(command.x, command.y), approachMs: command.approachMs };
      add('food_offered');
    }
  } else if (command.type === 'touch' && (s.lastCareElapsedMs === null || s.elapsedMs - s.lastCareElapsedMs >= BABY_TIMING.careCooldown)) {
    add(babyView(s).behavior === 'sleeping' ? 'sleep_touch' : 'touch');
    s.lastCareElapsedMs = s.elapsedMs;
  }
  if (delta > 0 || events.length) s.revision++;
  validateBabyLife(s);
  return { state: s, events };
}

export type BabyPresentation = BabyView & { social: import('./baby-social').BabySocialView;
  position: BabyPosition; reunion?: boolean };
