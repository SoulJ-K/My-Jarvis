/** Temporary presentation state, separate from saved identity, emotion, and relationship. */
export interface EggSnapshot {
  behavior: 'idle' | 'reacting';
  revision: number;
}
