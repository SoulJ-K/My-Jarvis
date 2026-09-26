export interface Point { x: number; y: number }
/** Screen coordinates in DIP, supplied by main; no renderer coordinates are trusted. */
export class EggGesture {
  moved = false;
  stroking = false;
  private lastX: number;
  private direction = 0;
  private travel = 0;
  private reversed = false;
  private outside = false;
  constructor(readonly cursor: Point, readonly origin: Point, private startedAt: number,
    private allowStroke = true) {
    this.lastX = cursor.x;
  }
  arm(now: number): boolean {
    if (this.allowStroke && !this.moved && now - this.startedAt >= 350) this.stroking = true;
    return this.stroking;
  }
  move(cursor: Point, now: number): void {
    this.arm(now);
    if (Math.hypot(cursor.x - this.cursor.x, cursor.y - this.cursor.y) >= 6) this.moved = true;
    if (!this.stroking) return;
    if (Math.hypot(cursor.x - this.cursor.x, cursor.y - this.cursor.y) > 72) this.outside = true;
    const dx = cursor.x - this.lastX;
    // Ignore small jitter; a real reversal needs at least 6 DIP in the other direction.
    if (Math.abs(dx) < 6) return;
    const direction = Math.sign(dx);
    if (this.direction && direction !== this.direction) this.reversed = true;
    this.direction = direction;
    this.travel += Math.abs(dx);
    this.lastX = cursor.x;
  }
  finish(): 'touch' | 'stroke' | undefined {
    if (this.stroking) return !this.outside && this.reversed && this.travel >= 24 ? 'stroke' : undefined;
    return this.moved ? undefined : 'touch';
  }
}
