import type { SystemDelivery } from './timer';
export interface FollowupKey { kind: 'timer' | 'alarm' | 'reminder'; id: string }
export interface FollowupSubject extends FollowupKey { title: string; dueAt: number }
export interface FollowupRound {
  number: number;
  dueAt: number;
  processedAt: number;
  acknowledgedAt: number | null;
  delivery: SystemDelivery;
  answer: 'not-yet' | 'done' | null;
}
export interface FollowupUndo {
  expiresAt: number;
  nextReminderAt: number | null;
  cardAt: number | null;
  answer: FollowupRound['answer'];
}
export interface FollowupRecord extends FollowupSubject {
  firstProcessedAt: number;
  acknowledgedAt: number | null;
  status: 'active' | 'done' | 'cancelled' | 'legacy';
  round: number;
  rounds: FollowupRound[];
  nextReminderAt: number | null;
  cardAt: number | null;
  notYetCount: number;
  completedAt: number | null;
  undo: FollowupUndo | null;
}
export interface FollowupNotice extends FollowupSubject { round: number; reason: 'reminder' | 'recovered' }
export interface UpcomingSchedule extends FollowupKey {
  dueAt: number;
  status: string;
  /** A running timer supplies monotonic remaining time; wall time is for date schedules. */
  remainingMs?: number;
}
export interface AttentionState { holdLife: boolean; level: 0 | 1 | 2; intervalSeconds: number }
export const followupKey = (key: FollowupKey): string => `${key.kind}:${key.id}`;
