import type { PanelAction, TimerMenu } from '../shared/assistant-panel';
export function requestId(value: unknown): string {
  if (typeof value !== 'string' || !/^[\w-]{1,80}$/.test(value)) throw new Error('INVALID_ID');
  return value;
}
export function menuMode(value: unknown): TimerMenu {
  if (value !== 'default' && value !== 'pinned' && value !== 'hidden') throw new Error('INVALID_MENU');
  return value;
}
export function panelAction(value: unknown): PanelAction {
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw new Error('INVALID_ACTION');
  const input = value as Record<string, unknown>;
  const id = requestId(input.id);
  const kind = input.kind;
  if (kind !== 'timer' && kind !== 'alarm' && kind !== 'reminder') throw new Error('INVALID_KIND');
  const type = input.type;
  if ((type === 'later' || type === 'done') && (!Number.isSafeInteger(input.round) || Number(input.round) < 0)) throw new Error('INVALID_ROUND');
  if (type === 'later') {
    if (!Number.isSafeInteger(input.delayMs) || Number(input.delayMs) < 60_000 || !Number.isSafeInteger(Date.now() + Number(input.delayMs))) throw new Error('INVALID_DELAY');
    return { kind, id, type, round: Number(input.round), delayMs: Number(input.delayMs) };
  }
  if (type === 'menu') {
    if (kind !== 'timer' || input.replace !== undefined && typeof input.replace !== 'boolean') throw new Error('INVALID_ACTION');
    return { kind, id, type, mode: menuMode(input.mode), replace: input.replace as boolean | undefined };
  }
  if (type === 'ack' || type === 'cancel' || type === 'done' || type === 'undo') return { kind, id, type, round: input.round as number | undefined };
  if (kind === 'timer' && (type === 'pause' || type === 'resume' || type === 'restart')) return { kind, id, type };
  throw new Error('INVALID_ACTION');
}
