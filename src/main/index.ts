import { app, Menu, nativeImage, Tray } from 'electron';
import { createPetWindow, initialPosition } from './windows';

app.setName('Jarvis Pet');
let tray: Tray | undefined;

if (!app.requestSingleInstanceLock()) {
  app.quit();
} else {
  app.whenReady().then(async () => {
    app.dock?.hide();
    const win = await createPetWindow();
    const reset = () => {
      const position = initialPosition();
      win.setPosition(position.x, position.y);
      win.showInactive();
    };
    // A text tray item avoids adding a temporary image library or final brand icon.
    tray = new Tray(nativeImage.createEmpty());
    tray.setTitle('알');
    tray.setToolTip('Jarvis Pet · 임시 알');
    tray.setContextMenu(Menu.buildFromTemplate([
      { label: 'Jarvis Pet · 임시 알', enabled: false },
      { label: '알을 처음 위치로', click: reset },
      { type: 'separator' },
      { label: 'Jarvis Pet 종료', click: () => app.quit() },
    ]));
    app.on('second-instance', reset);
    app.on('activate', () => win.showInactive());
    win.on('closed', () => app.quit());
    console.log('Jarvis Pet: 임시 알 실행 중. 메뉴 막대의 “알”에서 종료할 수 있습니다.');
  }).catch(error => {
    console.error('임시 알 실행 실패:', error);
    app.exit(1);
  });
}
app.on('window-all-closed', () => app.quit());
app.on('before-quit', () => tray?.destroy());
