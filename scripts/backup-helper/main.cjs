const { app, BrowserWindow, ipcMain, dialog, shell, Menu } = require('electron');
const fs = require('node:fs');
const path = require('node:path');
const { pathToFileURL } = require('node:url');
const { BackupController } = require('./controller.cjs');
async function startHelper(options = {}) {
  await app.whenReady();
  const settings = path.join(app.getPath('userData'), 'backup-helper.json');
  let initialApp = null;
  if (!options.noSettings) { try { const data = JSON.parse(fs.readFileSync(settings, 'utf8')); if (typeof data.app === 'string' && path.isAbsolute(data.app)) initialApp = data.app; } catch {} }
  const win = new BrowserWindow({ width: 760, height: 810, minWidth: 540, minHeight: 600, show: options.show !== false, title: 'Jarvis Pet 백업 도우미', backgroundColor: '#f6f7fb', webPreferences: { preload: path.join(__dirname, 'preload.cjs'), sandbox: true, contextIsolation: true, nodeIntegration: false } });
  const url = pathToFileURL(path.join(__dirname, 'index.html')).href;
  const controller = new BackupController({
    initialApp,
    choose: options.choose ?? (async kind => {
      const labels = { app: '평소 사용하는 Jarvis Pet 앱 선택', backup: '복원할 Jarvis 백업 폴더 선택', backupParent: '백업을 보관할 폴더 선택', restoreParent: '복원 사본을 보관할 폴더 선택' };
      const result = await dialog.showOpenDialog(win, { title: labels[kind], buttonLabel: '이 위치 선택', properties: kind === 'app' ? ['openFile'] : ['openDirectory'], ...(kind === 'app' ? { filters: [{ name: '응용 프로그램', extensions: ['app'] }] } : {}) });
      return result.canceled ? null : result.filePaths[0];
    }),
    ...(options.worker ? { worker: options.worker } : {}),
    remember: selected => { if (!options.noSettings) { fs.mkdirSync(path.dirname(settings), { recursive: true }); fs.writeFileSync(settings, JSON.stringify({ app: selected }), { mode: 0o600 }); } },
    reveal: options.reveal ?? (folder => shell.showItemInFolder(folder)),
  });
  ipcMain.handle('backup-helper', (event, action, value) => {
    if (event.sender !== win.webContents || event.senderFrame !== win.webContents.mainFrame || event.senderFrame.url !== url) throw new Error('UNTRUSTED_SENDER');
    if (typeof action !== 'string' || (value !== undefined && typeof value !== 'boolean')) throw new Error('INVALID_REQUEST');
    return controller.dispatch(action, value);
  });
  win.webContents.setWindowOpenHandler(() => ({ action: 'deny' }));
  win.webContents.on('will-navigate', event => event.preventDefault());
  win.webContents.session.setPermissionRequestHandler((_wc, _permission, callback) => callback(false));
  win.webContents.session.webRequest.onBeforeRequest({ urls: ['http://*/*', 'https://*/*', 'ws://*/*', 'wss://*/*'] }, (_details, callback) => callback({ cancel: true }));
  win.on('close', event => { if (controller.state.busy) { event.preventDefault(); win.webContents.send('backup-helper-wait'); } });
  win.on('closed', () => ipcMain.removeHandler('backup-helper'));
  Menu.setApplicationMenu(Menu.buildFromTemplate([{ label: '백업 도우미', submenu: [{ role: 'about' }, { type: 'separator' }, { role: 'quit', label: '백업 도우미 종료' }] }, { label: '보기', submenu: [{ role: 'zoomIn' }, { role: 'zoomOut' }, { role: 'resetZoom' }] }]));
  await win.loadURL(url);
  return { win, controller };
}
module.exports = { startHelper };
