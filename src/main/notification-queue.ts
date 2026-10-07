import type { SystemDelivery } from '../shared/timer';
export interface NativeNotice {
  once(event: string, listener: (...args: any[]) => void): unknown;
  removeAllListeners(): unknown;
  show(): void;
  close(): void;
}
export interface NoticeOptions { title: string; body: string; silent: boolean }
export interface NotificationBackend { isSupported(): boolean; create(options: NoticeOptions): NativeNotice }
export interface QueueOptions<T> {
  backend: NotificationBackend; outcomeTimeoutMs?: number; onClick?: (item: T) => void;
}
/** Delivery outcome is independent from an intentional click. Never withdraw on timeout. */
export function notificationQueue<T>(message: (item: T) => NoticeOptions,
  onFailure: ((message: string) => void) | undefined, options: QueueOptions<T>) {
  const active = new Set<() => void>();
  let disposed = false;
  return {
    notify(item: T, report: (state: SystemDelivery) => void) {
      if (disposed) return;
      let notification: NativeNotice;
      try {
        if (!options.backend.isSupported()) { report('unsupported'); return; }
        notification = options.backend.create(message(item));
      } catch { report('failed'); return; }
      let outcome: SystemDelivery | undefined;
      const settle = (result: SystemDelivery) => {
        if (disposed || outcome === 'failed' || (outcome && result !== 'failed')) return;
        outcome = result; clearTimeout(timeout); report(result);
      };
      const release = () => {
        clearTimeout(timeout); notification.removeAllListeners(); active.delete(cancel);
      };
      const cancel = () => {
        // A pending/unknown notification may still be accepted by the OS.
        // Remove callbacks on disposal, but do not retract its native alert.
        release();
      };
      const timeout = setTimeout(() => settle('unknown'), options.outcomeTimeoutMs ?? 5000);
      notification.once('show', () => settle('shown'));
      notification.once('click', () => {
        if (!disposed) { try { settle('unknown'); options.onClick?.(item); } finally { release(); } }
      });
      notification.once('failed', (_event, error) => {
        try { settle('failed'); onFailure?.(String(error)); } finally { release(); }
      });
      notification.once('close', () => { try { settle('unknown'); } finally { release(); } });
      active.add(cancel);
      try { notification.show(); } catch { try { settle('failed'); } finally { release(); } }
    },
    dispose() { disposed = true; for (const cancel of active) cancel(); },
  };
}
