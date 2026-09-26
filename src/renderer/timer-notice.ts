(() => {
  let version = 0;
  async function renderNotice() {
    const current = ++version;
    try {
      const [timers, schedules] = await Promise.all([
        window.timerPanel.read(), window.schedulePanel.read().catch(() => []),
      ]);
      if (current !== version) return;
      const dueTimers = timers.filter(row => row.status === 'due');
      const dueSchedules = schedules.filter(row => row.status === 'due');
      const total = dueTimers.length + dueSchedules.length;
      const latest = dueSchedules.at(-1);
      document.querySelector('#notice-title')!.textContent = latest ?
        `확인할 알림 ${total}개 · ${latest.kind === 'alarm' ? '알람' : '리마인더'}` :
        dueTimers.some(row => row.reason === 'recovered') ? '지난 타이머가 있습니다' : '5분 타이머가 끝났습니다';
      document.querySelector('#notice-content')!.textContent = latest ?
        `${latest.localDateTime} · ${latest.content}` : '';
      if (!document.hidden) {
        if (latest) await window.schedulePanel.displayed(latest.id);
        else for (const row of dueTimers) await window.timerPanel.displayed(row.id);
      }
    } catch { document.querySelector('#notice-title')!.textContent = '알림 목록을 확인해 주세요'; }
  }
  window.timerPanel.subscribe(() => { void renderNotice(); });
  window.schedulePanel.subscribe(() => { void renderNotice(); });
  document.addEventListener('visibilitychange', () => { void renderNotice(); });
  void renderNotice();
})();
