const path = require('node:path');
const { randomUUID } = require('node:crypto');
const { fork } = require('node:child_process');
const messages = {
  APP_OR_PROFILE_IN_USE: '펫이 아직 실행 중이거나 자료를 사용하고 있습니다. 펫 메뉴에서 정상 종료한 뒤 다시 눌러 주세요.',
  CONFIRM_CLEAN_EXIT_REQUIRED: '펫을 메뉴에서 정상 종료한 뒤 확인란을 선택해 주세요.',
  PATH_OVERLAP: '펫 원본이나 백업 안에는 저장할 수 없습니다. 다른 보관 폴더를 선택해 주세요.',
  TARGET_EXISTS: '같은 이름의 폴더가 이미 있습니다. 기존 폴더는 보존했습니다. 다시 시도하면 새 이름을 사용합니다.',
  UNSUPPORTED_LAUNCHER: '이 앱의 실행 방식은 아직 지원하지 않습니다. 평소 사용하는 Jarvis Pet 앱을 선택해 주세요.',
  EXTERNAL_APPEARANCE_UNSUPPORTED: '별도 외형 시험 앱은 아직 지원하지 않습니다.',
  PROFILE_LOCK_PRESENT: '펫의 실행 흔적이 남아 있습니다. 파일을 삭제하지 말고 종료 상태를 점검해 주세요.',
  UNKNOWN_STORE_FILE_OR_SIDECAR: '아직 정리되지 않았거나 지원하지 않는 저장 파일이 있습니다. 파일을 삭제하지 말고 점검을 요청해 주세요.',
  UNKNOWN_PROFILE_FILE: '보호 범위가 확인되지 않은 파일이 있어 중단했습니다. 파일을 삭제하지 말고 점검을 요청해 주세요.',
  ENOSPC: '저장 공간이 부족합니다. 여유 공간이 있는 다른 보관 폴더를 선택해 주세요.',
  EACCES: '선택한 폴더에 접근할 수 없습니다. 접근 가능한 다른 폴더를 선택해 주세요.',
  EPERM: '선택한 폴더에 접근할 수 없습니다. 접근 가능한 다른 폴더를 선택해 주세요.',
};
function runWorker(action, options) {
  return new Promise((resolve, reject) => {
    const child = fork(path.join(__dirname, 'worker.mjs'), [], { env: { ...process.env, ELECTRON_RUN_AS_NODE: '1' }, silent: true });
    // Native stderr may contain paths or values. Do not forward it to the UI/log.
    child.stdout.resume(); child.stderr.resume();
    let reply, finished = false;
    child.once('message', message => { reply = message; });
    child.once('error', () => { finished = true; reject(new Error('WORKER_FAILED')); });
    child.once('exit', code => {
      if (finished) return;
      if (code === 0 && reply?.ok) resolve(reply.result);
      else reject(new Error(reply?.code ?? 'WORKER_FAILED'));
    });
    child.send({ action, options });
  });
}
class BackupController {
  constructor({ choose, worker = runWorker, remember = () => {}, reveal = () => {}, initialApp = null }) {
    Object.assign(this, { choose, worker, remember, reveal });
    this.state = { app: initialApp, backup: null, backupParent: null, restoreParent: null, busy: false, result: null, error: null, notice: '' };
    this.output = null;
  }
  snapshot() { return structuredClone(this.state); }
  async dispatch(action, value) {
    if (this.state.busy) return this.snapshot();
    this.state.busy = true; this.state.error = null;
    try {
      if (action === 'initialize') {
        if (this.state.app) { try { await this.worker('inspect', { app: this.state.app }); } catch { this.state.app = null; } }
        if (!this.state.app) {
          const { apps } = await this.worker('discover', {});
          if (apps.length === 1) { this.state.app = apps[0]; this.remember(apps[0]); }
          if (apps.length > 1) this.state.notice = '실행 중인 펫이 여러 개입니다. 백업할 앱을 직접 선택해 주세요.';
        }
      } else if (['app', 'backup', 'backupParent', 'restoreParent'].includes(action)) {
        const selected = await this.choose(action);
        if (selected) {
          if (action === 'app') { await this.worker('inspect', { app: selected }); this.remember(selected); }
          this.state[action] = selected; this.state.result = null; this.output = null;
        }
      } else if (action === 'backupNow' || action === 'restoreNow') {
        const backup = action === 'backupNow';
        const parent = backup ? this.state.backupParent : this.state.restoreParent;
        const source = backup ? this.state.app : this.state.backup;
        if (!source || !parent) throw new Error('SELECTION_REQUIRED');
        if (backup && value !== true) throw new Error('CONFIRM_CLEAN_EXIT_REQUIRED');
        this.state.result = null; this.output = null;
        const name = `Jarvis-${backup ? '백업' : '복원'}-${new Date().toISOString().replace(/[:.]/g, '-')}-${randomUUID().slice(0, 8)}`;
        const to = path.join(parent, name);
        const result = await this.worker(backup ? 'backup' : 'restore', backup ? { app: source, to, confirmClosed: true } : { backup: source, to });
        this.output = backup ? result.backup : result.restored;
        this.state.result = { kind: backup ? 'backup' : 'restore', folder: this.output };
      } else if (action === 'reveal') { if (this.output) this.reveal(this.output); }
      else throw new Error('UNKNOWN_ACTION');
    } catch (error) {
      const code = /^[A-Z][A-Z0-9_]{1,80}$/.test(error.message) ? error.message : 'OPERATION_FAILED';
      this.state.error = { code, message: messages[code] ?? (code === 'SELECTION_REQUIRED' ? '먼저 앱과 보관 폴더를 선택해 주세요.' : '완료하지 못했습니다. 원본과 기존 백업은 보존했습니다. 새로 생긴 미완료 폴더는 사용하지 말고 아래 오류 번호와 함께 점검을 요청해 주세요.') };
    } finally { this.state.busy = false; }
    return this.snapshot();
  }
}
module.exports = { BackupController, runWorker };
