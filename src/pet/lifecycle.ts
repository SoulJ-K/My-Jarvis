/** No clock, AI, renderer or storage dependency. A checkpoint means a witnessed,
 * completed scene; merely starting a scene must never advance this record. */
export const hatchScenes = ['prelude', 'crack', 'orb', 'shell', 'baby', 'contact'] as const;
export type HatchScene = typeof hatchScenes[number];
export interface Lifecycle {
  readonly petId: string;
  readonly ready: boolean;
  readonly completed: HatchScene | null;
  readonly stage: 'egg' | 'baby';
  readonly orbId: string | null;
  readonly name: string | null;
  readonly revision: number;
}
export interface NamePolicy { readonly trim: boolean; readonly maxCodePoints: number }
export type LifecycleCommand =
  | { type: 'prepare' }
  | { type: 'witness'; scene: HatchScene }
  | { type: 'name'; name: string };

export function initialLifecycle(petId: string): Lifecycle {
  return { petId, ready: false, completed: null, stage: 'egg', orbId: null, name: null, revision: 0 };
}
export function nextHatchStep(state: Lifecycle): 'egg' | HatchScene | 'naming' | 'life' {
  if (!state.ready) return 'egg';
  if (state.name !== null) return 'life';
  return hatchScenes[state.completed === null ? 0 : hatchScenes.indexOf(state.completed) + 1] ?? 'naming';
}
export function normalizePetName(input: unknown, policy: NamePolicy): string {
  if (!Number.isSafeInteger(policy.maxCodePoints) || policy.maxCodePoints < 1 || typeof policy.trim !== 'boolean') {
    throw new Error('INVALID_NAME_POLICY');
  }
  if (typeof input !== 'string') throw new Error('INVALID_NAME');
  const name = policy.trim ? input.trim() : input;
  if (!name.trim() || [...name].length > policy.maxCodePoints || /[\u0000-\u001f\u007f-\u009f]/u.test(name)) {
    throw new Error('INVALID_NAME');
  }
  return name;
}
export function advanceLifecycle(state: Lifecycle, command: LifecycleCommand, policy: NamePolicy): Lifecycle {
  if (command.type === 'prepare') {
    if (state.ready) return state;
    return { ...state, ready: true, revision: state.revision + 1 };
  }
  if (command.type === 'witness') {
    if (!hatchScenes.includes(command.scene) || nextHatchStep(state) !== command.scene) throw new Error('INVALID_HATCH_ORDER');
    return { ...state, completed: command.scene,
      stage: command.scene === 'baby' || command.scene === 'contact' ? 'baby' : state.stage,
      orbId: command.scene === 'orb' ? `${state.petId}:orb` : state.orbId,
      revision: state.revision + 1 };
  }
  if (command.type !== 'name' || nextHatchStep(state) !== 'naming') throw new Error('INVALID_HATCH_ORDER');
  return { ...state, name: normalizePetName(command.name, policy), revision: state.revision + 1 };
}

/** Persisted values are validated as a reachable state, including derived identity. */
export function validateLifecycle(state: Lifecycle, petId: string, policy: NamePolicy): void {
  const index = state.completed === null ? -1 : hatchScenes.indexOf(state.completed);
  if (state.petId !== petId || typeof state.ready !== 'boolean' || index < -1 ||
      (state.completed !== null && index === -1) ||
      state.stage !== (index >= 4 ? 'baby' : 'egg') ||
      state.orbId !== (index >= 2 ? `${petId}:orb` : null) ||
      (!state.ready && (state.completed !== null || state.name !== null)) ||
      (state.name !== null && (index !== 5 || normalizePetName(state.name, policy) !== state.name)) ||
      state.revision !== (state.ready ? 1 : 0) + index + 1 + (state.name !== null ? 1 : 0)) {
    throw new Error('INVALID_LIFECYCLE');
  }
}
