export interface Point { x: number; y: number }
/** Screen coordinates in DIP, supplied by main; no renderer coordinates are trusted. */
export class EggGesture {
  moved = false;
  stroking = false;
  private lastPoint: Point;
  private axis: Point | undefined;
  private furthest = 0;
  private travel = 0;
  private reversed = false;
  constructor(readonly cursor: Point, readonly origin: Point, private startedAt: number,
    private allowStroke = true) {
    this.lastPoint = cursor;
  }
  arm(now: number): boolean {
    if (this.allowStroke && !this.moved && now - this.startedAt >= 350) this.stroking = true;
    return this.stroking;
  }
  move(cursor: Point, now: number): void {
    this.arm(now);
    if (Math.hypot(cursor.x - this.cursor.x, cursor.y - this.cursor.y) >= 6) this.moved = true;
    if (!this.stroking) return;
    const dx = cursor.x - this.lastPoint.x;
    const dy = cursor.y - this.lastPoint.y;
    const distance = Math.hypot(dx, dy);
    // Ignore tiny pointer jitter; use the first intentional stroke as its axis.
    if (distance < 6) return;
    if (!this.axis) this.axis = { x: dx / distance, y: dy / distance };
    const projection = (cursor.x - this.cursor.x) * this.axis.x +
      (cursor.y - this.cursor.y) * this.axis.y;
    this.furthest = Math.max(this.furthest, projection);
    if (this.furthest - projection >= 6) this.reversed = true;
    this.travel += distance;
    this.lastPoint = cursor;
  }
  finish(): 'touch' | 'stroke' | undefined {
    if (this.stroking) return this.reversed && this.travel >= 18 ? 'stroke' : undefined;
    return this.moved ? undefined : 'touch';
  }
}
