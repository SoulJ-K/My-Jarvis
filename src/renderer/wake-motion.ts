/** One visible sleep-to-awake transition per renderer document. No life state is stored here. */
class BabyWakeMotion {
  private previousBehavior: string | null = null;
  private timer: number | undefined;
  private readonly reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)');
  private readonly onMotionPreference = () => {
    if (this.reducedMotion.matches) this.finish();
  };

  constructor(private readonly onFinish: () => void) {
    this.reducedMotion.addEventListener('change', this.onMotionPreference);
  }

  get active() { return this.timer !== undefined; }

  observe(behavior: string): boolean {
    const wasSleeping = this.previousBehavior === 'sleeping';
    this.previousBehavior = behavior;
    if (behavior === 'sleeping') {
      this.cancel();
      return false;
    }
    // The first state after a fresh launch or page reload has no predecessor.
    if (!this.active && wasSleeping && !this.reducedMotion.matches) {
      this.timer = window.setTimeout(() => this.finish(), 1260);
    }
    return this.active;
  }

  private cancel() {
    if (this.timer !== undefined) window.clearTimeout(this.timer);
    this.timer = undefined;
  }

  private finish() {
    if (!this.active) return;
    this.cancel();
    this.onFinish();
  }

  dispose() {
    this.cancel();
    this.reducedMotion.removeEventListener('change', this.onMotionPreference);
  }
}
