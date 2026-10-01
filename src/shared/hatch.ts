import type { HatchScene, Lifecycle } from '../pet/lifecycle';

export interface HatchView {
  state: Lifecycle;
  available: boolean;
  epoch: number;
  /** Presentation offset after the same transparent window expands. */
  layout: { x: number; y: number; expanded: boolean };
}
export interface HatchAPI {
  read(): Promise<HatchView>;
  witness(revision: number, epoch: number, scene: HatchScene): Promise<HatchView>;
  name(revision: number, epoch: number, name: string): Promise<HatchView>;
  subscribe(listener: () => void): () => void;
}
