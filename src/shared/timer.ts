export type SystemDelivery = 'not-requested' | 'requested' | 'shown' | 'failed' | 'unsupported' | 'unknown';
export interface TimerRecord {
  id: string;
  startedAt: number;
  dueAt: number;
  durationMs: number;
  status: 'pending' | 'due' | 'cancelled' | 'acknowledged';
  reason: 'on-time' | 'late' | 'recovered' | null;
  systemDelivery: SystemDelivery;
  appDisplayed: boolean;
}
export interface TimerView extends TimerRecord { remainingMs: number }
export interface TimerReply { ok: boolean; message: string; timers: TimerView[] }
