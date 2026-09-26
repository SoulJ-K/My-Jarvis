(() => {
  const input = document.querySelector<HTMLInputElement>('#request')!;
  const form = document.querySelector<HTMLFormElement>('#timer-form')!;
  const result = document.querySelector<HTMLElement>('#result')!;
  const list = document.querySelector<HTMLElement>('#timers')!;
  const submit = document.querySelector<HTMLButtonElement>('#submit')!;
  let composing = false;
  let compositionEnded = -Infinity;
  let submitPressedAt = -Infinity;
  let busy = false;
  let scheduleBusy = false;
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
  submit.addEventListener('pointerdown', () => { submitPressedAt = performance.now(); });
  input.addEventListener('input', () => { cancelAutoClose(); requestId = crypto.randomUUID(); });
  form.addEventListener('keydown', event => {
    if (event.key === 'Enter' && (composing || event.isComposing || event.keyCode === 229 || performance.now() - compositionEnded < 100)) event.preventDefault();
  });
  form.addEventListener('submit', async event => {
    event.preventDefault();
    const pointerSubmit = event.submitter === submit && performance.now() - submitPressedAt < 1000;
    submitPressedAt = -Infinity;
    if (busy || composing || (!pointerSubmit && performance.now() - compositionEnded < 100)) return;
    cancelAutoClose(); busy = true; submit.disabled = true; input.disabled = true;
    try {
      const reply = await window.timerPanel.submit(requestId, input.value);
      message(reply.message, !reply.ok); await refresh();
      if (reply.ok) {
        input.value = ''; requestId = crypto.randomUUID();
        message(`${reply.message} 8초 뒤 입력창이 닫힙니다.`);
        closeTimer = setTimeout(() => { if (!composing && !busy && !scheduleBusy && input.value === '' && scheduleInput.value === '') void close(); }, 8000);
      }
    } catch { message('저장 여부를 확인하지 못했습니다. 같은 입력으로 다시 확인할 수 있습니다.', true); }
    finally { busy = false; submit.disabled = false; input.disabled = false; }
  });
  async function close() {
    if (busy || scheduleBusy) return; // A committed request is cancelled through its explicit timer button.
    cancelAutoClose(); input.value = ''; requestId = crypto.randomUUID();
    resetSchedule();
    await window.timerPanel.close();
  }
  document.querySelector<HTMLButtonElement>('#close')!.onclick = () => { void close(); };
  document.addEventListener('keydown', event => {
    if (event.key === 'Escape' && !composing && !scheduleComposing && !event.isComposing && event.keyCode !== 229) { event.preventDefault(); void close(); }
    else cancelAutoClose();
  });
  document.addEventListener('pointerdown', cancelAutoClose);
  document.addEventListener('visibilitychange', () => { if (!document.hidden) void refresh(); });
  window.timerPanel.onClose(() => { resetSchedule(); cancelAutoClose(); input.value = ''; requestId = crypto.randomUUID(); composing = false; });
  window.timerPanel.onOpen(() => { cancelAutoClose(); message('“5분 타이머” 또는 아기에게 “안녕”, “잘했어”, “구슬 놀이”, “그만”을 입력하세요.'); input.focus(); void refresh(); });
  window.timerPanel.subscribe(() => { void refresh(); });
  const scheduleInput = document.querySelector<HTMLInputElement>('#schedule-request')!;
  const scheduleForm = document.querySelector<HTMLFormElement>('#schedule-form')!;
  const scheduleResult = document.querySelector<HTMLElement>('#schedule-result')!;
  const scheduleList = document.querySelector<HTMLElement>('#schedules')!;
  const confirmation = document.querySelector<HTMLElement>('#schedule-confirmation')!;
  const previewButton = document.querySelector<HTMLButtonElement>('#schedule-preview')!;
  const confirmButton = document.querySelector<HTMLButtonElement>('#schedule-confirm')!;
  const editButton = document.querySelector<HTMLButtonElement>('#schedule-edit')!;
  let scheduleId = crypto.randomUUID();
  let draftId: string | undefined;
  let scheduleComposing = false;
  let scheduleCompositionEnd = -Infinity;
  let schedulePressedAt = -Infinity;
  let refreshVersion = 0;
  const scheduleMessage = (text: string, error = false) => {
    scheduleResult.textContent = text; scheduleResult.classList.toggle('error', error);
    scheduleInput.setAttribute('aria-invalid', String(error));
  };
  const scheduleTime = (row: { localDateTime: string; timeZone: string; utcOffsetMinutes: number }) => {
    const offset = row.utcOffsetMinutes;
    return `${row.localDateTime} · ${row.timeZone} (UTC${offset < 0 ? '−' : '+'}${String(Math.floor(Math.abs(offset) / 60)).padStart(2, '0')}:${String(Math.abs(offset) % 60).padStart(2, '0')})`;
  };
  function resetSchedule() {
    scheduleInput.value = ''; scheduleId = crypto.randomUUID(); draftId = undefined;
    confirmation.hidden = true; scheduleComposing = false;
    scheduleMessage(''); void window.schedulePanel.discard().catch(() => {});
  }
  function setScheduleBusy(value: boolean) {
    scheduleBusy = value; scheduleInput.disabled = value;
    previewButton.disabled = value; confirmButton.disabled = value; editButton.disabled = value;
  }
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
            if (row.status === 'pending') { const reply = await window.schedulePanel.cancel(row.id); scheduleMessage(reply.message, !reply.ok); }
            else { await window.schedulePanel.acknowledge(row.id); scheduleMessage('확인한 알림을 목록에서 정리했습니다.'); }
            await refreshSchedules();
          } catch { scheduleMessage('변경을 저장하지 못했습니다. 다시 확인해 주세요.', true); action.disabled = false; }
        };
        item.append(title, content, detail, delivery, action); scheduleList.append(item);
        if (row.status === 'due' && !document.hidden) void window.schedulePanel.displayed(row.id).catch(() => {});
      }
    } catch { scheduleMessage('알람 저장소를 읽지 못했습니다. 등록 성공으로 처리하지 않았습니다.', true); }
  }
  scheduleInput.addEventListener('compositionstart', () => { scheduleComposing = true; cancelAutoClose(); });
  scheduleInput.addEventListener('compositionend', () => { scheduleComposing = false; scheduleCompositionEnd = performance.now(); });
  previewButton.addEventListener('pointerdown', () => { schedulePressedAt = performance.now(); });
  scheduleInput.addEventListener('input', () => {
    cancelAutoClose(); scheduleId = crypto.randomUUID(); draftId = undefined; confirmation.hidden = true;
    scheduleMessage(''); void window.schedulePanel.discard().catch(() => {});
  });
  scheduleForm.addEventListener('keydown', event => {
    if (event.key === 'Enter' && (scheduleComposing || event.isComposing || event.keyCode === 229 || performance.now() - scheduleCompositionEnd < 100)) event.preventDefault();
  });
  scheduleForm.addEventListener('submit', async event => {
    event.preventDefault();
    const pointerSubmit = event.submitter === previewButton && performance.now() - schedulePressedAt < 1000;
    schedulePressedAt = -Infinity;
    if (scheduleBusy || scheduleComposing || (!pointerSubmit && performance.now() - scheduleCompositionEnd < 100)) return;
    cancelAutoClose(); setScheduleBusy(true); confirmation.hidden = true; draftId = undefined;
    try {
      const reply = await window.schedulePanel.preview(scheduleId, scheduleInput.value);
      scheduleMessage(reply.message, !reply.ok);
      if (reply.ok) {
        draftId = reply.draft.id;
        document.querySelector('#schedule-summary')!.textContent = `${reply.draft.kind === 'alarm' ? '알람' : '리마인더'}\n${scheduleTime(reply.draft)}\n${reply.draft.content}`;
        confirmation.hidden = false;
      }
    } catch { scheduleMessage('내용을 확인하지 못했습니다. 다시 시도해 주세요.', true); }
    finally { setScheduleBusy(false); if (draftId) confirmButton.focus(); else scheduleInput.focus(); }
  });
  confirmButton.onclick = async () => {
    if (scheduleBusy || !draftId) return;
    cancelAutoClose(); setScheduleBusy(true);
    try {
      const reply = await window.schedulePanel.confirm(draftId);
      scheduleMessage(reply.message, !reply.ok);
      if (reply.ok) { scheduleInput.value = ''; scheduleId = crypto.randomUUID(); draftId = undefined; confirmation.hidden = true; }
      await refreshSchedules();
    } catch { scheduleMessage('저장 여부를 확인하지 못했습니다. 같은 확인 버튼으로 다시 확인할 수 있습니다.', true); }
    finally { setScheduleBusy(false); if (!draftId) scheduleInput.focus(); }
  };
  editButton.onclick = () => {
    confirmation.hidden = true; draftId = undefined; scheduleId = crypto.randomUUID();
    void window.schedulePanel.discard().catch(() => {}); scheduleInput.focus();
  };
  window.schedulePanel.subscribe(() => { void refreshSchedules(); });
  window.timerPanel.onOpen(() => { void refreshSchedules(); });
  document.addEventListener('visibilitychange', () => { if (!document.hidden) void refreshSchedules(); });
  void refresh(); void refreshSchedules();
})();
