import { copyFileSync } from 'node:fs';

for (const file of ['index.html', 'styles.css', 'prompt.html', 'prompt.css', 'timer-notice.html']) {
  copyFileSync(`src/renderer/${file}`, `dist/src/renderer/${file}`);
}
