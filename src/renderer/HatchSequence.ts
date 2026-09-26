/** Explicitly paced scenes. The host supplies validated IPC and availability;
 * no renderer timer or product readiness trigger advances saved progress. */
namespace JarvisHatch {
  type Snapshot = import('../pet/lifecycle').Lifecycle;
  type Scene = import('../pet/lifecycle').HatchScene;
  export interface Transport {
    read(): Promise<Snapshot>;
    apply(revision: number, command: import('../pet/lifecycle').LifecycleCommand): Promise<Snapshot>;
  }
  const scenes: Scene[] = ['prelude', 'crack', 'orb', 'shell', 'baby', 'contact'];
  const descriptions: Record<Scene, string> = {
    prelude: '알이 조용히 흔들리고 있어요.', crack: '알에 작은 금이 생겼어요.',
    orb: '작은 감정구슬이 먼저 나왔어요.', shell: '껍질이 천천히 갈라져요.',
    baby: '아기가 나와 주변을 살펴요.', contact: '아기가 당신을 보고 조금 다가와요.',
  };
  export class HatchSequence {
    private state?: Snapshot;
    private active = false;
    private busy = false;
    private generation = 0;
    private disposed = false;
    private hostAvailable = false;
    private namePrompt?: NamePrompt;
    private nameDraft = '';
    private readonly onVisibility = () => { void this.refresh(this.hostAvailable && !document.hidden).catch(() => this.showReadError()); };
    constructor(private readonly root: HTMLElement, private readonly transport: Transport) {
      root.classList.add('hatch-sequence');
      document.addEventListener('visibilitychange', this.onVisibility);
    }
    /** Host also calls false on lock/suspend/window hide, true only after safe
     * explicit resume. Page visibility alone is not evidence of human presence. */
    async setAvailable(available: boolean): Promise<void> {
      this.hostAvailable = available;
      return this.refresh(available);
    }
    private async refresh(available: boolean): Promise<void> {
      if (this.disposed) return;
      const generation = ++this.generation;
      this.active = available;
      if (this.namePrompt) this.nameDraft = this.namePrompt.value;
      this.namePrompt?.dispose(); this.namePrompt = undefined; this.root.replaceChildren();
      if (!available) return;
      const state = await this.transport.read();
      if (!this.active || this.disposed || generation !== this.generation) return;
      this.state = state; this.render();
    }
    private showReadError(): void {
      if (!this.active || this.disposed) return;
      this.root.textContent = '진행 상태를 읽지 못했어요. 창을 다시 열어 주세요.';
    }
    private render(): void {
      if (!this.active || !this.state || this.disposed) return;
      this.namePrompt?.dispose(); this.root.replaceChildren();
      const state = this.state;
      const sceneIndex = state.completed === null ? 0 : scenes.indexOf(state.completed) + 1;
      const step = !state.ready ? 'egg' : state.name !== null ? 'life'
        : sceneIndex < scenes.length ? scenes[sceneIndex] : 'naming';
      this.root.dataset.step = step;
      this.root.dataset.petId = state.petId;
      this.root.dataset.orbId = state.orbId ?? '';
      const scene = document.createElement('div'); scene.className = 'hatch-art';
      scene.setAttribute('aria-hidden', 'true');
      // Temporary geometric art; final character/appearance generation is out of scope.
      for (const part of ['egg', 'crack', 'orb', 'baby']) {
        const element = document.createElement('span'); element.className = `hatch-${part}`; scene.append(element);
      }
      const caption = document.createElement('p'); caption.setAttribute('role', 'status');
      caption.textContent = step === 'egg' ? '' : step === 'life' ? `${state.name}, 반가워요.`
        : step === 'naming' ? '첫 인사를 나눴어요.' : descriptions[step];
      this.root.append(scene, caption);
      if (step === 'egg' || step === 'life') return;
      if (step === 'naming') {
        const generation = this.generation;
        this.namePrompt = new NamePrompt(async name => {
          if (!this.active || generation !== this.generation) throw new Error('HATCH_PAUSED');
          const saved = await this.transport.apply(state.revision, { type: 'name', name });
          if (this.disposed || !this.active || generation !== this.generation) return;
          this.state = saved; this.render();
        }, this.nameDraft);
        this.root.append(this.namePrompt.element); this.namePrompt.focus(); return;
      }
      const button = document.createElement('button'); button.type = 'button';
      button.textContent = step === 'contact' ? '안녕' : step === 'prelude' ? '함께 보기' : '계속 보기';
      const error = document.createElement('p'); error.setAttribute('role', 'alert');
      const generation = this.generation;
      button.addEventListener('click', async () => {
        if (!this.active || this.busy || this.disposed || generation !== this.generation) return;
        this.busy = true; button.disabled = true; error.textContent = '';
        try {
          const saved = await this.transport.apply(state.revision, { type: 'witness', scene: step });
          if (this.active && !this.disposed && generation === this.generation) { this.state = saved; this.render(); }
        } catch { if (this.active && generation === this.generation) error.textContent = '진행을 저장하지 못했어요. 다시 시도해 주세요.'; }
        finally { this.busy = false; button.disabled = false; }
      });
      this.root.append(button, error); button.focus();
    }
    dispose(): void {
      this.disposed = true; this.active = false; this.generation++;
      document.removeEventListener('visibilitychange', this.onVisibility);
      this.namePrompt?.dispose(); this.root.replaceChildren();
    }
  }
}
