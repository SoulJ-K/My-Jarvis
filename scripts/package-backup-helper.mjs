// Build a self-contained local helper using the already installed Electron.
// No pet data, environment files, repository history or test hooks are bundled.
import * as fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { execFileSync } from 'node:child_process';
import electron from 'electron';
import { stripTypeScriptTypes } from 'node:module';
const root = fileURLToPath(new URL('../', import.meta.url));
export function packageBackupHelper() {
  if (process.platform !== 'darwin') throw new Error('MACOS_REQUIRED');
  fs.mkdirSync(path.join(root, 'out'), { recursive: true });
  const directory = fs.mkdtempSync(path.join(root, 'out/backup-helper-'));
  const name = 'Jarvis Pet 백업 도우미', executableName = 'Jarvis Pet Backup';
  const bundle = path.join(directory, name + '.app');
  execFileSync('/usr/bin/ditto', [path.resolve(electron, '../../..'), bundle]);
  const contents = path.join(bundle, 'Contents'), resources = path.join(contents, 'Resources'), payload = path.join(resources, 'app');
  fs.rmSync(path.join(resources, 'default_app.asar'), { force: true });
  fs.mkdirSync(path.join(payload, 'scripts/lib'), { recursive: true });
  fs.mkdirSync(path.join(payload, 'src/pet'), { recursive: true });
  fs.cpSync(path.join(root, 'scripts/backup-helper'), path.join(payload, 'scripts/backup-helper'), { recursive: true, errorOnExist: true, force: false });
  // Bundle pure validators only. No native pet runtime or storage constructors.
  for (const file of ['lifecycle', 'baby-life', 'baby-social']) {
    const source = fs.readFileSync(path.join(root, 'src/pet', file + '.ts'), 'utf8');
    const result = stripTypeScriptTypes(source);
    fs.writeFileSync(path.join(payload, 'src/pet', file + '.js'), result, { flag: 'wx' });
  }
  fs.writeFileSync(path.join(payload, 'src/pet/package.json'), JSON.stringify({ type: 'module' }), { flag: 'wx' });
  const core = fs.readFileSync(path.join(root, 'scripts/lib/manual-backup.mjs'), 'utf8').replaceAll("lifecycle.ts'", "lifecycle.js'").replaceAll("baby-life.ts'", "baby-life.js'").replaceAll("baby-social.ts'", "baby-social.js'");
  fs.writeFileSync(path.join(payload, 'scripts/lib/manual-backup.mjs'), core, { flag: 'wx' });
  fs.writeFileSync(path.join(payload, 'package.json'), JSON.stringify({ name: 'jarvis-pet-backup-helper', productName: name, version: '0.1.0', main: 'scripts/backup-helper/entry.cjs' }), { flag: 'wx' });
  const edit = (plist, key, value) => execFileSync('/usr/bin/plutil', ['-replace', key, '-string', value, plist]);
  const plist = path.join(contents, 'Info.plist'), id = 'local.jarvispet.backuphelper';
  fs.renameSync(path.join(contents, 'MacOS/Electron'), path.join(contents, 'MacOS', executableName));
  for (const [key, value] of Object.entries({ CFBundleName: name, CFBundleDisplayName: name, CFBundleIdentifier: id, CFBundleExecutable: executableName, CFBundleShortVersionString: '0.1.0', CFBundleVersion: '0.1.0' })) edit(plist, key, value);
  for (const entry of fs.readdirSync(path.join(contents, 'Frameworks')).filter(file => file.endsWith('.app'))) {
    const suffix = entry.replace(/[^a-zA-Z]/g, '').toLowerCase();
    edit(path.join(contents, 'Frameworks', entry, 'Contents/Info.plist'), 'CFBundleIdentifier', `${id}.${suffix}`);
  }
  execFileSync('/usr/bin/codesign', ['--force', '--deep', '--sign', '-', bundle], { stdio: 'pipe' });
  execFileSync('/usr/bin/codesign', ['--verify', '--deep', '--strict', bundle], { stdio: 'pipe' });
  return { directory, bundle, executable: path.join(contents, 'MacOS', executableName), payload };
}
if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) console.log(JSON.stringify(packageBackupHelper()));
