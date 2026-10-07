import { cpSync, existsSync, lstatSync, realpathSync, mkdirSync, mkdtempSync, readFileSync, readdirSync, renameSync, rmSync, writeFileSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import path from 'node:path';
import { createHash } from 'node:crypto';
import { fileURLToPath } from 'node:url';
import electron from 'electron';

const root = fileURLToPath(new URL('../', import.meta.url));

// Existing pets have a stable identity per canonical data directory. Temporary
// previews/validation builds get separate identities, never the user's identity.
export function macBundleId({ validation = false, existingDirectory, directory }) {
  const kind = existingDirectory ? 'companion' : validation ? 'validation' : 'preview';
  const key = existingDirectory ?? directory;
  if (!path.isAbsolute(key ?? '')) throw new Error('IDENTITY_REQUIRES_ABSOLUTE_PATH');
  return `local.jarvispet.${kind}.${createHash('sha256').update(key).digest('hex').slice(0, 24)}`;
}
const lsregister = '/System/Library/Frameworks/CoreServices.framework/Frameworks/LaunchServices.framework/Support/lsregister';
export function registeredMacApps(bundleId) {
  const script = `ObjC.import('AppKit'); function run(args) {
    const workspace = $.NSWorkspace.sharedWorkspace;
    const urls = workspace.URLsForApplicationsWithBundleIdentifier(args[0]);
    const preferred = workspace.URLForApplicationWithBundleIdentifier(args[0]);
    return JSON.stringify({ paths: urls ? ObjC.deepUnwrap(urls.valueForKey('path')) : [],
      preferred: preferred.isNil() ? null : ObjC.unwrap(preferred.path) });
  }`;
  return JSON.parse(execFileSync('/usr/bin/osascript', ['-l', 'JavaScript', '-e', script, bundleId], { encoding: 'utf8' }));
}
/** Explicit activation only: keep old bundles/data, change only this identity's routing. */
export function registerMacApp(bundle) {
  bundle = realpathSync(bundle);
  const bundleId = execFileSync('/usr/bin/plutil', ['-extract', 'CFBundleIdentifier', 'raw', path.join(bundle, 'Contents/Info.plist')], { encoding: 'utf8' }).trim();
  if (!/^local\.jarvispet\.(companion|preview|validation)\.[a-f0-9]{24}$/.test(bundleId)) throw new Error('SCOPED_APP_ID_REQUIRED');
  execFileSync('/usr/bin/codesign', ['--verify', '--deep', '--strict', bundle], { stdio: 'pipe' });
  const previous = registeredMacApps(bundleId).paths;
  try {
    for (const old of previous) if (old !== bundle) execFileSync(lsregister, ['-u', old], { stdio: 'pipe' });
    execFileSync(lsregister, ['-f', bundle], { stdio: 'pipe' });
    const current = registeredMacApps(bundleId);
    if (current.preferred !== bundle || current.paths.some(p => p !== bundle)) throw new Error('APP_ROUTE_VERIFICATION_FAILED');
    return { bundleId, bundle, previous };
  } catch (error) {
    execFileSync(lsregister, ['-u', bundle], { stdio: 'pipe' });
    for (const old of previous) if (existsSync(old)) execFileSync(lsregister, ['-f', old], { stdio: 'pipe' });
    throw error;
  }
}

// Local preview only. This is deliberately not a release-signing pipeline:
// no identity/keychain access, hardened runtime, notarization or installation.
// https://www.electronjs.org/docs/latest/tutorial/application-distribution
export function packageMac({ validation = false, existingDataDirectory } = {}) {
  if (validation && existingDataDirectory !== undefined) throw new Error('VALIDATION_CANNOT_USE_EXISTING_DATA');
  let existingDirectory;
  if (existingDataDirectory !== undefined) {
    if (typeof existingDataDirectory !== 'string' || !path.isAbsolute(existingDataDirectory)) {
      throw new Error('EXISTING_DATA_REQUIRES_ABSOLUTE_PATH');
    }
    // Read metadata only. Packaging must never create, copy or open the pet DB.
    const database = path.join(existingDataDirectory, 'pet/pet.sqlite3');
    let stat;
    try { stat = lstatSync(database); } catch { throw new Error('EXISTING_PET_NOT_FOUND'); }
    if (!stat.isFile() || stat.isSymbolicLink() || stat.size === 0) throw new Error('EXISTING_PET_NOT_FOUND');
    existingDirectory = realpathSync(existingDataDirectory);
  }
  if (process.platform !== 'darwin') throw new Error('MACOS_REQUIRED');
  const pkg = JSON.parse(readFileSync(path.join(root, 'package.json'), 'utf8'));
  if (!existsSync(path.join(root, pkg.main))) throw new Error('BUILD_REQUIRED');
  const source = path.resolve(electron, '../../..');
  const out = path.join(root, 'out');
  mkdirSync(out, { recursive: true });
  // Every build gets a fresh directory. Never overwrite an existing preview.
  const directory = mkdtempSync(path.join(out, 'mac-preview-'));
  const name = validation ? 'Jarvis Pet Validation' : existingDirectory ? 'Jarvis Pet' : 'Jarvis Pet Preview';
  const bundleId = macBundleId({ validation, existingDirectory, directory });
  const bundle = path.join(directory, name + '.app');
  execFileSync('/usr/bin/ditto', [source, bundle]);
  const contents = path.join(bundle, 'Contents');
  const resources = path.join(contents, 'Resources');
  rmSync(path.join(resources, 'default_app.asar'), { force: true });
  const payload = path.join(resources, 'app');
  mkdirSync(payload);
  // Allowlist the application output, never the repository, tests, .env or DBs.
  const sourceRoot = path.join(root, 'src');
  for (const entry of readdirSync(sourceRoot, { recursive: true, withFileTypes: true })) {
    if (!entry.isFile() || entry.name.endsWith('.d.ts') || !/\.(ts|html|css)$/.test(entry.name)) continue;
    const relative = path.relative(sourceRoot, path.join(entry.parentPath, entry.name)).replace(/\.ts$/, '.js');
    const destination = path.join(payload, 'dist/src', relative);
    mkdirSync(path.dirname(destination), { recursive: true });
    cpSync(path.join(root, 'dist/src', relative), destination);
  }
  const nativeHelper = path.join(root, 'dist/native/jarvis-dock-snack.node');
  if (!existsSync(nativeHelper)) throw new Error('DOCK_HELPER_BUILD_REQUIRED');
  mkdirSync(path.join(payload, 'dist/native'), { recursive: true });
  cpSync(nativeHelper, path.join(payload, 'dist/native/jarvis-dock-snack.node'));
  writeFileSync(path.join(payload, 'package.json'), JSON.stringify({
    name: pkg.name, version: pkg.version, private: true, main: 'launch.cjs',
  }, null, 2) + '\n');
  const launcher = validation
    ? readFileSync(path.join(root, 'scripts/mac-validation-entry.cjs'), 'utf8')
    : existingDirectory ? `const { app, dialog } = require('electron');
const { lstatSync } = require('node:fs');
const path = require('node:path');
const directory = ${JSON.stringify(existingDirectory)};
// Recheck at launch: a moved or missing store must not silently create a new pet.
try {
  const stat = lstatSync(path.join(directory, 'pet/pet.sqlite3'));
  if (!stat.isFile() || stat.isSymbolicLink() || stat.size === 0) throw new Error();
} catch {
  console.error('EXISTING_PET_NOT_FOUND: 기존 펫 자료를 찾을 수 없어 실행하지 않습니다.');
  app.whenReady().then(() => {
    dialog.showErrorBox('기존 펫 자료를 찾을 수 없습니다', '지정한 저장 폴더를 확인해 주세요. 새 펫을 만들지 않고 실행을 중단했습니다.');
    app.exit(1);
  });
  return;
}
app.setPath('userData', directory);
app.setPath('sessionData', directory);
require('./${pkg.main}');
`
    : `const { app } = require('electron');\nconst path = require('node:path');\n// Default preview builds keep using their separate Preview data.\nconst directory = path.join(app.getPath('appData'), 'Jarvis Pet Preview');\napp.setPath('userData', directory);\napp.setPath('sessionData', directory);\nrequire('./${pkg.main}');\n`;
  writeFileSync(path.join(payload, 'launch.cjs'), launcher);
  const edit = (plist, key, value) => execFileSync('/usr/bin/plutil', ['-replace', key, '-string', value, plist]);
  const plist = path.join(contents, 'Info.plist');
  renameSync(path.join(contents, 'MacOS/Electron'), path.join(contents, 'MacOS', name));
  for (const [key, value] of Object.entries({
    CFBundleName: name, CFBundleDisplayName: name, CFBundleIdentifier: bundleId,
    CFBundleExecutable: name,
    CFBundleShortVersionString: pkg.version, CFBundleVersion: pkg.version,
  })) edit(plist, key, value);
  const frameworks = path.join(contents, 'Frameworks');
  for (const entry of readdirSync(frameworks).filter(name => name.endsWith('.app'))) {
    const helper = path.join(frameworks, entry, 'Contents/Info.plist');
    const suffix = entry.replace(/^Electron Helper/, '').replace(/\.app$/, '').trim().toLowerCase().replace(/[^a-z]/g, '');
    edit(helper, 'CFBundleIdentifier', `${bundleId}.helper${suffix ? '.' + suffix : ''}`);
    edit(helper, 'CFBundleName', `${name} Helper${suffix ? ' ' + suffix : ''}`);
    edit(helper, 'CFBundleDisplayName', `${name} Helper${suffix ? ' ' + suffix : ''}`);
  }
  // --deep is sufficient for this local ad-hoc experiment, not Developer ID
  // release signing. It touches only our newly-created copy of Electron.app.
  execFileSync('/usr/bin/codesign', ['--force', '--deep', '--sign', '-', bundle], { stdio: 'pipe' });
  execFileSync('/usr/bin/codesign', ['--verify', '--deep', '--strict', bundle], { stdio: 'pipe' });
  return { directory, bundle, executable: path.join(contents, 'MacOS', name), payload, bundleId };
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const args = process.argv.slice(2);
  if (args.length === 2 && args[0] === '--activate') {
    console.log(JSON.stringify(registerMacApp(args[1])));
    process.exit(0);
  }
  if (args.length !== 0 && (args.length !== 2 || args[0] !== '--existing-data')) {
    throw new Error('USAGE: package-mac.mjs [--existing-data /absolute/path/to/data] | --activate /absolute/path/to/app');
  }
  const result = packageMac({ existingDataDirectory: args[1] });
  console.log(`LOCAL_PREVIEW_APP:${result.bundle}`);
  console.log('ACTIVATION: run package-mac.mjs --activate with this app path before launch; packaging alone does not change app registration');
  console.log('SIGNATURE:ad-hoc verified; NOT Developer ID signed or notarized');
  console.log(args.length
    ? 'DATA:explicit existing pet directory; no pet data copied; app has NOT been launched'
    : 'DATA:separate Jarvis Pet Preview directory; existing pet data is not used');
}
