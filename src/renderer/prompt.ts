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
  let compositionEnded = -Infinity;
  let submitPressedAt = -Infinity;
  let busy = false;
  let requestId = crypto.randomUUID();
  let draftId: string | undefined;
  let session = 0;
  let refreshVersion = 0;
  let closeTimer: ReturnType<typeof setTimeout> | undefined;
  const cancelAutoClose = () => { clearTimeout(closeTimer); closeTimer = undefined; };
  const message = (text: string, error = false) => { result.textContent = text; result.classList.toggle('error', error); };
  const requestMessage = (text: string, error = false) => {
    message(text, error); input.setAttribute('aria-invalid', String(error));
  };
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
    input.value = ''; requestId = crypto.randomUUID(); composing = false;
    compositionEnded = -Infinity; submitPressedAt = -Infinity;
    setBusy(false); requestMessage(idleMessage);
  }
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
    } catch { list.textContent = '타이머 정보를 읽지 못했습니다. 창을 다시 열어 확인해 주세요.'; }
  }
  const scheduleTime = (row: { localDateTime: string; timeZone: string; utcOffsetMinutes: number }) => {
    const offset = row.utcOffsetMinutes;
    return `${row.localDateTime} · ${row.timeZone} (UTC${offset < 0 ? '−' : '+'}${String(Math.floor(Math.abs(offset) / 60)).padStart(2, '0')}:${String(Math.abs(offset) % 60).padStart(2, '0')})`;
  };
  async function refreshSchedules() {
    const version = ++refreshVersion;
    try {
      const rows = await window.schedulePanel.read();
      if (version !== refreshVersion) return;
      scheduleList.replaceChildren();
      if (!rows.length) { scheduleList.textContent = '예약하거나 확인할 알림이 없습니다.'; return; }
      for (const row of rows) {
        const item = document.createElement('article'); item.className = 'timer';
        const title = document.createElement('strong');
        const state = row.status === 'pending' ? '예약됨' : row.reason === 'recovered' ? '재시작 후 복원' : row.reason === 'late' ? '늦게 확인됨' : '시각이 되었습니다';
        title.textContent = `${row.kind === 'alarm' ? '알람' : '리마인더'} · ${state}`;
        const content = document.createElement('p'); content.textContent = row.content;
        const detail = document.createElement('p'); detail.className = 'detail'; detail.textContent = scheduleTime(row);
        const delivery = document.createElement('p'); delivery.className = 'detail';
        if (row.status === 'due') delivery.textContent = systemLabels[row.systemDelivery];
        const action = document.createElement('button'); action.className = 'secondary';
        action.textContent = row.status === 'pending' ? '알림 취소' : '확인했어요';
        action.setAttribute('aria-label', `${row.content} · ${row.localDateTime} · ${action.textContent}`);
        action.onclick = async () => {
          cancelAutoClose(); action.disabled = true;
          try {
            if (row.status === 'pending') { const reply = await window.schedulePanel.cancel(row.id); message(reply.message, !reply.ok); }
            else { await window.schedulePanel.acknowledge(row.id); message('확인한 알림을 목록에서 정리했습니다.'); }
            await refreshSchedules();
          } catch { message('변경을 저장하지 못했습니다. 다시 확인해 주세요.', true); action.disabled = false; }
        };
        item.append(title, content, detail, delivery, action); scheduleList.append(item);
        if (row.status === 'due' && !document.hidden) void window.schedulePanel.displayed(row.id).catch(() => {});
      }
    } catch { if (version === refreshVersion) scheduleList.textContent = '알림 목록을 읽지 못했습니다. 창을 다시 열어 확인해 주세요.'; }
  }
  input.addEventListener('compositionstart', () => { composing = true; cancelAutoClose(); });
  input.addEventListener('compositionend', () => { composing = false; compositionEnded = performance.now(); });
  submit.addEventListener('pointerdown', () => { submitPressedAt = performance.now(); });
  input.addEventListener('input', () => {
    cancelAutoClose(); requestId = crypto.randomUUID(); discardDraft(); requestMessage('');
  });
  form.addEventListener('keydown', event => {
    if (event.key === 'Enter' && (composing || event.isComposing || event.keyCode === 229 || performance.now() - compositionEnded < 100)) event.preventDefault();
  });
  form.addEventListener('submit', async event => {
    event.preventDefault();
    const pointerSubmit = event.submitter === submit && performance.now() - submitPressedAt < 1000;
    submitPressedAt = -Infinity;
    if (busy || composing || (!pointerSubmit && performance.now() - compositionEnded < 100)) return;
    cancelAutoClose();
    const text = input.value.trim();
    if (!text) { requestMessage('부탁할 내용을 적어 주세요.', true); input.focus(); return; }
    // Route calendar-looking requests to the existing preview; interpretation remains in the service.
    const calendar = /알람|알림|리마인더|오늘|내일|오전|오후|\d{4}-\d{2}-\d{2}|\d{1,2}:\d{2}/.test(text);
    if (!calendar && !/^5\s*분\s*타이머$/.test(text) && !['안녕', '잘했어', '구슬 놀이', '그만'].includes(text)) {
      discardDraft(); requestMessage('아직 이해하지 못했어요. 아래 입력 예시를 확인해 주세요. 실행하거나 저장한 내용은 없습니다.', true); input.focus(); return;
    }
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
              // A deliberate choice must pass the recent IME Enter guard.
              submitPressedAt = performance.now();
              form.requestSubmit(submit);
            };
            choices.append(button);
          }
          clarification.hidden = false;
        }
      } else {
        const reply = await window.timerPanel.submit(requestId, text);
        if (session !== activeSession) return;
        requestMessage(reply.message, !reply.ok); void refresh();
        if (reply.ok) {
          input.value = ''; requestId = crypto.randomUUID();
          requestMessage(`${reply.message} 8초 뒤 입력창이 닫힙니다.`);
          closeTimer = setTimeout(() => { if (!composing && !busy && !draftId && input.value === '') void close(); }, 8000);
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
  window.timerPanel.subscribe(() => { void refresh(); });
  window.schedulePanel.subscribe(() => { void refreshSchedules(); });
  void refresh(); void refreshSchedules();
})();
