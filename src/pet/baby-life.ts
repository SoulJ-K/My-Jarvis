/** Temporary tuning for the basic-life prototype, not hatch/growth requirements. */
export const BABY_TIMING = Object.freeze({ hungry: 30 * 60_000, foodEvery: 10 * 60_000,
  foodVisible: 90_000, awake: 45 * 60_000, drowsy: 5 * 60_000, sleep: 15 * 60_000,
  approach: 1200, meal: 5000, careCooldown: 30_000 });
export interface BabyLife {
  revision: number; observedAtMs: number; elapsedMs: number; hungerMs: number;
  lastCareElapsedMs: number | null;
  meal: { id: string; startedElapsedMs: number; x: number; y: number } | null;
}
export interface BabyExperience { kind: 'food_offered' | 'meal_finished' | 'sleep_completed' | 'touch' | 'sleep_touch'; atMs: number; durationMs?: number }
export type BabyCommand = { type: 'tick' } | { type: 'touch' } | { type: 'feed'; offerId: string; x: number; y: number };
export const cycle = BABY_TIMING.awake + BABY_TIMING.sleep;
export function initialBabyLife(now: number): BabyLife {
  return { revision: 0, observedAtMs: now, elapsedMs: 0, hungerMs: 0, lastCareElapsedMs: null, meal: null };
}
export function validateBabyLife(s: BabyLife): void {
  const integer = (n: unknown) => Number.isSafeInteger(n) && Number(n) >= 0;
  if (!s || ![s.revision, s.observedAtMs, s.elapsedMs, s.hungerMs].every(integer) ||
    s.hungerMs > BABY_TIMING.hungry || (s.lastCareElapsedMs !== null && (!integer(s.lastCareElapsedMs) || s.lastCareElapsedMs > s.elapsedMs)) ||
    (s.meal !== null && (!s.meal || typeof s.meal.id !== 'string' || !integer(s.meal.startedElapsedMs) ||
      s.meal.startedElapsedMs > s.elapsedMs || !validFoodPoint(s.meal.x, s.meal.y)))) throw new Error('BABY_STATE_INVALID');
}
// Coordinates are local logical pixels within the existing 180×200 pet window.
export function validFoodPoint(x: unknown, y: unknown): boolean {
  return typeof x === 'number' && typeof y === 'number' && Number.isFinite(x) && Number.isFinite(y) &&
    x >= 20 && x <= 160 && y >= 72 && y <= 162 && Math.hypot(x - 90, y - 125) <= 66;
}
export function babyView(s: BabyLife) {
  const phase = s.elapsedMs % cycle;
  const behavior: 'approaching' | 'eating' | 'sleeping' | 'drowsy' | 'resting' = s.meal ? (s.elapsedMs - s.meal.startedElapsedMs < BABY_TIMING.approach ? 'approaching' : 'eating') :
    phase >= BABY_TIMING.awake ? 'sleeping' : phase >= BABY_TIMING.awake - BABY_TIMING.drowsy ? 'drowsy' : 'resting';
  const food = !s.meal && behavior !== 'sleeping' && s.hungerMs >= BABY_TIMING.hungry &&
    (s.elapsedMs - BABY_TIMING.hungry) % BABY_TIMING.foodEvery < BABY_TIMING.foodVisible;
  return { revision: s.revision, behavior, offerId: food ? `food:${Math.floor(s.elapsedMs / BABY_TIMING.foodEvery)}` : null,
    meal: s.meal ? { x: s.meal.x, y: s.meal.y } : null };
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
  if (s.meal && s.elapsedMs - s.meal.startedElapsedMs >= BABY_TIMING.meal) {
    s.hungerMs = Math.min(BABY_TIMING.hungry, s.elapsedMs - s.meal.startedElapsedMs - BABY_TIMING.meal);
    s.meal = null; add('meal_finished');
  }
  // A completion summary, not a start/end pair. One row covers any number of
  // completed rest cycles across absence; no simulated touch/meal history.
  const sleeps = Math.floor(s.elapsedMs / cycle) - Math.floor(before.elapsedMs / cycle);
  if (sleeps > 0) add('sleep_completed', sleeps * BABY_TIMING.sleep);
  if (command.type === 'feed') {
    const view = babyView(s);
    if (!validFoodPoint(command.x, command.y)) throw new Error('BABY_DROP_INVALID');
    if (view.offerId !== null && command.offerId === view.offerId) {
      s.meal = { id: command.offerId, startedElapsedMs: s.elapsedMs, x: command.x, y: command.y };
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

export type BabyPresentation = BabyView & { social: import('./baby-social').BabySocialView };
