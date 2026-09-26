/** Identity-only view. Egg life and actual care events are persisted separately. */
export interface EggSnapshot {
  readonly petId: string;
  readonly createdAt: string;
  readonly stage: 'egg';
}
