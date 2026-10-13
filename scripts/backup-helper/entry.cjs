const { app } = require('electron');
app.setName('Jarvis Pet 백업 도우미');
if (!app.requestSingleInstanceLock()) app.quit();
else {
  let window;
  app.on('second-instance', () => { if (window) { if (window.isMinimized()) window.restore(); window.show(); window.focus(); } });
  app.on('window-all-closed', () => app.quit());
  require('./main.cjs').startHelper().then(({ win }) => { window = win; }).catch(() => { require('electron').dialog.showErrorBox('백업 도우미를 열지 못했습니다', '펫 자료는 변경하지 않았습니다. 백업 도우미 실행 환경을 점검해 주세요.'); app.quit(); });
}
