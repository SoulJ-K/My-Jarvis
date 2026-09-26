import { spawnSync } from 'node:child_process';
import electron from 'electron';

// Use Electron's bundled Node for SQLite tests, not the shell's Node installation.
for (const [args, asNode] of [
  [['--test', 'dist/tests/brain.test.js', 'dist/tests/egg-life.test.js'], true],
  [['--test', 'dist/tests/lifecycle.test.js'], true],
  [['--test', 'dist/tests/baby-life.test.js'], true],
  [['dist/tests/baby-smoke.js'], false],
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
