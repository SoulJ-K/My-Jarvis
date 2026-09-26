import type { EggSnapshot } from '../shared/pet-state';

export const EGG_REACTION_MS = 480;

/** Transient greeting only; never invents a user greeting, bond, or stored experience. */
export const BABY_RETURN_TIMING = Object.freeze({ absence: 30 * 60_000, reaction: 4000 });
export class BabyReturnBrain {
  private lastObserved: number | null;
  private absentSince: number | null = null;
  private reactionUntil = 0;
  constructor(lastObserved: number | null) { this.lastObserved = lastObserved; }

  observe(now: number, visible: boolean, idleMs = 0): boolean {
    if (!Number.isSafeInteger(now) || now < 0 || !Number.isFinite(idleMs) || idleMs < 0) throw new Error('RETURN_CLOCK_INVALID');
    // Match life accounting: backwards clock changes cannot replay a return.
    const at = Math.max(now, this.lastObserved ?? now);
    if (this.lastObserved !== null && at - this.lastObserved >= BABY_RETURN_TIMING.absence && this.absentSince === null) this.absentSince = this.lastObserved;
    const present = visible && idleMs < BABY_RETURN_TIMING.absence;
    if (!present) {
      const since = Math.max(0, at - idleMs);
      this.absentSince = Math.min(this.absentSince ?? since, since);
      this.reactionUntil = 0;
    } else if (this.absentSince !== null) {
      if (at - this.absentSince >= BABY_RETURN_TIMING.absence) this.reactionUntil = at + BABY_RETURN_TIMING.reaction;
      this.absentSince = null;
    }
    this.lastObserved = at;
    return present && at < this.reactionUntil;
  }
}

/** The caller supplies time; this module has no Electron, DOM, storage, or AI dependency. */
export interface BrainClock {
  after(milliseconds: number, callback: () => void): () => void;
}

export class EggBrain {
  private state: EggSnapshot = { behavior: 'idle', revision: 0 };
  private cancelReaction?: () => void;
  private disposed = false;

  constructor(private clock: BrainClock, private publish: (state: EggSnapshot) => void) {}

  snapshot(): EggSnapshot {
    return { ...this.state };
  }

  touch(kind: 'touch' | 'stroke' = 'touch'): void {
    // Finish the current reaction rather than queueing or extending repeated clicks.
    if (this.disposed || this.state.behavior !== 'idle') return;
    this.state = { behavior: kind === 'stroke' ? 'soothed' : 'reacting', revision: this.state.revision + 1 };
    this.cancelReaction = this.clock.after(EGG_REACTION_MS, () => {
      this.cancelReaction = undefined;
      if (this.disposed) return;
      this.state = { behavior: 'idle', revision: this.state.revision + 1 };
      this.publish(this.snapshot());
    });
    this.publish(this.snapshot());
  }

  dispose(): void {
    this.disposed = true;
    this.cancelReaction?.();
    this.cancelReaction = undefined;
  }
}
