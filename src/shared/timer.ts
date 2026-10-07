export type SystemDelivery = 'not-requested' | 'requested' | 'shown' | 'failed' | 'unsupported' | 'unknown';
export type TimerMenu = 'default' | 'pinned' | 'hidden';
export interface TimerOptions { title?: string; menu?: TimerMenu; replacePinnedId?: string }
export interface TimerRecord {
  id: string;
  startedAt: number;
  dueAt: number;
  durationMs: number;
  status: 'pending' | 'paused' | 'due' | 'cancelled' | 'acknowledged';
  reason: 'on-time' | 'late' | 'recovered' | null;
  systemDelivery: SystemDelivery;
  appDisplayed: boolean;
  title: string;
  menu: TimerMenu;
  autoExcluded: boolean;
  pausedRemainingMs: number | null;
  restartOf: string | null;
}
export interface TimerView extends TimerRecord { remainingMs: number }
export interface TimerReply { ok: boolean; message: string; timers: TimerView[]; pinConflictId?: string }

export function selectMenuTimer(timers: readonly TimerView[]): TimerView | undefined {
  const active = timers.filter(t => t.status === 'pending' || t.status === 'paused');
  const compare = (a: TimerView, b: TimerView) => a.remainingMs - b.remainingMs || a.startedAt - b.startedAt || a.id.localeCompare(b.id);
  return active.filter(t => t.menu === 'pinned').sort(compare)[0] ??
    active.filter(t => t.status === 'pending' && t.menu === 'default' && !t.autoExcluded && t.remainingMs <= 180000).sort(compare)[0];
}
export function formatTimerRemaining(ms: number): string {
  const seconds = Math.max(0, Math.ceil(Number.isFinite(ms) ? ms / 1000 : 0));
  const pad = (n: number) => String(n).padStart(2, '0');
  return seconds >= 3600 ? `${pad(Math.floor(seconds / 3600))}:${pad(Math.floor(seconds / 60) % 60)}:${pad(seconds % 60)}` :
    `${pad(Math.floor(seconds / 60))}:${pad(seconds % 60)}`;
}
export function formatMenuTimer(timer: TimerView, maxTitleLength = 16): string {
  const title = Array.from(timer.title || '타이머');
  const limit = Math.max(1, Math.trunc(maxTitleLength));
  const label = title.length > limit ? `${title.slice(0, limit).join('')}…` : title.join('');
  return `${label} ${timer.status === 'paused' ? '⏸ ' : ''}${formatTimerRemaining(timer.remainingMs)}`;
}
