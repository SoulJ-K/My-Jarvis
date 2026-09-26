import type { EggSnapshot } from '../shared/pet-state';

export const EGG_REACTION_MS = 480;

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

  touch(): void {
    // Finish the current reaction rather than queueing or extending repeated clicks.
    if (this.disposed || this.state.behavior === 'reacting') return;
    this.state = { behavior: 'reacting', revision: this.state.revision + 1 };
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
