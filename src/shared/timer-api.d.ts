interface Window {
  timerPanel: {
    read(): Promise<import('./timer').TimerView[]>;
    submit(id: string, input: string): Promise<import('./timer').TimerReply>;
    cancel(id: string): Promise<import('./timer').TimerReply>;
    acknowledge(id: string): Promise<void>;
    displayed(id: string): Promise<void>;
    close(): Promise<void>;
    subscribe(listener: () => void): () => void;
    onClose(listener: () => void): () => void;
    onOpen(listener: () => void): () => void;
  };
}
