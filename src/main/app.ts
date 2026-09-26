import { app, dialog, Menu, nativeImage, powerMonitor, Tray, type BrowserWindow } from 'electron';
import { openEggLife } from '../storage/egg-life-repository';
import { createPetWindow, initialPosition } from './windows';
import { TimerRepository } from '../storage/timer-repository';
import { TimerService } from '../assistant/timer';
import { timerNotifications } from './notifications';
import { createPromptWindows } from './prompt-window';
import { loadOrCreateEgg, PetStorageError } from '../storage/pet-repository';

// Test entry points call this same startup with isolated userData and hidden windows.
// No test settings or storage paths are exposed to the renderer.
export function startJarvis(options: {
  show?: boolean;
  onReady?: (win: BrowserWindow) => Promise<void>;
  onFailure?: (code: string) => void;
} = {}): void {
  const show = options.show ?? true;
  app.setName('Jarvis Pet');
  let tray: Tray | undefined;
  let win: BrowserWindow | undefined;
  let cleanupTimers: (() => void) | undefined;
  if (!app.requestSingleInstanceLock()) {
    app.quit();
    return;
  }
  const reset = () => {
    if (!win || win.isDestroyed()) return;
    const position = initialPosition();
    win.setPosition(position.x, position.y);
    if (show) win.showInactive();
  };
  app.on('second-instance', reset);
  app.on('activate', () => { if (show) win?.showInactive(); });
  app.on('window-all-closed', () => app.quit());
  app.on('before-quit', () => { cleanupTimers?.(); cleanupTimers = undefined; tray?.destroy(); });
  app.whenReady().then(async () => {
    app.dock?.hide();
    // Persistence must succeed before an egg window can exist.
    const pet = loadOrCreateEgg(app.getPath('userData'));
    const life = openEggLife(app.getPath('userData'));
    life.checkpoint();
    const checkpoint = () => {
      try { life.checkpoint(); } catch { console.error('알 생활 저장 실패: WRITE_FAILED'); }
    };
    const timer = setInterval(checkpoint, 60_000);
    app.once('will-quit', () => { clearInterval(timer); checkpoint(); life.close(); });
    win = await createPetWindow(pet, show, kind => life.care(kind));
    win.on('closed', () => app.quit());
    const notifications = timerNotifications();
    let panels: Awaited<ReturnType<typeof createPromptWindows>> | undefined;
    let service: TimerService | undefined;
    try {
      service = new TimerService(new TimerRepository(app.getPath('userData')),
        { wall: () => Date.now(), monotonic: () => performance.now() }, notifications.notify,
        () => panels?.refresh());
      panels = await createPromptWindows(service, show);
      const timerService = service;
      const tick = () => { try { timerService.tick(); } catch { console.error('타이머 저장 오류: TIMER_TICK_FAILED'); } };
      const interval = setInterval(tick, 500);
      const resume = () => { try { timerService.resume(); } catch { console.error('타이머 복원 오류: TIMER_RESUME_FAILED'); } };
      const suspend = () => timerService.suspend();
      powerMonitor.on('suspend', suspend);
      powerMonitor.on('resume', resume);
      cleanupTimers = () => { clearInterval(interval); powerMonitor.removeListener('suspend', suspend); powerMonitor.removeListener('resume', resume); notifications.dispose(); panels?.dispose(); timerService.dispose(); };
      panels.refresh();
    } catch {
      notifications.dispose(); service?.dispose();
      console.error('타이머를 열지 못했습니다: TIMER_STORAGE_FAILED');
      if (show) dialog.showErrorBox('타이머를 열지 못했습니다', '타이머 저장소를 읽지 못해 입력 기능을 멈췄습니다. 기존 파일과 알은 보존합니다.');
    }
    if (show) {
      tray = new Tray(nativeImage.createEmpty());
      tray.setTitle('알');
      tray.setToolTip('Jarvis Pet · 알');
      tray.setContextMenu(Menu.buildFromTemplate([
        { label: 'Jarvis Pet · 알', enabled: false },
        { label: '알을 처음 위치로', click: reset },
        { label: '입력 / 타이머', enabled: Boolean(panels), click: () => panels?.open() },
        { type: 'separator' },
        { label: 'Jarvis Pet 종료', click: () => app.quit() },
      ]));
      console.log('Jarvis Pet: 저장된 알 실행 중. 메뉴 막대의 “알”에서 종료할 수 있습니다.');
    }
    await options.onReady?.(win);
  }).catch(error => {
    const code = error instanceof PetStorageError ? error.code : 'START_FAILED';
    console.error(`Jarvis Pet 실행 실패: ${code}`);
    if (show) dialog.showErrorBox('알을 불러오지 못했습니다',
      '알 정보를 안전하게 저장하거나 읽을 수 없어 실행을 멈췄습니다.\n' +
      '기존 저장 파일을 삭제하거나 새 알로 바꾸지 않았습니다.\n' +
      '앱 데이터 폴더를 보존한 채 권한·저장 공간·복구 가능 여부를 확인해 주세요.\n' +
      `오류 코드: ${code}`);
    options.onFailure?.(code);
    app.exit(1);
  });
}
