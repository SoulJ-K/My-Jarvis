import assert from 'node:assert/strict';
import { execFileSync, spawnSync } from 'node:child_process';
import { readFileSync, readdirSync, rmSync, mkdtempSync, writeFileSync, realpathSync } from 'node:fs';
import path from 'node:path';
import { tmpdir } from 'node:os';
import { createRequire } from 'node:module';
import { runInNewContext } from 'node:vm';
import { fileURLToPath } from 'node:url';
import { packageMac, macBundleId, registerMacApp, registeredMacApps } from './package-mac.mjs';

const root = fileURLToPath(new URL('../', import.meta.url));
const identityFixture = '/identity-check/profile';
assert.equal(macBundleId({existingDirectory:identityFixture,directory:'/build/one'}),macBundleId({existingDirectory:identityFixture,directory:'/build/two'}));
assert.notEqual(macBundleId({directory:'/build/one'}),macBundleId({directory:'/build/two'}));
assert.notEqual(macBundleId({existingDirectory:identityFixture,directory:'/build/one'}),macBundleId({existingDirectory:'/identity-check/other',directory:'/build/one'}));
assert.notEqual(macBundleId({validation:true,directory:'/build/one'}),macBundleId({directory:'/build/one'}));
const lsregister = '/System/Library/Frameworks/CoreServices.framework/Frameworks/LaunchServices.framework/Support/lsregister';
const packaged = packageMac({ validation: true });
try {
  const files = readdirSync(packaged.payload, { recursive: true, withFileTypes: true })
    .filter(entry => entry.isFile()).map(entry => path.relative(packaged.payload, path.join(entry.parentPath, entry.name))).sort();
  assert(files.includes('dist/src/main/index.js'));
  assert(files.includes('dist/src/renderer/prompt.html'));
  assert(files.every(file => file === 'package.json' || file === 'launch.cjs' || file.startsWith('dist/src/') || file === 'dist/native/jarvis-dock-snack.node'));
  assert(files.every(file => !/\.(sqlite3?|db|env)$/.test(file)));
  for (const file of files.filter(file => file.startsWith('dist/src/'))) {
    assert.deepEqual(readFileSync(path.join(packaged.payload, file)), readFileSync(path.join(root, file)), file);
  }
  const dockHelper=path.join(packaged.payload,'dist/native/jarvis-dock-snack.node');
  assert(files.includes('dist/native/jarvis-dock-snack.node'));
  assert.deepEqual(readFileSync(dockHelper),readFileSync(path.join(root,'dist/native/jarvis-dock-snack.node')));
  assert.equal(createRequire(import.meta.url)(dockHelper).selfTest(), true);
  const identity = execFileSync('/usr/bin/plutil', ['-extract', 'CFBundleIdentifier', 'raw', path.join(packaged.bundle, 'Contents/Info.plist')], { encoding: 'utf8' }).trim();
  assert.match(identity, /^local\.jarvispet\.validation\.[a-f0-9]{24}$/);
  const env = { ...process.env };
  delete env.ELECTRON_RUN_AS_NODE;
  const result = spawnSync(packaged.executable, [], { env, encoding: 'utf8', timeout: 30000 });
  process.stdout.write(result.stdout ?? '');
  process.stderr.write(result.stderr ?? '');
  assert.ifError(result.error);
  assert.equal(result.status, 0);
  assert.match(result.stdout, /PASS: packaged runtime/);
  console.log(`PASS: ${files.length} allowlisted packaged files match the build; bundle identity and deep strict ad-hoc signature verified`);
  console.log('NOT VERIFIED: Finder installation/launch, native notification delivery, Developer ID signing, notarization, other Macs');
} finally {
  // Only the fresh directory returned by this invocation is removed.
  rmSync(packaged.directory, { recursive: true, force: true });
}

// The production existing-data launcher is tested with fresh fixtures only.
const require = createRequire(import.meta.url);
const { loadOrCreateEgg } = require('../dist/src/storage/pet-repository.js');
const { TimerRepository } = require('../dist/src/storage/timer-repository.js');
const directory = mkdtempSync(path.join(tmpdir(), "jarvis-existing-pet-'check-"));
let existing; let replacement;
try {
  assert.throws(() => packageMac({ existingDataDirectory: 'relative/path' }), /ABSOLUTE_PATH/);
  assert.throws(() => packageMac({ existingDataDirectory: directory }), /EXISTING_PET_NOT_FOUND/);
  assert.throws(() => packageMac({ validation: true, existingDataDirectory: directory }), /VALIDATION_CANNOT/);
  const before = loadOrCreateEgg(directory);
  const timers = new TimerRepository(directory);
  timers.insert('preserved-test-reservation', Date.now());
  const reserved = timers.all(); timers.close();
  const petFile = path.join(directory, 'pet/pet.sqlite3');
  const canonicalDirectory = realpathSync(directory);
  const originalBytes = readFileSync(petFile);
  existing = packageMac({ existingDataDirectory: directory });
  assert.deepEqual(readFileSync(petFile), originalBytes, 'packaging must not change the source pet');
  const files = readdirSync(existing.payload, { recursive: true });
  assert(files.every(file => !/\.(sqlite3?|db|env)$/.test(file)), 'no pet database goes into the app');
  const identity = execFileSync('/usr/bin/plutil', ['-extract', 'CFBundleIdentifier', 'raw', path.join(existing.bundle, 'Contents/Info.plist')], { encoding: 'utf8' }).trim();
  assert.match(identity, /^local\.jarvispet\.companion\.[a-f0-9]{24}$/);
  assert.notEqual(identity, 'local.jarvispet.preview', 'existing pet must not share legacy Preview identity');
  assert.equal(identity, macBundleId({existingDirectory:canonicalDirectory,directory:existing.directory}));
  const legacyRoutes = registeredMacApps('local.jarvispet.preview');
  registerMacApp(existing.bundle);
  assert.equal(registeredMacApps(identity).preferred, realpathSync(existing.bundle));
  replacement = path.join(existing.directory, 'replacement', 'Jarvis Pet.app');
  execFileSync('/usr/bin/ditto', [existing.bundle, replacement]);
  registerMacApp(replacement);
  assert.deepEqual(registeredMacApps(identity), { paths: [realpathSync(replacement)], preferred: realpathSync(replacement) });
  registerMacApp(existing.bundle);
  assert.deepEqual(registeredMacApps(identity), { paths: [realpathSync(existing.bundle)], preferred: realpathSync(existing.bundle) });
  assert.deepEqual(registeredMacApps('local.jarvispet.preview'), legacyRoutes, 'unrelated legacy registrations remain unchanged');
  assert.deepEqual(readFileSync(petFile), originalBytes, 'activation must not change pet data');
  console.log('PASS: distinct preview/pet identities, stable same-pet identity, selected app routing, replacement routing and unrelated registrations preserved');
  const launcher = readFileSync(path.join(existing.payload, 'launch.cjs'), 'utf8');
  // A path may disappear between packaging and launch. The entry must not run.
  for (const invalid of ['missing', 'empty', 'directory', 'symlink']) {
    let loaded = false; let exitCode; let informed = false;
    runInNewContext('(function(require) {' + launcher + '\n})')((name) => {
      if (name === 'electron') return { dialog: { showErrorBox: () => { informed = true; } }, app: {
        whenReady: () => Promise.resolve(),
        exit: value => { exitCode = value; },
        setPath: () => assert.fail('missing data must not select a new storage location'),
      } };
      if (name === 'node:fs') return { lstatSync: () => {
        if (invalid === 'missing') throw new Error('ENOENT');
        return { isFile: () => invalid !== 'directory', isSymbolicLink: () => invalid === 'symlink', size: invalid === 'empty' ? 0 : 1 };
      } };
      if (name === 'node:path') return path;
      loaded = true;
    });
    await Promise.resolve();
    assert.equal(exitCode, 1); assert.equal(loaded, false); assert.equal(informed, true);
  }
  // Only this disposable package gets a hidden entry. Its production launcher,
  // data selection and packaged runtime still execute unchanged.
  writeFileSync(path.join(existing.payload, 'dist/src/main/index.js'), `
const { app } = require('electron');
const assert = require('node:assert/strict');
const { startJarvis } = require('./app');
const timeout = setTimeout(() => app.exit(2), 20000);
startJarvis({show:false, onFailure: () => app.exit(1), onReady: async win => {
  assert.equal(app.isPackaged, true);
  assert.equal(app.getPath('userData'), ${JSON.stringify(canonicalDirectory)});
  assert.equal(app.getPath('sessionData'), ${JSON.stringify(canonicalDirectory)});
  assert.equal(win.isVisible(), false);
  console.log('PASS: existing pet packaged startup, isolated hidden window');
  clearTimeout(timeout); app.quit();
}});
`);
  execFileSync('/usr/bin/codesign', ['--force', '--deep', '--sign', '-', existing.bundle], { stdio: 'pipe' });
  execFileSync('/usr/bin/codesign', ['--verify', '--deep', '--strict', existing.bundle], { stdio: 'pipe' });
  const env = { ...process.env }; delete env.ELECTRON_RUN_AS_NODE;
  const result = spawnSync(existing.executable, [], { env, encoding: 'utf8', timeout: 30000 });
  process.stdout.write(result.stdout ?? ''); process.stderr.write(result.stderr ?? '');
  assert.ifError(result.error); assert.equal(result.status, 0);
  assert.match(result.stdout, /PASS: existing pet packaged startup/);
  assert.deepEqual(loadOrCreateEgg(directory), before, 'same pet and birth time survive packaged startup');
  const restored = new TimerRepository(directory);
  assert.deepEqual(restored.all(), reserved, 'pending reservation survives unchanged'); restored.close();
  console.log('PASS: existing-pet path guards, no DB copy/write during packaging, same pet and pending timer after packaged startup');
} finally {
  if (existing) {
    const registered = registeredMacApps(existing.bundleId).paths;
    for (const candidate of [existing.bundle, replacement]) {
      if (candidate && registered.includes(realpathSync(candidate))) execFileSync(lsregister, ['-u', candidate], {stdio:'pipe'});
    }
    rmSync(existing.directory, { recursive: true, force: true });
  }
  rmSync(directory, { recursive: true, force: true });
}
