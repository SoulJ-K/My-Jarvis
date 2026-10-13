import { backupApplication, inspectApplication, restoreApplication, verifyBackup } from './lib/manual-backup.mjs';

const help = `Jarvis Pet 수동 백업·복원 (macOS, Node.js 24 이상)
  node scripts/pet-backup.mjs inspect --app '/절대경로/Jarvis Pet.app'
  node scripts/pet-backup.mjs backup --app '/절대경로/Jarvis Pet.app' --to '/절대경로/새-백업' --confirm-closed
  node scripts/pet-backup.mjs verify --backup '/절대경로/백업'
  node scripts/pet-backup.mjs restore --backup '/절대경로/백업' --to '/절대경로/새-복원'

inspect는 실행 코드의 저장 위치만 확인합니다. DB를 열거나 앱을 실행하지 않습니다.
backup은 앱 메뉴로 정상 종료한 후에만 사용하세요. 작업 중 다시 실행하지 마세요.
기존 대상은 빈 폴더라도 거절합니다. 새 대상의 부모 폴더는 이미 있어야 합니다.
저장 자료와 앱 안의 외형·실행 코드를 함께 보존합니다. 별도 외형 시험 실행기는 미지원입니다.
복원은 새 사본만 만들고 앱 실행·등록·권한 변경은 하지 않습니다.
백업은 암호화되지 않습니다. 본인이 만든 신뢰하는 백업만 사용하세요.
`;
const messages = {
  CONFIRM_CLEAN_EXIT_REQUIRED: '앱 메뉴로 정상 종료한 것을 확인한 뒤 --confirm-closed를 지정해 주세요.',
  APP_OR_PROFILE_IN_USE: '앱 또는 저장 자료가 사용 중입니다. 앱을 강제 종료하지 말고 정상 종료 후 다시 시도해 주세요.',
  PROFILE_LOCK_PRESENT: '실행 잠금이 남아 있습니다. 자동 삭제하지 않습니다. 종료 상태부터 확인해 주세요.',
  CLOSED_CHECK_FAILED: '사용 중인지 확인하지 못해 중단했습니다.',
  PATH_OVERLAP: '원본·백업과 대상 위치가 겹칩니다. 서로 분리된 새 위치를 지정해 주세요.',
  TARGET_EXISTS: '대상이 이미 있습니다. 기존 사본을 보존하고 새 이름을 지정해 주세요.',
  UNSUPPORTED_LAUNCHER: '지원하지 않는 실행 구성입니다. 외부 설정·외형을 누락하지 않도록 중단했습니다.',
  EXTERNAL_APPEARANCE_UNSUPPORTED: '별도 외형 시험 자료입니다. 이 실행 구성의 복원 연결은 아직 지원하지 않습니다.',
  UNKNOWN_PROFILE_FILE: '확인되지 않은 저장 파일이 있습니다. 백업 범위를 조사하기 전에는 진행하지 않습니다.',
  UNKNOWN_STORE_FILE_OR_SIDECAR: '확인되지 않은 파일 또는 SQLite 미정리 파일이 있습니다. 삭제하지 말고 상태를 확인해 주세요.',
};
try {
  if (Number(process.versions.node.split('.')[0]) < 24) throw new Error('NODE_24_REQUIRED');
  const [action, ...args] = process.argv.slice(2);
  if (!action || action === '--help') { console.log(help); }
  else {
    const allowed = { inspect: ['--app'], backup: ['--app','--to','--confirm-closed'], verify: ['--backup'], restore: ['--backup','--to'] }[action];
    if (!allowed) throw new Error('USAGE');
    const options = {};
    for (let i = 0; i < args.length; i++) {
      const key = args[i];
      if (!allowed.includes(key) || Object.hasOwn(options, key)) throw new Error('USAGE');
      if (key === '--confirm-closed') options[key] = true;
      else { if (!args[i + 1] || args[i + 1].startsWith('--')) throw new Error('USAGE'); options[key] = args[++i]; }
    }
    for (const key of allowed.filter(k => k !== '--confirm-closed')) if (!options[key]) throw new Error('USAGE');
    let result;
    if (action === 'inspect') result = inspectApplication(options['--app']);
    if (action === 'backup') result = backupApplication({ app: options['--app'], to: options['--to'], confirmClosed: options['--confirm-closed'] });
    if (action === 'verify') {
      const checked = verifyBackup(options['--backup']);
      result = { backup: checked.root, verified: true, files: Object.keys(checked.manifest.profileFiles).length, appearance: checked.manifest.application.appearance };
    }
    if (action === 'restore') result = restoreApplication({ backup: options['--backup'], to: options['--to'] });
    console.log(JSON.stringify(result, null, 2));
  }
} catch (error) {
  // Native/SQLite messages can contain file paths or values. Emit a bounded code
  // only, never stack traces, SQL rows, names, schedules or subprocess stderr.
  const code = /^[A-Z][A-Z0-9_]{1,80}$/.test(error.message) ? error.message : /^[A-Z][A-Z0-9_]{1,80}$/.test(error.code) ? error.code : 'BACKUP_OPERATION_FAILED';
  console.error(`${code}: ${messages[code] ?? '처리를 완료하지 못했습니다. 원본은 보존하며, 새 대상에 INCOMPLETE가 있으면 사용하지 마세요.'}`);
  if (code === 'USAGE') console.error(help);
  process.exitCode = 1;
}
