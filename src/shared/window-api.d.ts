interface Window {
  petWindow: {
    hover: (interactive: boolean) => void;
    beginDrag: () => void;
    moveDrag: () => void;
    endDrag: () => Promise<boolean>;
    cancelDrag: () => void;
  };
}
