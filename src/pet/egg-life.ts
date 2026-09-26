/** Plain values only: callers supply time and persist the returned result. */
export type EggCareKind = 'touch' | 'stroke';
export interface EggLife {
  elapsedMs: number;
  observedAtMs: number;
}
export interface EggCareEvent {
  kind: EggCareKind;
  occurredAtMs: number;
  elapsedMs: number;
}
export function advanceEggLife(life: EggLife, now: number): EggLife {
  if (!Number.isSafeInteger(now) || now < 0) throw new Error('INVALID_TIME');
  const observedAtMs = Math.max(life.observedAtMs, now);
  const elapsedMs = life.elapsedMs + observedAtMs - life.observedAtMs;
  if (!Number.isSafeInteger(elapsedMs)) throw new Error('INVALID_TIME');
  return { elapsedMs, observedAtMs };
}
export function careForEgg(life: EggLife, kind: EggCareKind, now: number) {
  const next = advanceEggLife(life, now);
  return { life: next, event: { kind, occurredAtMs: now, elapsedMs: next.elapsedMs } };
}
