import { BrowserWindow, screen } from 'electron';
import path from 'node:path';
import { babyScreenBounds } from './windows';

/** Non-activating automatic presentation; buttons activate only on deliberate input. */
export async function createResultCardWindow(pet: BrowserWindow) {
  const page = path.join(__dirname, '../renderer/result-card.html');
  const win = new BrowserWindow({ width: 280, height: 160, show: false, frame: false,
    transparent: true, resizable: false, skipTaskbar: true, alwaysOnTop: true,
    ...(process.platform === 'darwin' ? { type: 'panel' } : {}),
    webPreferences: { preload: path.join(__dirname, '../preload/prompt.js'), contextIsolation: true,
      nodeIntegration: false, sandbox: true, webSecurity: true, spellcheck: false } });
  let lastTail = '';
  // Hold the opening body position for this visible session. The baby may move,
  // but a button the user is aiming for must not move with it.
  let openingBody: Electron.Rectangle | null = null;
  const captureBody = () => {
    const bounds=pet.getBounds();
    return babyScreenBounds(pet) ?? {x:bounds.x+36,y:bounds.y+152,width:104,height:92};
  };
  const place = () => {
    if (pet.isDestroyed() || win.isDestroyed()) return;
    const body = openingBody; if (!body) return;
    const area = screen.getDisplayMatching(body).workArea;
    const size = win.getBounds();
    const x = Math.max(area.x, Math.min(area.x + area.width - size.width, body.x + body.width / 2 - size.width / 2));
    const above = body.y - size.height - 8;
    let finalX = x, finalY = above, placement = 'above';
    if (above < area.y) {
      // At the top edge there is no room above. Prefer beside the baby so the
      // card still leaves the body and its name/orb visible.
      const right = body.x + body.width + 12, left = body.x - size.width - 12;
      if (right + size.width <= area.x + area.width) { finalX = right; finalY = body.y; placement = 'right'; }
      else if (left >= area.x) { finalX = left; finalY = body.y; placement = 'left'; }
      else { finalY = body.y + body.height + 12; placement = 'below'; }
    }
    finalY = Math.max(area.y, Math.min(area.y + area.height - size.height, finalY));
    win.setPosition(Math.round(finalX), Math.round(finalY));
    const tail = JSON.stringify({placement,
      x:Math.round(Math.max(22,Math.min(size.width-42,body.x+body.width/2-finalX-10))),
      y:Math.round(Math.max(22,Math.min(size.height-50,body.y+body.height/2-finalY-10)))});
    if (tail !== lastTail && !win.webContents.isDestroyed()) {
      lastTail = tail;
      void win.webContents.executeJavaScript(`(() => { const p=${tail}; document.body.dataset.placement=p.placement;
        document.body.style.setProperty('--tail-x',p.x+'px'); document.body.style.setProperty('--tail-y',p.y+'px'); })()`).catch(()=>{lastTail='';});
    }
  };
  win.webContents.setWindowOpenHandler(() => ({ action: 'deny' }));
  win.webContents.on('will-navigate', event => event.preventDefault());
  win.webContents.session.setPermissionRequestHandler((_w, _p, reply) => reply(false));
  win.webContents.session.setPermissionCheckHandler(() => false);
  await win.loadFile(page);
  let disposed = false, measuring = false;
  const measure = () => {
    if(measuring || win.isDestroyed() || pet.isDestroyed() || win.webContents.isDestroyed()) return;
    measuring=true;
    void win.webContents.executeJavaScript('Math.ceil(document.querySelector("main").getBoundingClientRect().height + 28)').then(height=>{
      if(win.isDestroyed() || pet.isDestroyed() || !Number.isFinite(height))return;
      const area=screen.getDisplayMatching(openingBody ?? pet.getBounds()).workArea;
      const size=Math.max(100,Math.min(area.height,height));
      if(win.getBounds().height!==size) win.setSize(280,size);
      place();
    }).catch(()=>{}).finally(()=>{measuring=false;});
  };
  const sizingTimer=setInterval(()=>{if(!win.isDestroyed() && !pet.isDestroyed() && win.isVisible())measure();},100);
  const cleanup = () => {
    clearInterval(sizingTimer);
    openingBody = null;
  };
  // OS shutdown / forced window destruction can bypass the close/dispose path.
  win.once('closed', cleanup);
  pet.once('closed', cleanup);
  win.on('close', event => { if (!disposed) { event.preventDefault(); win.hide(); openingBody = null; } });
  return { win, page,
    refresh(visible: boolean) {
      if (win.isDestroyed() || pet.isDestroyed()) return;
      win.webContents.send('assistant:changed');
      if (visible && pet.isVisible()) {
        if (!win.isVisible() || !openingBody) openingBody = captureBody();
        measure(); place(); if (!win.isVisible()) win.showInactive();
      } else { win.hide(); openingBody = null; }
    },
    dispose() { disposed = true; cleanup(); pet.removeListener('closed', cleanup); if (!win.isDestroyed()) win.destroy(); },
  };
}
