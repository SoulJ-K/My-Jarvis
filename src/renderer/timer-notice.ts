(() => {
  async function renderNotice() {
    try {
      const rows = (await window.timerPanel.read()).filter(row => row.status === 'due');
      document.querySelector('#notice-title')!.textContent = rows.some(row => row.reason === 'recovered') ?
        '지난 타이머가 있습니다' : '5분 타이머가 끝났습니다';
      if (!document.hidden) for (const row of rows) await window.timerPanel.displayed(row.id);
    } catch { document.querySelector('#notice-title')!.textContent = '타이머 상태를 확인해 주세요'; }
  }
  window.timerPanel.subscribe(() => { void renderNotice(); });
  document.addEventListener('visibilitychange', () => { void renderNotice(); });
  void renderNotice();
})();
