interface Window {
  schedulePanel: {
    read(): Promise<import('./schedule').ScheduleRecord[]>;
    preview(id: string, input: string): Promise<import('./schedule').SchedulePreview>;
    confirm(id: string): Promise<import('./schedule').ScheduleReply>;
    discard(): Promise<void>;
    cancel(id: string): Promise<import('./schedule').ScheduleReply>;
    acknowledge(id: string): Promise<void>;
    displayed(id: string): Promise<void>;
    subscribe(listener: () => void): () => void;
  };
}
