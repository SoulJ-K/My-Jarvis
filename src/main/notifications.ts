import { Notification } from 'electron';
import type { NotifyTimer } from '../assistant/timer';

export function timerNotifications(onFailure?: (message: string) => void): { notify: NotifyTimer; dispose(): void } {
  const active = new Map<Notification, ReturnType<typeof setTimeout>>();
  return {
    notify(report) {
      if (!Notification.isSupported()) { report('unsupported'); return; }
      const notification = new Notification({ title: 'Jarvis Pet · 앱 안내', body: '5분 타이머가 끝났습니다.', silent: false });
      const release = () => { clearTimeout(active.get(notification)); active.delete(notification); };
      notification.once('show', () => { report('shown'); });
      notification.once('failed', (_event, error) => { onFailure?.(error); report('failed'); release(); });
      notification.once('close', release);
      const timeout = setTimeout(() => { report('unknown'); release(); }, 5000);
      notification.once('show', () => clearTimeout(timeout));
      active.set(notification, timeout);
      try { notification.show(); } catch { release(); report('failed'); }
    },
    dispose() { for (const [notification, timeout] of active) { clearTimeout(timeout); notification.removeAllListeners(); notification.close(); } active.clear(); },
  };
}
