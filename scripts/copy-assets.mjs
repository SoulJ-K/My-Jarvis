import { copyFileSync } from 'node:fs';

for (const file of ['index.html', 'styles.css', 'wake-motion.css', 'prompt.html', 'prompt.css', 'timer-notice.html', 'hatch-sequence.css', 'hatch.html']) {
  copyFileSync(`src/renderer/${file}`, `dist/src/renderer/${file}`);
}
