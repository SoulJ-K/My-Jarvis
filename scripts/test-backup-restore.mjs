// Reproducible synthetic-only check. Never runs npm start or resolves real userData.
import { spawnSync } from 'node:child_process';
import { copyFileSync, mkdirSync, mkdtempSync, readdirSync, realpathSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import electron from 'electron';

const root = fileURLToPath(new URL('../', import.meta.url));
const parent = path.join(root, '.local'); mkdirSync(parent, { recursive: true });
const run = realpathSync(mkdtempSync(path.join(parent, 'backup-validation-')));
const runtime = path.join(run, 'runtime');
console.log(`검사 기록과 합성 자료: ${run}`);
function execute(name, executable, args, env = process.env) {
  const result = spawnSync(executable, args, { cwd: root, env, encoding: 'utf8', timeout: 120000 });
  writeFileSync(path.join(run, `${name}.stdout.log`), result.stdout ?? '', { flag: 'wx' });
  writeFileSync(path.join(run, `${name}.stderr.log`), result.stderr ?? '', { flag: 'wx' });
  writeFileSync(path.join(run, `${name}.result.json`), JSON.stringify({ status: result.status,
    signal: result.signal, error: result.error?.code ?? null }, null, 2), { flag: 'wx' });
  process.stdout.write(result.stdout ?? ''); process.stderr.write(result.stderr ?? '');
  if (result.error || result.status !== 0) process.exit(1);
}
execute('compile', process.execPath, [path.join(root, 'node_modules/typescript/bin/tsc'), '--outDir', runtime]);
const renderer = path.join(root, 'src/renderer');
for (const file of readdirSync(renderer).filter(file => /\.(html|css)$/.test(file))) {
  copyFileSync(path.join(renderer, file), path.join(runtime, 'src/renderer', file));
}
execute('backup-restore', electron, ['--test', path.join(runtime, 'tests/backup-restore.test.js')],
  { ...process.env, ELECTRON_RUN_AS_NODE: '1', JARVIS_BACKUP_TEST_ROOT: run, TZ: 'Asia/Seoul' });
console.log('합성 백업·복구 검사 통과. 실제 펫 자료·실행 중 백업·운영체제 알림 권한 복원은 미검증입니다.');
