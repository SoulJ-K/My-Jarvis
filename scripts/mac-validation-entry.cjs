// Used only in a separate validation bundle; never included in preview builds.
const assert = require('node:assert/strict');
const { app } = require('electron');
const { mkdtempSync, rmSync } = require('node:fs');
const { tmpdir } = require('node:os');
const path = require('node:path');
const directory = mkdtempSync(path.join(tmpdir(), 'jarvis-package-check-'));
app.setPath('userData', directory);
app.setPath('sessionData', directory);
process.on('exit', () => rmSync(directory, { recursive: true, force: true }));
const timeout = setTimeout(() => app.exit(2), 20000);
const { startJarvis } = require('./dist/src/main/app.js');
startJarvis({
  show: false,
  onReady: async win => {
    try {
      assert.equal(app.isPackaged, true);
      assert.equal(app.getPath('userData'), directory);
      assert.equal(win.isVisible(), false);
      assert.equal(win.isFocusable(), false);
      assert.equal(await win.webContents.executeJavaScript('typeof require'), 'undefined');
      const brain = await win.webContents.executeJavaScript('window.petBrain.read()');
      assert.equal(brain.behavior, 'idle');
      console.log('PASS: packaged runtime, isolated temporary storage, hidden non-focusable egg, sandboxed renderer and preload');
      clearTimeout(timeout);
      app.quit();
    } catch (error) {
      console.error('PACKAGE_CHECK_FAILED:', error.message);
      throw error;
    }
  },
});
