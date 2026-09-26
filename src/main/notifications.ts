import { Notification, type NotificationConstructorOptions } from 'electron';
import type { NotifyTimer } from '../assistant/timer';
import type { SystemDelivery } from '../shared/timer';

// Kept at the main-process boundary; tests supply a platform double without
// asking macOS for notification permission or changing the user's settings.
type NotificationBackend = {
  isSupported(): boolean;
  create(options: NotificationConstructorOptions): Pick<Notification, 'once' | 'removeAllListeners' | 'show' | 'close'>;
};

export function timerNotifications(onFailure?: (message: string) => void, options: {
  backend?: NotificationBackend;
  outcomeTimeoutMs?: number;
} = {}): { notify: NotifyTimer; dispose(): void } {
  const backend = options.backend ?? { isSupported: () => Notification.isSupported(), create: values => new Notification(values) };
  const active = new Set<() => void>();
  let disposed = false;
  return {
    notify(report) {
      if (disposed) return;
      let notification: ReturnType<NotificationBackend['create']>;
      try {
        if (!backend.isSupported()) { report('unsupported'); return; }
        notification = backend.create({ title: 'Jarvis Pet · 앱 안내', body: '5분 타이머가 끝났습니다.', silent: false });
      } catch { report('failed'); return; }
      let settled = false;
      const settle = (result: SystemDelivery) => {
        if (settled || disposed) return;
        settled = true;
        clearTimeout(timeout);
        report(result);
      };
      const release = () => {
        clearTimeout(timeout);
        notification.removeAllListeners();
        active.delete(cancel);
      };
      const cancel = () => { release(); notification.close(); };
      const timeout = setTimeout(() => {
        // Stop owning unresolved native objects; late events cannot rewrite a
        // persisted unknown outcome or run after TimerService has been disposed.
        try { settle('unknown'); } finally { cancel(); }
      }, options.outcomeTimeoutMs ?? 5000);
      notification.once('show', () => settle('shown'));
      notification.once('failed', (_event, error) => {
        try { settle('failed'); onFailure?.(error); } finally { release(); }
      });
      notification.once('close', () => { try { settle('unknown'); } finally { release(); } });
      active.add(cancel);
      try { notification.show(); } catch { try { settle('failed'); } finally { release(); } }
    },
    dispose() { disposed = true; for (const cancel of active) cancel(); },
  };
}
