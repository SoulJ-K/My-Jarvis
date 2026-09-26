import { copyFileSync } from 'node:fs';

for (const file of ['index.html', 'styles.css', 'prompt.html', 'prompt.css', 'timer-notice.html', 'hatch-sequence.css']) {
  copyFileSync(`src/renderer/${file}`, `dist/src/renderer/${file}`);
}
