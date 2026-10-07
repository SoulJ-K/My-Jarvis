(() => {
  const input = document.querySelector<HTMLInputElement>('#request')!;
  const form = document.querySelector<HTMLFormElement>('#timer-form')!;
  const result = document.querySelector<HTMLElement>('#result')!;
  const list = document.querySelector<HTMLElement>('#timers')!;
  const submit = document.querySelector<HTMLButtonElement>('#submit')!;
  const scheduleList = document.querySelector<HTMLElement>('#schedules')!;
  const clarification = document.querySelector<HTMLElement>('#schedule-clarification')!;
  const choices = document.querySelector<HTMLElement>('#schedule-choices')!;
  const confirmation = document.querySelector<HTMLElement>('#schedule-confirmation')!;
  const confirmButton = document.querySelector<HTMLButtonElement>('#schedule-confirm')!;
  const editButton = document.querySelector<HTMLButtonElement>('#schedule-edit')!;
  const idleMessage = 'Enter로 보내고, Esc로 입력창을 닫을 수 있어요.';
  let composing = false;
  let submitAfterComposition = false;
  let busy = false;
  let requestId = crypto.randomUUID();
  let draftId: string | undefined;
  let session = 0;
  let refreshVersion = 0;
  let closeTimer: ReturnType<typeof setTimeout> | undefined;
  const message = (text: string, error = false) => { result.textContent = text; result.classList.toggle('error', error); };
  const requestMessage = (text: string, error = false) => {
    message(text, error); input.setAttribute('aria-invalid', String(error));
  };
  let closeGeneration = 0;
  let savedResult: string | undefined;
  const cancelAutoClose = () => {
    closeGeneration++;
    clearTimeout(closeTimer); closeTimer = undefined;
    if (savedResult !== undefined) requestMessage(savedResult);
  };
  function startAutoClose(text: string) {
    cancelAutoClose();
    savedResult = text;
    const deadline = performance.now() + 8000;
    const generation = closeGeneration;
    const activeSession = session;
    const update = () => {
      if (generation !== closeGeneration || activeSession !== session) return;
      const remaining = Math.max(0, deadline - performance.now());
      if (remaining === 0) {
        if (!composing && !busy && !draftId && input.value === '') void close();
        else cancelAutoClose();
        return;
      }
      requestMessage(`${text} ${Math.ceil(remaining / 1000)}초 뒤 입력창이 닫힙니다.`);
      closeTimer = setTimeout(update, Math.max(1, Math.ceil(remaining % 1000 || 1000)));
    };
    update();
  }
  function setBusy(value: boolean) {
    busy = value; input.disabled = value; submit.disabled = value;
    confirmButton.disabled = value; editButton.disabled = value;
    form.setAttribute('aria-busy', String(value));
    submit.textContent = value ? '처리 중…' : '보내기';
  }
  function discardDraft() {
    draftId = undefined; confirmation.hidden = true; clarification.hidden = true; choices.replaceChildren();
    void window.schedulePanel.discard().catch(() => {});
  }
  function resetInput() {
    session++; cancelAutoClose(); discardDraft();
    savedResult = undefined;
    input.value = ''; requestId = crypto.randomUUID(); composing = false;
    submitAfterComposition = false;
    pinReplacement = undefined; pinPanel.hidden = true;
    setBusy(false); requestMessage(idleMessage);
  }
  const menu = document.querySelector<HTMLSelectElement>('#timer-menu')!;
  const pinPanel = document.querySelector<HTMLElement>('#pin-confirmation')!;
  let pinReplacement: (() => Promise<void>) | undefined;
  let state: import('../shared/assistant-panel').AssistantPanelState | undefined;
  let signature = '';
  const systemLabels: Record<string, string> = {
    'not-requested': '시스템 알림 미요청', requested: '시스템 전달 결과 대기',
    shown: '시스템 표시 신호 수신', failed: '시스템 알림 실패',
    unsupported: '시스템 알림 미지원', unknown: '시스템 전달 결과 불명확',
  };
  const duration = (ms: number) => {
    const seconds = Math.max(0, Math.ceil(ms / 1000));
    const hours = Math.floor(seconds / 3600);
    return (hours ? `${hours}:` : '') + `${String(Math.floor(seconds / 60) % 60).padStart(2, '0')}:${String(seconds % 60).padStart(2, '0')}`;
  };
  const scheduleTime = (row: { localDateTime: string; timeZone: string; utcOffsetMinutes: number }) =>
    `${row.localDateTime} · ${row.timeZone}`;
  function askPin(replace: () => Promise<void>) { pinReplacement = replace; pinPanel.hidden = false; cancelAutoClose(); pinPanel.scrollIntoView({ block: 'nearest' }); }
  document.querySelector<HTMLButtonElement>('#pin-replace')!.onclick = () => {
    const run = pinReplacement; pinReplacement = undefined; pinPanel.hidden = true;
    if (run) void run();
  };
  document.querySelector<HTMLButtonElement>('#pin-keep')!.onclick = () => { pinReplacement = undefined; pinPanel.hidden = true; };
  async function perform(action: import('../shared/assistant-panel').PanelAction) {
    cancelAutoClose(); savedResult = undefined;
    try {
      const reply = await window.assistantPanel.action(action);
      message(reply.message, !reply.ok);
      if (reply.needsPinConfirmation && action.type === 'menu') askPin(() => perform({ ...action, replace: true }));
      await refresh();
    } catch { message('변경을 저장하지 못했어요. 다시 확인해 주세요.', true); }
  }
  async function refresh() {
    const version = ++refreshVersion;
    try {
      const next = await window.assistantPanel.read();
      if (version !== refreshVersion) return;
      state = next;
      const warning=document.querySelector<HTMLElement>('#list-warning');
      if(warning) {warning.textContent=next.warning ?? '';warning.hidden=!next.warning;}
      document.querySelector<HTMLElement>('#baby-examples')!.hidden = next.stage !== 'baby';
      const nextSignature = JSON.stringify({ stage: next.stage, items: next.items.map(({ remainingMs, ...item }) => item) });
      if (signature !== nextSignature) {
        signature = nextSignature; list.replaceChildren(); scheduleList.replaceChildren();
        const sorted = [...next.items].sort((a, b) => {
          if (a.status === 'paused' && b.status !== 'paused') return 1;
          if (b.status === 'paused' && a.status !== 'paused') return -1;
          return a.dueAt - b.dueAt || a.id.localeCompare(b.id);
        });
        for (const row of sorted) {
          const item = document.createElement('article'); item.className = 'timer';
          const title = document.createElement('strong'); title.textContent = row.title;
          const detail = document.createElement('p'); detail.className = 'detail';
          const kind = row.kind === 'timer' ? '타이머' : row.kind === 'alarm' ? '알람' : '리마인더';
          detail.textContent = `${kind} · ${row.status === 'paused' ? '일시정지' : row.status === 'pending' ? '예정 ' + new Date(row.dueAt).toLocaleString('ko-KR') : row.acknowledged ? '알림 확인됨 · 일 결과 대기' : '시간 지남 · 미확인'}`;
          if(row.status==='due' && row.reason==='recovered') detail.textContent+=' · 재시작 후 복원';
          if(row.status==='due' && row.reason==='late') detail.textContent+=' · 늦게 확인됨';
          const remaining = document.createElement('span'); remaining.className = 'remaining';
          remaining.dataset.item = `${row.kind}:${row.id}`;
          const delivery = document.createElement('p'); delivery.className = 'detail';
          if (row.status === 'due') delivery.textContent = systemLabels[row.delivery] ?? '';
          const actions = document.createElement('div'); actions.className = 'actions';
          const button = (label: string, type: 'ack' | 'cancel' | 'pause' | 'resume' | 'restart') => {
            const node = document.createElement('button'); node.type = 'button'; node.className = 'secondary'; node.textContent = label;
            node.onclick = async () => { node.disabled = true; await perform({ type, id: row.id, kind: row.kind }); if (node.isConnected) node.disabled = false; };
            actions.append(node);
          };
          if (row.status === 'due') button(next.stage === 'baby' ? '결과 알려주기' : '알림 확인', 'ack');
          if (row.kind === 'timer') {
            if (row.timerState === 'pending') button('일시정지', 'pause');
            if (row.timerState === 'paused') button('계속', 'resume');
            button('처음부터', 'restart');
            if (row.timerState === 'pending' || row.timerState === 'paused') {
              const select = document.createElement('select'); select.setAttribute('aria-label', `${row.title} 메뉴바 표시`);
              for (const [value, label] of [['default', '3분 전부터 표시'], ['pinned', '고정'], ['hidden', '표시 안 함']]) {
                const option = document.createElement('option'); option.value = value; option.textContent = label; select.append(option);
              }
              select.value = row.menu ?? 'default';
              select.onchange = () => { void perform({ type: 'menu', kind: row.kind, id: row.id, mode: select.value as import('../shared/assistant-panel').TimerMenu }); select.value = row.menu ?? 'default'; };
              item.append(select);
            }
          }
          button('취소', 'cancel'); item.prepend(title, detail, remaining, delivery); item.append(actions);
          (row.status === 'due' ? scheduleList : list).append(item);
        }
        if (!list.childElementCount) list.textContent = '진행 중인 일정이 없어요.';
        if (!scheduleList.childElementCount) scheduleList.textContent = '확인할 알림이 없어요.';
      }
      for (const span of document.querySelectorAll<HTMLElement>('[data-item]')) {
        const row = next.items.find(item => `${item.kind}:${item.id}` === span.dataset.item);
        span.textContent = row && row.kind === 'timer' && row.status !== 'due' ? `남은 시간 ${duration(row.remainingMs)}` : '';
      }
    } catch { if (version === refreshVersion) message('목록을 읽지 못했어요. 잠시 후 다시 확인해 주세요.', true); }
  }
  const refreshSchedules = refresh;
  input.addEventListener('compositionstart', () => { composing = true; cancelAutoClose(); });
  input.addEventListener('compositionend', () => {
    composing = false;
    if (submitAfterComposition) {
      submitAfterComposition = false; const activeSession = session;
      setTimeout(() => { if (session === activeSession && !busy && !composing) form.requestSubmit(submit); }, 0);
    }
  });
  input.addEventListener('input', () => {
    cancelAutoClose(); requestId = crypto.randomUUID(); discardDraft(); requestMessage(savedResult ?? '');
  });
  form.addEventListener('keydown', event => {
    if (event.key === 'Enter' && (composing || event.isComposing || event.keyCode === 229)) {
      event.preventDefault(); submitAfterComposition = true;
    }
  });
  form.addEventListener('submit', async event => {
    event.preventDefault();
    if (busy || composing) return;
    cancelAutoClose(); savedResult = undefined;
    const text = input.value.trim();
    if (!text) { requestMessage('부탁할 내용을 적어 주세요.', true); input.focus(); return; }
    // Route calendar-looking requests to the existing preview; interpretation remains in the service.
    const calendar = !/타이머/.test(text) && /알람|알림|리마인더|오늘|내일|오전|오후|\d{4}-\d{2}-\d{2}|\d{1,2}:\d{2}/.test(text);
    setBusy(true); discardDraft(); requestMessage(calendar ? '날짜와 시간을 확인하고 있어요…' : '요청을 처리하고 있어요…');
    const activeSession = session;
    try {
      if (calendar) {
        const reply = await window.schedulePanel.preview(requestId, text);
        if (session !== activeSession) return;
        requestMessage(reply.message, !reply.ok);
        if (reply.ok) {
          draftId = reply.draft.id;
          document.querySelector('#schedule-summary')!.textContent = `${reply.draft.kind === 'alarm' ? '알람' : '리마인더'}\n${scheduleTime(reply.draft)}\n${reply.draft.content}`;
          confirmation.hidden = false;
        } else if (reply.clarification) {
          for (const choice of reply.clarification.choices) {
            const button = document.createElement('button');
            button.type = 'button'; button.className = 'secondary'; button.textContent = choice.label;
            button.onclick = () => {
              if (busy) return;
              input.value = choice.input;
              input.dispatchEvent(new Event('input', { bubbles: true }));
              form.requestSubmit(submit);
            };
            choices.append(button);
          }
          clarification.hidden = false;
        }
      } else {
        const snack = /^간식\s*먹(?:어|을래)[?？!]?$/.test(text);
        const reply = snack ? await window.assistantPanel.snack() : /타이머/.test(text) ?
          await window.assistantPanel.submitTimer(requestId, text, menu.value as import('../shared/assistant-panel').TimerMenu) : await window.timerPanel.submit(requestId, text);
        if ('needsPinConfirmation' in reply && reply.needsPinConfirmation) {
          const pendingId = requestId; const pendingText = text;
          askPin(async () => {
            try { const saved = await window.assistantPanel.submitTimer(pendingId, pendingText, 'pinned', true); requestMessage(saved.message, !saved.ok); if (saved.ok) { input.value = ''; requestId = crypto.randomUUID(); } await refresh(); }
            catch { requestMessage('교체하지 못했어요. 다시 확인해 주세요.', true); }
          });
        }
        if (session !== activeSession) return;
        requestMessage(reply.message, !reply.ok); void refresh();
        if (reply.ok) {
          input.value = ''; requestId = crypto.randomUUID();
          startAutoClose(reply.message);
        }
      }
    } catch {
      if (session === activeSession) requestMessage(calendar ? '내용을 확인하지 못했습니다. 입력은 그대로 두었으니 다시 보내 주세요.' : '저장 여부를 확인하지 못했습니다. 같은 입력으로 다시 확인할 수 있습니다.', true);
    } finally {
      if (session === activeSession) { setBusy(false); if (draftId) confirmButton.focus(); else input.focus(); }
    }
  });
  confirmButton.onclick = async () => {
    if (busy || !draftId) return;
    cancelAutoClose(); setBusy(true);
    const activeSession = session;
    try {
      const reply = await window.schedulePanel.confirm(draftId);
      if (session !== activeSession) return;
      requestMessage(reply.message, !reply.ok);
      if (reply.ok) { input.value = ''; requestId = crypto.randomUUID(); draftId = undefined; confirmation.hidden = true; }
      void refreshSchedules();
    } catch {
      if (session === activeSession) requestMessage('저장 여부를 확인하지 못했습니다. 같은 확인 버튼으로 다시 확인할 수 있습니다.', true);
    } finally {
      if (session === activeSession) { setBusy(false); if (!draftId) input.focus(); else confirmButton.focus(); }
    }
  };
  editButton.onclick = () => {
    if (busy) return;
    discardDraft(); requestId = crypto.randomUUID(); requestMessage('내용을 수정한 뒤 다시 보내 주세요. 아직 저장하지 않았습니다.'); input.focus();
  };
  async function close() {
    if (busy) return;
    cancelAutoClose(); await window.timerPanel.close();
  }
  document.querySelector<HTMLButtonElement>('#close')!.onclick = () => { void close(); };
  document.addEventListener('keydown', event => {
    if (event.key === 'Escape' && !composing && !event.isComposing && event.keyCode !== 229) { event.preventDefault(); void close(); }
    else cancelAutoClose();
  });
  document.addEventListener('pointerdown', cancelAutoClose);
  document.addEventListener('visibilitychange', () => { if (!document.hidden) { void refresh(); void refreshSchedules(); } });
  window.timerPanel.onClose(resetInput);
  window.timerPanel.onOpen(() => { cancelAutoClose(); if (!busy && !draftId) { requestMessage(idleMessage); input.focus(); } void refresh(); void refreshSchedules(); });
  window.assistantPanel.subscribe(() => { void refresh(); });
  setInterval(() => { if (!document.hidden) void refresh(); }, 1000);
  window.timerPanel.subscribe(() => { void refresh(); });
  window.schedulePanel.subscribe(() => { void refreshSchedules(); });
  void refresh(); void refreshSchedules();
})();
