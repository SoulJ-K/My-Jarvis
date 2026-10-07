(function (root) {
  'use strict';
  // A small dead zone prevents pointer jitter from repeatedly flipping the face.
  // One timer per fixture; old callbacks can never override a new drag or sleep.
  class Facing {
    constructor(onChange, options = {}) {
      this.onChange = onChange;
      this.schedule = options.schedule || ((fn, delay) => setTimeout(fn, delay));
      this.unschedule = options.unschedule || (timer => clearTimeout(timer));
      this.reduced = options.reduced || (() => false);
      this.idleLooks = options.idleLooks || (() => false);
      this.canAnticipate = options.canAnticipate || (() => true);
      this.direction = 'front'; this.sleeping = false; this.timer = null;
      this.phase = 'body'; this.activity = 'rest'; this.dragging = false;
      this.lookSide = 'left'; this.focusDx = 0;
      this.delta = 0; this.generation = 0;
    }
    cancel() {
      this.generation++;
      if (this.timer !== null) this.unschedule(this.timer);
      this.timer = null; this.delta = 0;
    }
    show(direction, phase = 'body') {
      if (this.direction !== direction || this.phase !== phase) {
        this.direction = direction; this.phase = phase; this.onChange(direction);
      }
    }
    later(fn, delay) {
      const generation = this.generation;
      this.timer = this.schedule(() => {
        if (generation !== this.generation) return;
        this.timer = null; fn();
      }, delay);
    }
    turn(direction, ready = () => {}) {
      if (direction === 'front' || this.reduced() || !this.canAnticipate() ||
          (this.direction === direction && this.phase === 'body')) {
        this.show(direction); ready(); return;
      }
      this.show(direction, 'head');
      this.later(() => { this.show(direction); ready(); }, 180);
    }
    rest() {
      if (this.sleeping || this.dragging) return;
      this.cancel(); this.activity = 'rest'; this.show('front'); this.planLook();
    }
    planLook() {
      if (!this.idleLooks() || this.reduced() || this.sleeping || this.dragging || this.activity !== 'rest') return;
      this.later(() => {
        const side = this.lookSide; this.lookSide = side === 'left' ? 'right' : 'left';
        this.show(side, this.canAnticipate() ? 'head' : 'body');
        this.later(() => { this.show('front'); this.planLook(); }, 850);
      }, 12000);
    }
    focus(kind, dx) {
      if (this.sleeping || this.dragging || !['food', 'orb'].includes(kind) || !Number.isFinite(dx)) return false;
      this.cancel(); this.activity = kind; this.focusDx = dx;
      const side = Math.abs(dx) < 8 ? this.direction : dx < 0 ? 'left' : 'right';
      this.turn(side); return true;
    }
    travel(dx, ready) {
      if (this.sleeping || this.dragging || !Number.isFinite(dx) || ['food', 'orb'].includes(this.activity)) return false;
      this.cancel(); this.activity = 'travel';
      this.turn(Math.abs(dx) < 4 ? this.direction : dx < 0 ? 'left' : 'right', ready);
      return true;
    }
    select(direction) {
      if (!['front', 'left', 'right'].includes(direction) || this.sleeping) return;
      this.cancel(); this.activity = 'manual'; this.show(direction);
    }
    pose(sleeping) {
      this.cancel(); this.sleeping = sleeping; this.activity = sleeping ? 'sleep' : 'rest'; this.dragging = false;
      this.show(sleeping ? 'right' : 'front');
      if (!sleeping) this.planLook();
    }
    begin() { this.cancel(); this.dragging = true; }
    move(dx) {
      if (this.sleeping || !Number.isFinite(dx)) return;
      // Opposite motion must accumulate again instead of inheriting previous travel.
      if (Math.sign(dx) !== Math.sign(this.delta)) this.delta = 0;
      this.delta += dx;
      if (Math.abs(this.delta) >= 4) {
        this.show(this.delta < 0 ? 'left' : 'right'); this.delta = 0;
      }
    }
    stop() {
      this.cancel(); this.dragging = false;
      if (this.sleeping) return;
      if (['food', 'orb'].includes(this.activity)) { this.focus(this.activity, this.focusDx); return; }
      this.activity = 'rest';
      if (this.reduced() || this.direction === 'front') { this.rest(); return; }
      this.later(() => this.rest(), 250);
    }
    dispose() { this.cancel(); }
  }
  if (typeof module !== 'undefined' && module.exports) module.exports = Facing;
  else root.AppearanceFacing = Facing;
})(globalThis);
