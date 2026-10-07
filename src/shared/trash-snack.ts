/** Public values contain display names and operation IDs, never file paths. */
export interface TrashSnackCapabilities {
  available: boolean;
  exactTrashOrder: boolean;
  conditionalDelete: boolean;
  dockDrop: boolean;
  selectionMode?: 'oldest-first' | 'user-selected';
  deletionSafety?: 'conditional' | 'staged-revalidation';
  message: string;
}

export interface TrashSnackCandidate { id: string; name: string }
export type TrashSnackProblem = 'unsupported' | 'busy' | 'cannot-eat' | 'untrusted-order'
  | 'unsafe-target' | 'empty' | 'read-failed' | 'invalid-confirmation' | 'expired' | 'changed' | 'invalid-selection';
export interface TrashSnackFailure { status: 'blocked'; reason: TrashSnackProblem }
export type TrashSnackPreparation = TrashSnackFailure | {
  status: 'confirmation-required';
  operationId: string;
  candidates: TrashSnackCandidate[];
  warning: string;
};

export type TrashSnackDeleteStatus = 'deleted' | 'changed' | 'failed' | 'unknown' | 'not-attempted';
export interface TrashSnackItemResult extends TrashSnackCandidate { status: TrashSnackDeleteStatus }
export type TrashSnackExecution = TrashSnackFailure | {
  status: 'completed' | 'partial' | 'failed' | 'unknown';
  operationId: string;
  items: TrashSnackItemResult[];
  /** True only after every confirmed item was actually deleted. Animation is still pending. */
  mealReady: boolean;
};
export type TrashSnackMealResult = 'recorded' | 'not-ready' | 'unknown';

/** Picker displays names only; opaque IDs are mapped to paths exclusively in main. */
export interface TrashSnackPickerAPI {
  read(): Promise<TrashSnackCandidate[]>;
  choose(ids:string[]): Promise<void>;
  cancel(): Promise<void>;
}
