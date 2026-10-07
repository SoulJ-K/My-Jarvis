import { Notification } from 'electron';
import type { NotifyTimer } from '../assistant/timer';
import type { NotifySchedule } from '../assistant/reminders';
import type { ScheduleRecord } from '../shared/schedule';
import type { TimerRecord } from '../shared/timer';
import { notificationQueue, type NotificationBackend } from './notification-queue';
interface NotificationOptions<T> {
  backend?: NotificationBackend;
  outcomeTimeoutMs?: number;
  onClick?: (item: T) => void;
}
const backend: NotificationBackend = {
  isSupported: () => Notification.isSupported(), create: values => new Notification(values),
};
export function timerNotifications(onFailure?: (message: string) => void, options: NotificationOptions<TimerRecord | undefined> = {}):
  { notify: NotifyTimer; dispose(): void } {
  const queue = notificationQueue<TimerRecord | undefined>(item => ({
    title: 'Jarvis Pet · 타이머', body: `${item && 'title' in item ? item.title : '5분 타이머'} 시간이 끝났습니다.`, silent: false,
  }), onFailure, { ...options, backend: options.backend ?? backend });
  return { notify: (report, item) => queue.notify(item, report), dispose: () => queue.dispose() };
}
export function scheduleNotifications(onFailure?: (message: string) => void, options: NotificationOptions<ScheduleRecord> = {}):
  { notify: NotifySchedule; dispose(): void } {
  const queue = notificationQueue<ScheduleRecord>(item => ({
    title: item.kind === 'alarm' ? 'Jarvis Pet · 알람' : 'Jarvis Pet · 리마인더', body: item.content, silent: false,
  }), onFailure, { ...options, backend: options.backend ?? backend });
  return { notify: (item, report) => queue.notify(item, report), dispose: () => queue.dispose() };
}
