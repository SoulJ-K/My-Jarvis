/** User-facing state; notification receipt and task completion remain separate. */
export type ItemKind = 'timer' | 'alarm' | 'reminder';
export type TimerMenu = 'default' | 'pinned' | 'hidden';
export interface PanelItem {
  reason?: 'on-time' | 'late' | 'recovered' | null;
  id: string; kind: ItemKind; title: string; dueAt: number;
  status: 'pending' | 'paused' | 'due'; remainingMs: number;
  delivery: string; menu?: TimerMenu; timerState?: string; acknowledged: boolean;
}
export interface ResultCard {
  id: string; kind: ItemKind; title: string; round: number; count: number;
  undoUntil: number | null; completed: boolean;
}
export interface AssistantPanelState {
  warning?: string;
  stage: 'egg' | 'baby'; items: PanelItem[]; card: ResultCard | null;
}
export interface PanelReply { ok: boolean; message: string; needsPinConfirmation?: boolean }
export type PanelAction = { kind: ItemKind; id: string; round?: number } & (
  { type: 'ack' | 'cancel' | 'done' | 'undo' | 'pause' | 'resume' | 'restart' } |
  { type: 'later'; delayMs: number } |
  { type: 'menu'; mode: TimerMenu; replace?: boolean }
);
export interface AssistantPanelAPI {
  read(): Promise<AssistantPanelState>;
  action(action: PanelAction): Promise<PanelReply>;
  submitTimer(id: string, input: string, mode: TimerMenu, replace?: boolean): Promise<PanelReply>;
  snack(): Promise<PanelReply>;
  subscribe(listener: () => void): () => void;
}
