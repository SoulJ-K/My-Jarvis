interface Window {
  petWindow: {
    snapshot: () => Promise<import('./pet').EggSnapshot>;
    hover: (interactive: boolean) => void;
    beginDrag: () => void;
    moveDrag: () => void;
    endDrag: () => Promise<boolean>;
    cancelDrag: () => void;
  };
}
