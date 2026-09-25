import { app, BrowserWindow } from 'electron';
import { startJarvis } from '../../src/main/index';

// Only this test entry point accepts an alternate store. Production has no such switch.
const [directory, mode] = process.argv.slice(2);
if (!directory || !['once', 'hold'].includes(mode)) throw new Error('Invalid test arguments');
app.setPath('userData', directory);
const timeout = setTimeout(() => app.exit(2), 20_000);
startJarvis({
  show: false,
  onReady: async win => {
    const snapshot = await win.webContents.executeJavaScript('window.petWindow.snapshot()');
    const rendered = await win.webContents.executeJavaScript('document.querySelector("#egg").dataset.petId');
    console.log(`TEST_READY:${JSON.stringify({ snapshot, rendered })}`);
    if (mode === 'once') {
      clearTimeout(timeout);
      app.quit();
    }
  },
  onFailure: code => console.log(`TEST_FAILURE:${JSON.stringify({ code, windows: BrowserWindow.getAllWindows().length })}`),
});
process.on('SIGTERM', () => { clearTimeout(timeout); app.quit(); });
