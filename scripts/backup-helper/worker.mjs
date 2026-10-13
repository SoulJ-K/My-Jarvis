import { execFileSync } from 'node:child_process';
import { backupApplication, inspectApplication, restoreApplication } from '../lib/manual-backup.mjs';
process.once('message', async ({ action, options }) => {
  try {
    let result;
    if (action === 'inspect') { const info = inspectApplication(options.app); result = { app: info.app }; }
    else if (action === 'discover') {
      // Executable metadata only. Never scan guessed userData locations.
      const lines = execFileSync('/bin/ps', ['-axo', 'comm='], { encoding: 'utf8', maxBuffer: 4 * 1024 * 1024 }).split('\n');
      const candidates = [...new Set(lines.filter(line => /\/Jarvis Pet\.app\/Contents\/MacOS\/Jarvis Pet$/.test(line)).map(line => line.replace(/\/Contents\/MacOS\/Jarvis Pet$/, '').trim()))];
      const apps = [];
      for (const candidate of candidates) { try { apps.push(inspectApplication(candidate).app); } catch {} }
      result = { apps };
    } else if (action === 'backup') result = backupApplication(options);
    else if (action === 'restore') result = restoreApplication(options);
    else throw new Error('UNKNOWN_ACTION');
    process.send({ ok: true, result }, () => process.exit(0));
  } catch (error) {
    const code = /^[A-Z][A-Z0-9_]{1,80}$/.test(error.message) ? error.message : /^[A-Z][A-Z0-9_]{1,80}$/.test(error.code) ? error.code : 'OPERATION_FAILED';
    process.send({ ok: false, code }, () => process.exit(1));
  }
});
