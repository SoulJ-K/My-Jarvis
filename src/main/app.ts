import { app, dialog, Menu, nativeImage, powerMonitor, Tray, type BrowserWindow } from 'electron';
import { openEggLife } from '../storage/egg-life-repository';
import { createPetWindow, initialPosition } from './windows';
import { TimerRepository } from '../storage/timer-repository';
import { TimerService } from '../assistant/timer';
import { ReminderService, type NotifySchedule } from '../assistant/reminders';
import { ScheduleRepository } from '../storage/schedule-repository';
import { scheduleNotifications, timerNotifications } from './notifications';
import { createPromptWindows } from './prompt-window';
import { loadOrCreateEgg, PetStorageError } from '../storage/pet-repository';
import { LifecycleRepository } from '../storage/lifecycle-repository';
import { createHatchWindow } from './hatch-window';

// Test entry points call this same startup with isolated userData and hidden windows.
// No test settings or storage paths are exposed to the renderer.
export function startJarvis(options: {
  show?: boolean;
  notifySchedule?: NotifySchedule;
  onReady?: (win: BrowserWindow) => Promise<void>;
  onFailure?: (code: string) => void;
} = {}): void {
  const show = options.show ?? true;
  app.setName('Jarvis Pet');
  let tray: Tray | undefined;
  let win: BrowserWindow | undefined;
  let cleanupTimers: (() => void) | undefined;
  let hatch: Awaited<ReturnType<typeof createHatchWindow>> | undefined;
  let hatching = false;
  const showPet = () => {
    if (!show) return;
    if (hatching) hatch?.open();
    else win?.showInactive();
  };
  if (!app.requestSingleInstanceLock()) {
    app.quit();
    return;
  }
  const reset = () => {
    if (!win || win.isDestroyed()) return;
    const position = initialPosition();
    win.setPosition(position.x, position.y);
    showPet();
  };
  app.on('second-instance', reset);
  app.on('activate', showPet);
  app.on('window-all-closed', () => app.quit());
  app.on('before-quit', () => { cleanupTimers?.(); cleanupTimers = undefined; hatch?.dispose(); tray?.destroy(); });
  app.whenReady().then(async () => {
    app.dock?.hide();
    // Persistence must succeed before an egg window can exist.
    const pet = loadOrCreateEgg(app.getPath('userData'));
    // No development trigger is supplied: ordinary launches cannot mark an egg ready.
    const lifecycle = new LifecycleRepository(app.getPath('userData'), {
      // User-selected first-name policy: trim outer whitespace, 1–20 code points.
      namePolicy: { trim: true, maxCodePoints: 20 },
    });
    let state = lifecycle.read();
    hatching = state.ready && state.name === null;
    const life = openEggLife(app.getPath('userData'));
    const checkpoint = () => {
      if (state.ready) return;
      try { life.checkpoint(); } catch { console.error('알 생활 저장 실패: WRITE_FAILED'); }
    };
    if (!state.ready) life.checkpoint();
    const timer = setInterval(checkpoint, 60_000);
    app.once('will-quit', () => { clearInterval(timer); checkpoint(); life.close(); lifecycle.close(); });
    win = await createPetWindow(pet, show && !hatching, kind => {
      if (state.ready) throw new Error('EGG_CARE_ENDED');
      life.care(kind);
    }, () => ({ ...pet, stage: state.stage, ...(state.name !== null ? { name: state.name } : {}) }));
    win.on('closed', () => app.quit());
    let refreshTray = () => {};
    if (hatching) {
      hatch = await createHatchWindow(lifecycle, show, saved => {
        state = saved;
        hatching = false;
        // The idle pet must load its committed baby snapshot before becoming visible.
        win!.setTitle('Jarvis Pet · 아기');
        win!.webContents.once('did-finish-load', showPet);
        win!.reload();
        refreshTray();
      });
      hatch.open();
    }
    const notifications = timerNotifications(undefined, show ? {} : {
      backend: { isSupported: () => false, create: () => { throw new Error('HIDDEN_NOTIFICATION_DISABLED'); } },
    });
    // Hidden automated runs never request macOS notification permission.
    const scheduleNotices = show && !options.notifySchedule ? scheduleNotifications() : undefined;
    let panels: Awaited<ReturnType<typeof createPromptWindows>> | undefined;
    let service: TimerService | undefined;
    let schedules: ReminderService | undefined;
    try {
      service = new TimerService(new TimerRepository(app.getPath('userData')),
        { wall: () => Date.now(), monotonic: () => performance.now() }, notifications.notify,
        () => panels?.refresh());
      try {
        schedules = new ReminderService(new ScheduleRepository(app.getPath('userData')), () => Date.now(),
          options.notifySchedule ?? scheduleNotices?.notify, () => panels?.refresh());
      } catch {
        console.error('알람 저장소 오류: SCHEDULE_STORAGE_FAILED');
        if (show) dialog.showErrorBox('알람을 열지 못했습니다', '알람 저장소를 읽지 못했습니다. 기존 파일과 타이머·알은 보존합니다.');
      }
      panels = await createPromptWindows(service, show, schedules);
      const timerService = service;
      const tick = () => { try { timerService.tick(); } catch { console.error('타이머 저장 오류: TIMER_TICK_FAILED'); } };
      const scheduleTick = () => { try { schedules?.tick(); } catch { console.error('알람 저장 오류: SCHEDULE_TICK_FAILED'); } };
      const interval = setInterval(() => { tick(); scheduleTick(); }, 500);
      const resume = () => { try { timerService.resume(); } catch { console.error('타이머 복원 오류: TIMER_RESUME_FAILED'); } };
      const suspend = () => timerService.suspend();
      powerMonitor.on('suspend', suspend);
      powerMonitor.on('resume', resume);
      powerMonitor.on('resume', scheduleTick);
      cleanupTimers = () => { clearInterval(interval); powerMonitor.removeListener('suspend', suspend); powerMonitor.removeListener('resume', resume); powerMonitor.removeListener('resume', scheduleTick); notifications.dispose(); scheduleNotices?.dispose(); panels?.dispose(); timerService.dispose(); schedules?.dispose(); };
      panels.refresh();
    } catch {
      notifications.dispose(); scheduleNotices?.dispose(); service?.dispose(); schedules?.dispose();
      console.error('타이머를 열지 못했습니다: TIMER_STORAGE_FAILED');
      if (show) dialog.showErrorBox('타이머를 열지 못했습니다', '타이머 저장소를 읽지 못해 입력 기능을 멈췄습니다. 기존 파일과 알은 보존합니다.');
    }
    if (show) {
      tray = new Tray(nativeImage.createEmpty());
      refreshTray = () => {
        const label = state.name ?? (hatching ? '첫 만남' : '알');
        tray!.setTitle(label);
        tray!.setToolTip(`Jarvis Pet · ${label}`);
        tray!.setContextMenu(Menu.buildFromTemplate([
          { label: `Jarvis Pet · ${label}`, enabled: false },
          { label: hatching ? '첫 만남 이어보기' : '펫을 처음 위치로', click: reset },
          { label: '입력 / 타이머', enabled: Boolean(panels), click: () => panels?.open() },
          { type: 'separator' },
          { label: 'Jarvis Pet 종료', click: () => app.quit() },
        ]));
      };
      refreshTray();
      console.log('Jarvis Pet: 저장된 펫 실행 중. 메뉴 막대에서 종료할 수 있습니다.');
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
