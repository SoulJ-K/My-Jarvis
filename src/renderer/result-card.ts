(() => {
  const title = document.querySelector<HTMLElement>('#card-title')!;
  const count = document.querySelector<HTMLElement>('#card-count')!;
  const result = document.querySelector<HTMLElement>('#card-result')!;
  const form = document.querySelector<HTMLFormElement>('#later-form')!;
  const answers = document.querySelector<HTMLElement>('#answers')!;
  const undo = document.querySelector<HTMLButtonElement>('#undo')!;
  let card: import('../shared/assistant-panel').ResultCard | null = null;
  let reading = 0, busy = false;
  const refresh = async () => {
    const version = ++reading;
    try {
      const state = await window.assistantPanel.read();
      if (reading !== version) return;
      const next = state.card;
      if (next?.id !== card?.id || next?.kind !== card?.kind || next?.completed !== card?.completed || next?.round !== card?.round) {
        form.hidden = true; form.reset(); result.textContent = '';
      }
      card = next;
      if (!card) return;
      document.body.dataset.round = String(card.round);
      title.textContent = card.title;
      count.textContent = card.completed ? '완료했어요' : card.count > 1 ? `기다리는 일 ${card.count}개` : '';
      count.hidden = count.textContent === '';
      answers.hidden = card.completed || !form.hidden;
      undo.hidden = !card.completed || !card.undoUntil || card.undoUntil <= Date.now();
    } catch { result.textContent = '상태를 읽지 못했어요. 잠시 후 다시 확인해 주세요.'; }
  };
  async function action(type: 'done' | 'undo' | 'cancel' | 'later', delayMs?: number) {
    if (!card || busy) return;
    busy = true;
    const snapshot = card;
    document.querySelectorAll<HTMLButtonElement>('button').forEach(button => button.disabled = true);
    try {
      const reply = await window.assistantPanel.action(type === 'later' ?
        { type, kind: snapshot.kind, id: snapshot.id, round: snapshot.round, delayMs: delayMs! } : { type, kind: snapshot.kind, id: snapshot.id, round: snapshot.round });
      result.textContent = reply.message;
      if (reply.ok) form.hidden = true;
      await refresh();
    } catch { result.textContent = '저장하지 못했어요. 다시 눌러 주세요.'; }
    finally { busy = false; document.querySelectorAll<HTMLButtonElement>('button').forEach(button => button.disabled = false); }
  }
  document.querySelector<HTMLButtonElement>('#done')!.onclick = () => { void action('done'); };
  undo.onclick = () => { void action('undo'); };
  document.querySelector<HTMLButtonElement>('#cancel')!.onclick = () => { void action('cancel'); };
  document.querySelector<HTMLButtonElement>('#later')!.onclick = () => { form.hidden = false; answers.hidden = true; };
  document.querySelector<HTMLButtonElement>('#back')!.onclick = () => { form.hidden = true; answers.hidden = false; };
  document.querySelectorAll<HTMLButtonElement>('[data-minutes]').forEach(button => {
    button.onclick = () => { void action('later', Number(button.dataset.minutes) * 60_000); };
  });
  form.onsubmit = event => {
    event.preventDefault();
    const minutes = Number(document.querySelector<HTMLInputElement>('#delay')!.value);
    if (!Number.isSafeInteger(minutes) || minutes < 1 || !Number.isSafeInteger(minutes * 60_000)) {
      result.textContent = '1분 이상의 시간을 정수로 적어 주세요.'; return;
    }
    void action('later', minutes * 60_000);
  };
  window.assistantPanel.subscribe(() => { void refresh(); });
  setInterval(() => { if (!document.hidden) void refresh(); }, 1000);
})();
