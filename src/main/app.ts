import { PanelController } from '../assistant/panel-controller';
import { FollowupService } from '../assistant/followup';
import { FollowupRepository } from '../storage/followup-repository';
import { selectMenuTimer, formatMenuTimer } from '../shared/timer';
import { createResultCardWindow } from './result-card-window';
import { notificationQueue } from './notification-queue';
import { Notification } from 'electron';
import type { FollowupNotice } from '../shared/followup';
import { requestSnack } from './snack-flow';
import { BabyLifeRepository } from '../storage/baby-life-repository';
import { app, dialog, Menu, nativeImage, powerMonitor, Tray, type BrowserWindow } from 'electron';
import { openEggLife } from '../storage/egg-life-repository';
import { createPetWindow, initialPosition, placeBabyAfterHatch, recordPetDiagnostic, refreshBabyPresentation } from './windows';
import { TimerRepository } from '../storage/timer-repository';
import { TimerService } from '../assistant/timer';
import { ReminderService, type NotifySchedule } from '../assistant/reminders';
import { ScheduleRepository } from '../storage/schedule-repository';
import { scheduleNotifications, timerNotifications } from './notifications';
import { createPromptWindows } from './prompt-window';
import { loadOrCreateEgg, PetStorageError } from '../storage/pet-repository';
import { LifecycleRepository } from '../storage/lifecycle-repository';
import { createHatchWindow } from './hatch-window';
import { DEFAULT_HATCH_READINESS_POLICY, type HatchReadinessPolicy } from '../pet/lifecycle';

// Test entry points call this same startup with isolated userData and hidden windows.
// No test settings or storage paths are exposed to the renderer.
export function startJarvis(options: {
  show?: boolean;
  /** Main-only optional geometry for isolated appearance trials. */
  appearanceTrial?: import('./windows').PetAppearanceTrial;
  notifySchedule?: NotifySchedule;
  /** Override the approved product policy only in isolated main-process checks. */
  hatchPolicy?: HatchReadinessPolicy;
  eggNow?: () => number;
  onReady?: (win: BrowserWindow) => Promise<void>;
  onFailure?: (code: string) => void;
} = {}): void {
  const show = options.show ?? true;
  const hatchPolicy = options.hatchPolicy ?? DEFAULT_HATCH_READINESS_POLICY;
  app.setName('Jarvis Pet');
  let tray: Tray | undefined;
  let win: BrowserWindow | undefined;
  let cleanupTimers: (() => void) | undefined;
  let hatch: Awaited<ReturnType<typeof createHatchWindow>> | undefined;
  let hatching = false;
  let quitting = false;
  let currentStage: 'egg' | 'baby' = 'egg';
  let syncHatch = async () => {};
  let hatchHasStarted = () => false;
  const openHatch = () => {
    if (!show || quitting) return;
    void syncHatch().then(() => { hatch?.open(); })
      .catch(() => console.error('첫 만남 창 오류: HATCH_WINDOW_FAILED'));
  };
  const showPet = () => {
    if (!show || quitting) return;
    // Activation can resume a witnessed sequence, but is never its first start.
    if (hatching && hatchHasStarted()) openHatch();
    else win?.showInactive();
  };
  if (!app.requestSingleInstanceLock()) {
    app.quit();
    return;
  }
  const reset = () => {
    if (!win || win.isDestroyed()) return;
    const position = initialPosition(currentStage);
    win.setPosition(position.x, position.y);
    if (win.webContents.isCrashed()) {
      recordPetDiagnostic('pet_renderer_manual_reload');
      win.reload();
    }
    showPet();
  };
  app.on('second-instance', reset);
  app.on('activate', showPet);
  app.on('window-all-closed', () => {
    if (!quitting) recordPetDiagnostic('all_windows_closed_unexpectedly');
    app.quit();
  });
  app.on('before-quit', () => {
    recordPetDiagnostic('app_quit_requested');
    quitting = true; cleanupTimers?.(); cleanupTimers = undefined; hatch?.dispose(); tray?.destroy();
  });
  app.whenReady().then(async () => {
    app.dock?.hide();
    // Persistence must succeed before an egg window can exist.
    const pet = loadOrCreateEgg(app.getPath('userData'));
    // Product readiness uses committed elapsed/care evidence, never the test seed.
    const lifecycle = new LifecycleRepository(app.getPath('userData'), {
      // User-selected first-name policy: trim outer whitespace, 1–20 code points.
      namePolicy: { trim: true, maxCodePoints: 20 },
    });
    let state = lifecycle.read();
    currentStage = state.stage;
    hatchHasStarted = () => lifecycle.read().completed !== null;
    const eggNow = options.eggNow ?? Date.now;
    hatching = state.ready && state.name === null;
    const baby = new BabyLifeRepository(app.getPath('userData'));
    const previousBabyObservation = baby.read()?.observedAtMs ?? null;
    let panels: Awaited<ReturnType<typeof createPromptWindows>> | undefined;
    let cardWindow: Awaited<ReturnType<typeof createResultCardWindow>> | undefined;
    let service: TimerService | undefined;
    let schedules: ReminderService | undefined;
    let followups: FollowupService | undefined;
    let controller: PanelController | undefined;
    let refreshAll = () => {};
    const hiddenBackend = { isSupported: () => false, create: () => { throw new Error('HIDDEN_NOTIFICATION_DISABLED'); } };
    const acknowledgeNotification = (item: {kind:'timer'|'alarm'|'reminder';id:string}, round:number) => {
      if (controller?.acknowledge(item,round) && currentStage==='baby') panels?.hideForResult();
    };
    const notifications = timerNotifications(undefined, {
      ...(show ? {} : {backend:hiddenBackend}),
      onClick: item => { if (item) acknowledgeNotification({kind:'timer',id:item.id},0); },
    });
    const scheduleNotices = scheduleNotifications(undefined, {
      ...(show && !options.notifySchedule ? {} : {backend:hiddenBackend}),
      onClick: item => { acknowledgeNotification({kind:item.kind,id:item.id},0); },
    });
    const followNotices = notificationQueue<FollowupNotice>(item => ({
      title: 'Jarvis Pet · 다시 알려드려요', body:item.title, silent:false,
    }), undefined, {backend: show ? {isSupported:()=>Notification.isSupported(),create:values=>new Notification(values)} : hiddenBackend,
      onClick:item=>{acknowledgeNotification(item,item.round);} });
    try {
      service = new TimerService(new TimerRepository(app.getPath('userData')),
        {wall:()=>Date.now(),monotonic:()=>performance.now()}, notifications.notify, ()=>refreshAll());
      try {
        schedules = new ReminderService(new ScheduleRepository(app.getPath('userData')),Date.now,
          options.notifySchedule ?? scheduleNotices.notify,()=>refreshAll());
      } catch {
        console.error('알람 저장소 오류: SCHEDULE_STORAGE_FAILED');
        if (show) dialog.showErrorBox('알람을 열지 못했습니다','기존 알람 자료는 보존합니다. 타이머는 계속 사용할 수 있습니다.');
      }
      followups = new FollowupService(new FollowupRepository(app.getPath('userData')),Date.now,()=>refreshAll());
      controller = new PanelController(service,schedules,followups,()=>state.stage,()=>refreshAll(),
        async ()=>state.stage==='baby' ? requestSnack(baby,panels?.prompt,show) : {ok:false,message:'아기가 된 뒤에 간식을 줄 수 있어요.'});
      controller.sync();
      baby.setAttention(controller.attention());
    } catch {
      service?.dispose(); service=undefined; schedules?.dispose(); schedules=undefined; followups?.dispose(); followups=undefined;
      console.error('입력 저장소 오류: ASSISTANT_STORAGE_FAILED');
      if (show) dialog.showErrorBox('입력을 열지 못했습니다','기존 저장 자료를 보존한 채 입력 기능을 멈췄습니다.');
    }
    const life = openEggLife(app.getPath('userData'), eggNow);
    let refreshTray = () => {};
    const checkpoint = () => {
      try {
        if (!state.ready) {
          state = lifecycle.prepareIfReady(hatchPolicy, eggNow());
        }
        hatching = state.ready && state.name === null;
        // Readiness never opens a scene or records a witness. Only the user's
        // tray request starts the existing explicitly paced sequence.
        if (!quitting) {
          void syncHatch().catch(() => console.error('첫 만남 창 오류: HATCH_WINDOW_FAILED'));
          refreshTray();
        }
      } catch { console.error('알 생활 저장 실패: WRITE_FAILED'); }
    };
    checkpoint();
    const timer = setInterval(checkpoint, 60_000);
    powerMonitor.on('resume', checkpoint);
    app.once('will-quit', () => {
      clearInterval(timer); powerMonitor.removeListener('resume', checkpoint);
      syncHatch = async () => {}; refreshTray = () => {};
      checkpoint(); life.close(); lifecycle.close(); baby.close();
    });
    win = await createPetWindow(pet, show && (!hatching || state.completed === null), kind => {
      // Waiting for an explicit start is still egg life; readiness is not a care lock.
      if (lifecycle.read().completed !== null) throw new Error('EGG_CARE_ENDED');
      life.care(kind);
      checkpoint();
    }, () => ({ ...pet, stage: state.stage, ...(state.name !== null ? { name: state.name } : {}) }), baby,
    () => panels?.open(), () => !quitting, show ? async () => {
      const reply=await requestSnack(baby,win,true);
      if(win && !win.isDestroyed()) await dialog.showMessageBox(win,{type:reply.ok?'info':'warning',title:'휴지통 간식',message:reply.message,buttons:['확인']});
    } : undefined, previousBabyObservation, undefined, options.appearanceTrial);
    win.on('closed', () => {
      if (!quitting) recordPetDiagnostic('pet_window_closed_unexpectedly');
      app.quit();
    });
    let creatingHatch: Promise<void> | undefined;
    syncHatch = () => {
      if (quitting || !hatching || hatch) return Promise.resolve();
      if (creatingHatch) return creatingHatch;
      creatingHatch = createHatchWindow(lifecycle, win!, show, (saved, babyPosition) => {
        state = saved;
        currentStage = saved.stage;
        hatching = false;
        placeBabyAfterHatch(win!, babyPosition);
        // The idle pet must load its committed baby snapshot before becoming visible.
        win!.setTitle('Jarvis Pet · 아기');
        win!.webContents.once('did-finish-load', showPet);
        win!.reload();
        refreshAll();
      }).then(created => {
        if (quitting) created.dispose();
        else hatch = created;
      }).finally(() => { creatingHatch = undefined; });
      return creatingHatch;
    };
    await syncHatch();
    if (service && controller && followups) {
      const timerService=service, results=followups, joined=controller;
      cardWindow=await createResultCardWindow(win);
      panels = await createPromptWindows(service,show,schedules,command=>{
        if (state.stage!=='baby' || !state.name) return null;
        baby.apply(command); refreshBabyPresentation(win!);
        return '아기의 몸짓과 감정구슬을 봐 주세요.';
      }, {card:cardWindow.win,cardPage:cardWindow.page,api:{
        read:async()=>joined.state(),action:action=>joined.action(action),
        submitTimer:async(id,input,mode,replace)=>joined.submitTimer(id,input,mode,replace),
        snack:()=>joined.snack(),
      }});
      let refreshing=false;
      refreshAll=()=>{
        if (quitting || refreshing) return;
        refreshing=true;
        try {
          joined.sync(); baby.setAttention(joined.attention()); panels?.refresh();
          cardWindow?.refresh(show && state.stage==='baby' && !hatching && joined.state().card!==null);
          refreshTray();
        } catch { console.error('일정 연결 오류: ASSISTANT_REFRESH_FAILED'); }
        finally {refreshing=false;}
      };
      const tick=()=>{
        try {timerService.tick();} catch {console.error('타이머 저장 오류: TIMER_TICK_FAILED');}
        try {schedules?.tick();} catch {console.error('알람 저장 오류: SCHEDULE_TICK_FAILED');}
        try {
          joined.sync();
          for (const notice of results.tick()) followNotices.notify(notice,outcome=>results.delivery(notice,notice.round,outcome));
        } catch {console.error('재알림 저장 오류: FOLLOWUP_TICK_FAILED');}
        refreshAll();
      };
      const interval=setInterval(tick,500);
      const resume=()=>{try {timerService.resume();} catch {console.error('타이머 복원 오류: TIMER_RESUME_FAILED');} tick();};
      const suspend=()=>timerService.suspend();
      powerMonitor.on('suspend',suspend); powerMonitor.on('resume',resume);
      cleanupTimers=()=>{
        clearInterval(interval); powerMonitor.removeListener('suspend',suspend); powerMonitor.removeListener('resume',resume);
        notifications.dispose(); scheduleNotices.dispose(); followNotices.dispose();
        panels?.dispose();cardWindow?.dispose();timerService.dispose();schedules?.dispose();results.dispose();
      };
      tick();
    } else cleanupTimers=()=>{notifications.dispose();scheduleNotices.dispose();followNotices.dispose();};
    if (show) {
      tray = new Tray(nativeImage.createEmpty());
      let previousMenu = '';
      refreshTray = () => {
        const label = state.name ?? (hatching ? '부화 준비' : '알');
        const displayed = service ? selectMenuTimer(service.views()) : null;
        tray!.setTitle(displayed ? formatMenuTimer(displayed) : label);
        tray!.setToolTip(`Jarvis Pet · ${label}`);
        const menuKey=JSON.stringify([label,hatching,lifecycle.read().completed,Boolean(panels)]);
        if(menuKey===previousMenu)return;
        previousMenu=menuKey;
        tray!.setContextMenu(Menu.buildFromTemplate([
          { label: `Jarvis Pet · ${label}`, enabled: false },
          { label: hatching ? (lifecycle.read().completed === null ? '부화 함께 보기' : '첫 만남 이어보기') : '펫을 처음 위치로', click: hatching ? openHatch : reset },
          { label: '입력 / 타이머', enabled: Boolean(panels), click: () => panels?.open() },
          { type: 'separator' },
          { label: 'Jarvis Pet 종료', click: () => app.quit() },
        ]));
      };
      refreshTray();
      console.log('Jarvis Pet: 저장된 펫 실행 중. 메뉴 막대에서 종료할 수 있습니다.');
    }
    recordPetDiagnostic('app_ready');
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
