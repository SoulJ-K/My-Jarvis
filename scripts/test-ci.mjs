import { spawnSync } from 'node:child_process';

// Explicit allowlist: other *.test.ts files launch Electron, even if their
// parent test uses node:test. Keep the full Electron suite in scripts/test.mjs.
const files = [
  'brain', 'egg-life', 'lifecycle', 'baby-social', 'timer', 'reminders', 'storage',
].map(name => `dist/tests/${name}.test.js`);

if (process.versions.electron || Number(process.versions.node.split('.')[0]) !== 24) {
  console.error('CI checks require standalone Node.js 24; use npm test for Electron coverage.');
  process.exit(1);
}
const result = spawnSync(process.execPath, [
  '--test', '--test-concurrency=1', '--test-timeout=60000', ...files,
], {
  // Repository social tests use epoch zero as daytime (09:00 in Korea).
  // Pin only this child process; never change the user's system timezone.
  env: { ...process.env, TZ: 'Asia/Seoul' },
  stdio: 'inherit', timeout: 120_000, killSignal: 'SIGKILL',
});
if (result.error) console.error(result.error.message);
if (result.signal) console.error(`CI checks terminated by ${result.signal}`);
process.exit(result.error || result.signal ? 1 : (result.status ?? 1));
