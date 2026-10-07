interface Window {
  babyLife: {
    setReducedMotion: (enabled: boolean) => void;
    onDirection: (listener: (direction: 'left' | 'right') => void) => () => void;
    read: () => Promise<import('../pet/baby-life').BabyPresentation | null>;
    feed: (offerId: string, x: number, y: number) => Promise<import('../pet/baby-life').BabyPresentation>;
    subscribe: (listener: (state: import('../pet/baby-life').BabyPresentation) => void) => () => void;
    onSaveFailed: (listener: () => void) => () => void;
  };
  petBrain: {
    read: () => Promise<import('./pet-state').EggSnapshot>;
    subscribe: (listener: (state: import('./pet-state').EggSnapshot) => void) => () => void;
  };
  petWindow: {
    onNativeDragReset: (listener: () => void) => () => void;
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
