/** The only persisted state implemented at this stage. No simulated experiences. */
export interface EggSnapshot {
  readonly petId: string;
  readonly createdAt: string;
  readonly stage: 'egg';
}
