import { copyFileSync } from 'node:fs';

for (const file of ['index.html', 'styles.css', 'wake-motion.css', 'prompt.html', 'prompt.css', 'timer-notice.html', 'hatch-sequence.css', 'hatch.html', 'result-card.html', 'result-card.css']) {
  copyFileSync(`src/renderer/${file}`, `dist/src/renderer/${file}`);
}

// Native drag is macOS-only; Linux CI needs no Apple toolchain.
if (process.platform === 'darwin') {
  const { buildDockSnackHelper } = await import('./build-dock-snack-helper.mjs');
  buildDockSnackHelper();
}
