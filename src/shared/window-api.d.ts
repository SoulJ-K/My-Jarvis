interface Window {
  petBrain: {
    read: () => Promise<import('./pet-state').EggSnapshot>;
    subscribe: (listener: (state: import('./pet-state').EggSnapshot) => void) => () => void;
  };
  petWindow: {
    snapshot: () => Promise<import('./pet').EggSnapshot & { name?: string | null }>;
    hover: (interactive: boolean) => void;
    beginDrag: () => void;
    onStrokeReady: (listener: () => void) => () => void;
    onSaveFailed: (listener: () => void) => () => void;
    moveDrag: () => void;
    endDrag: () => Promise<boolean>;
    cancelDrag: () => void;
  };
}
