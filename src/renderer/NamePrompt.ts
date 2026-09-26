/** Browser script: load before HatchSequence.js. No Node or direct storage access. */
namespace JarvisHatch {
  export class NamePrompt {
    readonly element = document.createElement('form');
    private readonly input = document.createElement('input');
    private readonly button = document.createElement('button');
    private readonly error = document.createElement('p');
    private busy = false;
    private disposed = false;
    private composing = false;
    private compositionEnded = -Infinity;
    constructor(save: (name: string) => Promise<void>) {
      const label = document.createElement('label');
      label.textContent = '어떤 이름으로 불러 줄까요?';
      this.input.name = 'pet-name'; this.input.autocomplete = 'off';
      this.input.setAttribute('aria-label', label.textContent);
      label.append(this.input);
      this.button.type = 'submit'; this.button.textContent = '이 이름으로 부르기';
      this.error.setAttribute('role', 'alert');
      this.element.append(label, this.error, this.button);
      this.input.addEventListener('compositionstart', () => { this.composing = true; });
      this.input.addEventListener('compositionend', () => { this.composing = false; this.compositionEnded = performance.now(); });
      this.input.addEventListener('keydown', event => {
        if (event.key === 'Enter' && (event.isComposing || this.composing || performance.now() - this.compositionEnded < 100)) event.preventDefault();
      });
      this.element.addEventListener('submit', async event => {
        event.preventDefault();
        if (this.busy || this.disposed || this.composing || performance.now() - this.compositionEnded < 100) return;
        this.busy = true; this.button.disabled = true; this.input.disabled = true;
        this.element.setAttribute('aria-busy', 'true'); this.error.textContent = '';
        this.button.textContent = '저장하고 있어요…';
        try { await save(this.input.value); }
        catch (error) {
          if (!this.disposed) {
            this.error.textContent = error instanceof Error && error.message === 'INVALID_NAME'
              ? '이 이름은 저장할 수 없어요. 이름을 확인해 주세요.'
              : '이름을 저장하지 못했어요. 입력한 이름은 그대로 있으니 다시 시도해 주세요.';
          }
        } finally {
          this.busy = false;
          if (!this.disposed) {
            this.button.disabled = false; this.input.disabled = false;
            this.element.removeAttribute('aria-busy'); this.button.textContent = '이 이름으로 부르기';
            this.input.focus();
          }
        }
      });
    }
    focus(): void { this.input.focus(); }
    dispose(): void { this.disposed = true; this.element.remove(); }
  }
}
