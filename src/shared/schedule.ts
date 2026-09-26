import type { SystemDelivery } from './timer';

export interface ScheduleDraft {
  id: string;
  kind: 'alarm' | 'reminder';
  content: string;
  dueAt: number;
  localDateTime: string;
  timeZone: string;
  utcOffsetMinutes: number;
}
export interface ScheduleRecord extends ScheduleDraft {
  createdAt: number;
  status: 'pending' | 'due' | 'cancelled' | 'acknowledged';
  reason: 'on-time' | 'late' | 'recovered' | null;
  systemDelivery: SystemDelivery;
  appDisplayed: boolean;
}
export type SchedulePreview = { ok: true; draft: ScheduleDraft; message: string } | { ok: false; message: string };
export interface ScheduleReply { ok: boolean; message: string }
