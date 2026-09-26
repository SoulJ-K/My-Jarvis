(() => {
  const input = document.querySelector<HTMLInputElement>('#request')!;
  const form = document.querySelector<HTMLFormElement>('#timer-form')!;
  const result = document.querySelector<HTMLElement>('#result')!;
  const list = document.querySelector<HTMLElement>('#timers')!;
  const submit = document.querySelector<HTMLButtonElement>('#submit')!;
  let composing = false;
  let compositionEnded = -Infinity;
  let busy = false;
  let requestId = crypto.randomUUID();
  let closeTimer: ReturnType<typeof setTimeout> | undefined;
  const cancelAutoClose = () => { clearTimeout(closeTimer); closeTimer = undefined; };
  const message = (text: string, error = false) => { result.textContent = text; result.classList.toggle('error', error); };
  const systemLabels = {
    'not-requested': '시스템 알림 미요청', requested: '시스템 알림 요청됨 · 표시 확인 대기',
    shown: '시스템 표시 신호 수신 · 읽음 여부는 알 수 없음', failed: '시스템 알림 실패 · 이 앱 안내에서 확인하세요',
    unsupported: '시스템 알림 미지원 · 이 앱 안내에서 확인하세요', unknown: '시스템 알림 표시 여부를 확인하지 못함',
  };
  async function refresh() {
    try {
      const rows = await window.timerPanel.read();
      list.replaceChildren();
      if (!rows.length) { list.textContent = '진행 중이거나 확인할 타이머가 없습니다.'; return; }
      for (const row of rows) {
        const item = document.createElement('article'); item.className = 'timer';
        const title = document.createElement('strong');
        title.textContent = row.status === 'pending' ? '5분 타이머 · 진행 중' :
          row.reason === 'recovered' ? '지난 타이머 · 재시작 후 복원' : row.reason === 'late' ? '5분 타이머 · 늦게 확인됨' : '5분 타이머 · 완료';
        const detail = document.createElement('p'); detail.className = 'detail';
        detail.textContent = row.status === 'pending' ?
          `등록 당시 종료 예정 ${new Date(row.dueAt).toLocaleTimeString('ko-KR')}` : systemLabels[row.systemDelivery];
        const action = document.createElement('button'); action.className = 'secondary';
        action.textContent = row.status === 'pending' ? '타이머 취소' : '확인했어요';
        action.onclick = async () => {
          cancelAutoClose(); action.disabled = true;
          try {
            if (row.status === 'pending') { const reply = await window.timerPanel.cancel(row.id); message(reply.message, !reply.ok); }
            else await window.timerPanel.acknowledge(row.id);
            await refresh();
          } catch { message('저장하지 못했습니다. 타이머 상태를 다시 확인해 주세요.', true); action.disabled = false; }
        };
        item.append(title, detail, action); list.append(item);
        if (row.status === 'due' && !document.hidden) void window.timerPanel.displayed(row.id).catch(() => {});
      }
    } catch { message('타이머 정보를 읽지 못했습니다. 등록 성공으로 처리하지 않았습니다.', true); }
  }
  input.addEventListener('compositionstart', () => { composing = true; cancelAutoClose(); });
  input.addEventListener('compositionend', () => { composing = false; compositionEnded = performance.now(); });
  input.addEventListener('input', () => { cancelAutoClose(); requestId = crypto.randomUUID(); });
  form.addEventListener('keydown', event => {
    if (event.key === 'Enter' && (composing || event.isComposing || event.keyCode === 229 || performance.now() - compositionEnded < 100)) event.preventDefault();
  });
  form.addEventListener('submit', async event => {
    event.preventDefault();
    if (busy || composing || performance.now() - compositionEnded < 100) return;
    cancelAutoClose(); busy = true; submit.disabled = true; input.disabled = true;
    try {
      const reply = await window.timerPanel.submit(requestId, input.value);
      message(reply.message, !reply.ok); await refresh();
      if (reply.ok) {
        input.value = ''; requestId = crypto.randomUUID();
        message(`${reply.message} 8초 뒤 입력창이 닫힙니다.`);
        closeTimer = setTimeout(() => { if (!composing && !busy && input.value === '') void close(); }, 8000);
      }
    } catch { message('저장 여부를 확인하지 못했습니다. 같은 입력으로 다시 확인할 수 있습니다.', true); }
    finally { busy = false; submit.disabled = false; input.disabled = false; }
  });
  async function close() {
    if (busy) return; // A committed request is cancelled through its explicit timer button.
    cancelAutoClose(); input.value = ''; requestId = crypto.randomUUID();
    await window.timerPanel.close();
  }
  document.querySelector<HTMLButtonElement>('#close')!.onclick = () => { void close(); };
  document.addEventListener('keydown', event => {
    if (event.key === 'Escape' && !composing && !event.isComposing && event.keyCode !== 229) { event.preventDefault(); void close(); }
    else cancelAutoClose();
  });
  document.addEventListener('pointerdown', cancelAutoClose);
  document.addEventListener('visibilitychange', () => { if (!document.hidden) void refresh(); });
  window.timerPanel.onClose(() => { cancelAutoClose(); input.value = ''; requestId = crypto.randomUUID(); composing = false; });
  window.timerPanel.onOpen(() => { cancelAutoClose(); message('“5분 타이머”를 입력하거나 아래 타이머를 확인하세요.'); input.focus(); void refresh(); });
  window.timerPanel.subscribe(() => { void refresh(); });
  void refresh();
})();
