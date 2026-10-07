import { spawnSync } from 'node:child_process';
import electron from 'electron';

// Use Electron's bundled Node for SQLite tests, not the shell's Node installation.
for (const [args, asNode] of [
  ...(process.platform === 'darwin' ? [[['dist/tests/dock-native-smoke.js'], false]] : []),
  [['--test', 'dist/tests/baby-v02.test.js', 'dist/tests/hatch-v02.test.js', 'dist/tests/dock-snack.test.js', 'dist/tests/trash-snack.test.js', 'dist/tests/trash-snack-selection.test.js'], true],
  [['dist/tests/v02-smoke.js'], false],
  [['--test', 'dist/tests/timer-v02.test.js', 'dist/tests/followup.test.js', 'dist/tests/notification-queue.test.js', 'dist/tests/v02-integration.test.js'], true],
  [['--test', 'dist/tests/brain.test.js', 'dist/tests/egg-life.test.js'], true],
  [['--test', 'dist/tests/lifecycle.test.js'], true],
  [['--test', 'dist/tests/baby-life.test.js', 'dist/tests/baby-social.test.js'], true],
  [['dist/tests/baby-smoke.js'], false],
  [['dist/tests/baby-social-smoke.js'], false],
  [['--test', 'dist/tests/three-way-integration.test.js'], true],
  [['--test', 'dist/tests/hatch-product.test.js'], true],
  [['--test', 'dist/tests/timer.test.js'], true],
  [['--test', 'dist/tests/reminders.test.js'], true],
  [['--test', 'dist/tests/schedule-restart.test.js'], true],
  [['--test', 'dist/tests/timer-restart.test.js'], true],
  [['--test', 'dist/tests/storage.test.js'], true],
  [['--test', 'dist/tests/startup.test.js'], true],
  [['dist/tests/egg-smoke.js'], false],
  [['dist/tests/window-behavior.js'], false],
  [['dist/tests/hatch-smoke.js'], false],
  [['dist/tests/notifications-checks.js'], false],
  [['dist/tests/timer-smoke.js'], false],
  [['dist/tests/schedule-smoke.js'], false],
]) {
  const env = { ...process.env };
  if (asNode) env.ELECTRON_RUN_AS_NODE = '1';
  else delete env.ELECTRON_RUN_AS_NODE;
  const result = spawnSync(electron, args, { env, stdio: 'inherit', timeout: 120_000 });
  if (result.error || result.status !== 0) {
    if (result.error) console.error(result.error.message);
    process.exit(result.status || 1);
  }
}
