import { copyFileSync } from 'node:fs';

for (const file of ['index.html', 'styles.css']) {
  copyFileSync(`src/renderer/${file}`, `dist/src/renderer/${file}`);
}
