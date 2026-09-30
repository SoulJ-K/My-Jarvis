import { Notification, type NotificationConstructorOptions } from 'electron';
import type { NotifyTimer } from '../assistant/timer';
import type { NotifySchedule } from '../assistant/reminders';
import type { ScheduleRecord } from '../shared/schedule';
import type { SystemDelivery } from '../shared/timer';

// Kept at the main-process boundary; tests supply a platform double without
// asking macOS for notification permission or changing the user's settings.
type NotificationBackend = {
  isSupported(): boolean;
  create(options: NotificationConstructorOptions): Pick<Notification, 'once' | 'removeAllListeners' | 'show' | 'close'>;
};

type NotificationOptions = {
  backend?: NotificationBackend;
  outcomeTimeoutMs?: number;
};

function notificationQueue<T>(message: (item: T) => NotificationConstructorOptions,
  onFailure?: (message: string) => void, options: NotificationOptions = {}) {
  const backend = options.backend ?? { isSupported: () => Notification.isSupported(), create: values => new Notification(values) };
  const active = new Set<() => void>();
  let disposed = false;
  return {
    notify(item: T, report: (state: SystemDelivery) => void) {
      if (disposed) return;
      let notification: ReturnType<NotificationBackend['create']>;
      try {
        if (!backend.isSupported()) { report('unsupported'); return; }
        notification = backend.create(message(item));
      } catch { report('failed'); return; }
      let outcome: SystemDelivery | undefined;
      const settle = (result: SystemDelivery) => {
        // A native failure can arrive after a show signal. Keep the reported
        // result faithful to that failure; a close or missing click is not one.
        if (disposed || outcome === 'failed' || (outcome && result !== 'failed')) return;
        outcome = result;
        clearTimeout(timeout);
        report(result);
      };
      const release = () => {
        clearTimeout(timeout);
        notification.removeAllListeners();
        active.delete(cancel);
      };
      const cancel = () => {
        // Quitting the app must not withdraw an alert already accepted by the OS.
        const pending = outcome !== 'shown' && outcome !== 'failed';
        release();
        if (pending) notification.close();
      };
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

export function timerNotifications(onFailure?: (message: string) => void, options: NotificationOptions = {}):
  { notify: NotifyTimer; dispose(): void } {
  const queue = notificationQueue<void>(() => ({
    title: 'Jarvis Pet · 앱 안내', body: '5분 타이머가 끝났습니다.', silent: false,
  }), onFailure, options);
  return { notify: report => queue.notify(undefined, report), dispose: () => queue.dispose() };
}

export function scheduleNotifications(onFailure?: (message: string) => void, options: NotificationOptions = {}):
  { notify: NotifySchedule; dispose(): void } {
  const queue = notificationQueue<ScheduleRecord>(item => ({
    title: item.kind === 'alarm' ? 'Jarvis Pet · 알람' : 'Jarvis Pet · 리마인더',
    body: item.content, silent: false,
  }), onFailure, options);
  return { notify: (item, report) => queue.notify(item, report), dispose: () => queue.dispose() };
}
