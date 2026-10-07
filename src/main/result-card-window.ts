import { BrowserWindow, screen } from 'electron';
import path from 'node:path';
import { babyScreenBounds } from './windows';

/** Non-activating automatic presentation; buttons activate only on deliberate input. */
export async function createResultCardWindow(pet: BrowserWindow) {
  const page = path.join(__dirname, '../renderer/result-card.html');
  const win = new BrowserWindow({ width: 350, height: 330, show: false, frame: false,
    transparent: true, resizable: false, skipTaskbar: true, alwaysOnTop: true,
    ...(process.platform === 'darwin' ? { type: 'panel' } : {}),
    webPreferences: { preload: path.join(__dirname, '../preload/prompt.js'), contextIsolation: true,
      nodeIntegration: false, sandbox: true, webSecurity: true, spellcheck: false } });
  const place = () => {
    if (pet.isDestroyed() || win.isDestroyed()) return;
    const bounds = pet.getBounds();
    const body = babyScreenBounds(pet) ?? {x:bounds.x+36,y:bounds.y+152,width:104,height:92};
    const area = screen.getDisplayMatching(bounds).workArea;
    const size = win.getBounds();
    const x = Math.max(area.x, Math.min(area.x + area.width - size.width, body.x + body.width / 2 - size.width / 2));
    const above = body.y - size.height + 5;
    const y = Math.max(area.y, Math.min(area.y + area.height - size.height,
      above >= area.y ? above : body.y + body.height));
    win.setPosition(Math.round(x), Math.round(y));
  };
  pet.on('move', place); pet.on('resize', place);
  win.webContents.setWindowOpenHandler(() => ({ action: 'deny' }));
  win.webContents.on('will-navigate', event => event.preventDefault());
  win.webContents.session.setPermissionRequestHandler((_w, _p, reply) => reply(false));
  win.webContents.session.setPermissionCheckHandler(() => false);
  await win.loadFile(page);
  let disposed = false, measuring = false;
  const measure = () => {
    if(measuring || win.isDestroyed()) return;
    measuring=true;
    void win.webContents.executeJavaScript('Math.ceil(document.querySelector("main").getBoundingClientRect().height + 10)').then(height=>{
      if(win.isDestroyed() || !Number.isFinite(height))return;
      const area=screen.getDisplayMatching(pet.getBounds()).workArea;
      const size=Math.max(120,Math.min(area.height,height));
      if(win.getBounds().height!==size) win.setSize(350,size);
      place();
    }).catch(()=>{}).finally(()=>{measuring=false;});
  };
  const sizingTimer=setInterval(()=>{if(win.isVisible())measure();},100);
  win.on('close', event => { if (!disposed) { event.preventDefault(); win.hide(); } });
  return { win, page,
    refresh(visible: boolean) {
      if (win.isDestroyed()) return;
      win.webContents.send('assistant:changed');
      if (visible && pet.isVisible()) { measure(); place(); if (!win.isVisible()) win.showInactive(); }
      else win.hide();
    },
    dispose() { disposed = true; clearInterval(sizingTimer); pet.removeListener('move', place); pet.removeListener('resize', place); win.destroy(); },
  };
}
