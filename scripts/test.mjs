import { spawnSync } from 'node:child_process';
import electron from 'electron';

// Use Electron's bundled Node for SQLite tests, not the shell's Node installation.
for (const [args, asNode] of [
  [['--test', 'dist/tests/brain.test.js'], true],
  [['--test', 'dist/tests/storage.test.js'], true],
  [['--test', 'dist/tests/startup.test.js'], true],
  [['dist/tests/egg-smoke.js'], false],
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
