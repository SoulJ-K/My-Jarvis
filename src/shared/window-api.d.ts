interface Window {
  petBrain: {
    read: () => Promise<import('./pet-state').EggSnapshot>;
    subscribe: (listener: (state: import('./pet-state').EggSnapshot) => void) => () => void;
  };
  petWindow: {
    hover: (interactive: boolean) => void;
    beginDrag: () => void;
    moveDrag: () => void;
    endDrag: () => Promise<boolean>;
    cancelDrag: () => void;
  };
}
