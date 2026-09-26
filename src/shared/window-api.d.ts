interface Window {
  babyLife: {
    read: () => Promise<import('../pet/baby-life').BabyView | null>;
    feed: (offerId: string, x: number, y: number) => Promise<import('../pet/baby-life').BabyView>;
    subscribe: (listener: (state: import('../pet/baby-life').BabyView) => void) => () => void;
    onSaveFailed: (listener: () => void) => () => void;
  };
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
