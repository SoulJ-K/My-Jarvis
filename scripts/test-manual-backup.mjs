// Every invocation builds into a NEW workspace; never overwrites dist/out or
// opens the real user's profile. Uses only already-installed local tools.
import * as fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawnSync } from 'node:child_process';
const root = fileURLToPath(new URL('../', import.meta.url));
fs.mkdirSync(path.join(root, '.local'), { recursive: true });
const run = fs.realpathSync.native(fs.mkdtempSync(path.join(root, '.local/manual-backup-validation-')));
const project = path.join(run, 'project'); fs.mkdirSync(project); fs.mkdirSync(path.join(run, 'tmp'));
for (const folder of ['src', 'tests', 'scripts']) fs.cpSync(path.join(root, folder), path.join(project, folder), { recursive: true, errorOnExist: true, force: false });
for (const file of ['package.json', 'tsconfig.json']) fs.copyFileSync(path.join(root, file), path.join(project, file));
fs.symlinkSync(path.join(root, 'node_modules'), path.join(project, 'node_modules'));
console.log('합성 수동 백업 검사 위치: ' + run);
const env = { ...process.env, TZ: 'Asia/Seoul', TMPDIR: path.join(run, 'tmp') + '/', JARVIS_NATIVE_NOTIFICATION_TEST: '0',
  MANUAL_BACKUP_TEST_ROOT: run, MANUAL_BACKUP_ASSET: path.join(root, 'experiments/baby-appearance/materials/working/v002/leaf-stand-front.png') };
delete env.ELECTRON_RUN_AS_NODE;
for (const [label, cmd, args] of [
  ['build', 'npm', ['run', 'build']],
  ['manual-backup', process.execPath, ['--test', '--test-concurrency=1', 'tests/manual-backup.test.mjs']],
]) {
  const out = fs.openSync(path.join(run, label + '.stdout.log'), 'wx'), err = fs.openSync(path.join(run, label + '.stderr.log'), 'wx');
  const startedAt = Date.now();
  const result = spawnSync(cmd, args, { cwd: project, env, stdio: ['ignore', out, err], timeout: 300_000 });
  fs.closeSync(out); fs.closeSync(err);
  fs.writeFileSync(path.join(run, label + '.result.json'), JSON.stringify({ code: result.status, signal: result.signal,
    error: result.error?.code ?? null, seconds: (Date.now() - startedAt) / 1000 }, null, 2), { flag: 'wx' });
  console.log(label + ': ' + (result.status === 0 ? '통과' : '실패 (보존 로그 확인)'));
  if (result.error || result.status !== 0) { process.exitCode = 1; break; }
}
