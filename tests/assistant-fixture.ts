import { BrowserWindow } from 'electron';
import path from 'node:path';
import type { TimerService } from '../src/assistant/timer';
import type { ReminderService } from '../src/assistant/reminders';
import { PanelController } from '../src/assistant/panel-controller';
import { FollowupService } from '../src/assistant/followup';
import { FollowupRepository } from '../src/storage/followup-repository';
import type { AssistantPanelAPI } from '../src/shared/assistant-panel';

/** Only the caller's temporary directory; never opens a pet or a native notification. */
export function createAssistantFixture(directory: string, timers: TimerService, schedules: ReminderService,
  now: () => number, changed: () => void) {
  const followups = new FollowupService(new FollowupRepository(directory), now, changed);
  const controller = new PanelController(timers, schedules, followups, () => 'egg', changed,
    async () => ({ ok: false, message: '검사에서는 실제 간식을 실행하지 않습니다.' }), now);
  const cardPage = path.join(__dirname, '../src/renderer/result-card.html');
  const card = new BrowserWindow({ show: false, webPreferences: {
    preload: path.join(__dirname, '../src/preload/prompt.js'),
    sandbox: true, contextIsolation: true, nodeIntegration: false, webSecurity: true,
  } });
  const api: Omit<AssistantPanelAPI, 'subscribe'> = {
    read: async () => controller.state(),
    action: action => controller.action(action),
    submitTimer: async (id, input, mode, replace) => controller.submitTimer(id, input, mode, replace),
    snack: () => controller.snack(),
  };
  return {
    assistant: { api, card, cardPage }, controller, followups, card,
    // Load only after createPromptWindows registers the assistant IPC handlers.
    loadCard: () => card.loadFile(cardPage),
    dispose() { card.destroy(); followups.dispose(); },
  };
}
