// Local manual recovery only. No default data path, app launch, registration,
// network access, overwrite, migration, or automatic retention policy.
import * as fs from 'node:fs';
import path from 'node:path';
import { createHash } from 'node:crypto';
import { spawnSync } from 'node:child_process';
import { DatabaseSync } from 'node:sqlite';
// Node 24 strips these types without a build. These modules contain pure
// validators only; importing them cannot open/migrate a user's database.
import { validateLifecycle } from '../../src/pet/lifecycle.ts';
import { validateBabyLife } from '../../src/pet/baby-life.ts';
import { validateBabySocial } from '../../src/pet/baby-social.ts';

export const stores = [
  ['pet/pet.sqlite3', 0x4a505431, 5],
  ['assistant/timers.sqlite3', 0x4a505432, 2],
  ['assistant/schedules.sqlite3', 0x4a505333, 1],
  ['assistant/followups.sqlite3', 0x4a504634, 1],
];
const fail = code => { throw new Error(code); };
const hash = content => createHash('sha256').update(content).digest('hex');
const json = file => JSON.parse(fs.readFileSync(file, 'utf8'));
const same = (a, b) => JSON.stringify(a) === JSON.stringify(b);
const inside = (parent, child) => {
  const rel = path.relative(parent, child);
  return rel === '' || (!path.isAbsolute(rel) && rel !== '..' && !rel.startsWith(`..${path.sep}`));
};
function directory(file) {
  const stat = fs.lstatSync(file);
  if (!stat.isDirectory() || stat.isSymbolicLink()) fail('DIRECTORY_REQUIRED');
}
function regular(file) {
  const stat = fs.lstatSync(file);
  if (!stat.isFile() || stat.isSymbolicLink()) fail('REGULAR_FILE_REQUIRED');
}
function existing(file) {
  if (typeof file !== 'string' || !path.isAbsolute(file)) fail('ABSOLUTE_PATH_REQUIRED');
  directory(file);
  return fs.realpathSync.native(file);
}
function destination(file, protectedPaths) {
  if (typeof file !== 'string' || !path.isAbsolute(file)) fail('ABSOLUTE_PATH_REQUIRED');
  let resolved;
  try { resolved = fs.realpathSync.native(file); }
  catch (error) {
    if (error.code !== 'ENOENT') throw error;
    resolved = path.join(fs.realpathSync.native(path.dirname(file)), path.basename(file));
  }
  for (const source of protectedPaths) {
    if (inside(source, resolved) || inside(resolved, source)) fail('PATH_OVERLAP');
  }
  try { fs.lstatSync(resolved); }
  catch (error) { if (error.code === 'ENOENT') return resolved; throw error; }
  fail('TARGET_EXISTS');
}
function command(binary, args, code) {
  const result = spawnSync(binary, args, { encoding: 'utf8', timeout: 120_000, maxBuffer: 8 * 1024 * 1024 });
  if (result.error || result.status !== 0) fail(code);
  return result.stdout.trim(); // Never print command stderr or private profile values.
}
function plist(file, key) {
  return command('/usr/bin/plutil', ['-extract', key, 'raw', file], 'APP_METADATA_INVALID');
}
function putPlist(file, key, value) {
  command('/usr/bin/plutil', ['-replace', key, '-string', value, file], 'APP_REBIND_FAILED');
}
function signature(app) {
  command('/usr/bin/codesign', ['--verify', '--deep', '--strict', app], 'APP_SIGNATURE_INVALID');
}

// The supported original launcher is deliberately matched in full. An arbitrary
// launcher may load appearance/settings from outside its .app and is not portable.
export function installedLauncher(data) {
  return `const { app, dialog } = require('electron');
const { lstatSync } = require('node:fs');
const path = require('node:path');
const directory = ${JSON.stringify(data)};
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
require('./dist/src/main/index.js');
`;
}
export function restoredLauncher(data) {
  return `// Created by the manual recovery tool; never initializes a missing profile.
const { app, dialog } = require('electron');
const { lstatSync, existsSync } = require('node:fs');
const path = require('node:path');
const directory = ${JSON.stringify(data)};
try {
  if (existsSync(path.join(path.dirname(directory), 'INCOMPLETE')) || existsSync(path.join(directory, 'INCOMPLETE'))) throw new Error();
  for (const file of ${JSON.stringify(stores.map(([file]) => file))}) {
    const stat = lstatSync(path.join(directory, file));
    if (!stat.isFile() || stat.isSymbolicLink() || stat.size === 0) throw new Error();
  }
} catch {
  console.error('RESTORED_PROFILE_NOT_READY');
  app.whenReady().then(() => { dialog.showErrorBox('복원 자료를 확인해 주세요', '완료된 복원 자료가 없어 실행을 중단했습니다. 새 펫은 만들지 않습니다.'); app.exit(1); });
  return;
}
app.setPath('userData', directory);
app.setPath('sessionData', directory);
require('./dist/src/main/index.js');
`;
}

export function inspectApplication(input) {
  if (process.platform !== 'darwin') fail('MACOS_REQUIRED');
  const app = existing(input);
  if (!app.endsWith('.app')) fail('APP_BUNDLE_REQUIRED');
  const payload = path.join(app, 'Contents/Resources/app');
  directory(payload);
  const packageFile = path.join(payload, 'package.json'), launchFile = path.join(payload, 'launch.cjs');
  regular(packageFile); regular(launchFile);
  const pkg = json(packageFile), launcher = fs.readFileSync(launchFile, 'utf8');
  if (pkg.name !== 'my-jarvis' || pkg.main !== 'launch.cjs') fail('UNSUPPORTED_APP');
  const literal = launcher.match(/^const directory = ("(?:[^"\\]|\\.)*");$/m)?.[1];
  let data;
  try { data = JSON.parse(literal); } catch { fail('UNSUPPORTED_LAUNCHER'); }
  if (!path.isAbsolute(data) || ![installedLauncher(data), restoredLauncher(data)].includes(launcher)) fail('UNSUPPORTED_LAUNCHER');
  for (const file of ['dist/src/main/index.js', 'dist/src/main/app.js', 'dist/src/renderer/index.html', 'dist/src/renderer/styles.css']) regular(path.join(payload, file));
  // External trial entry points and appearance.json profiles require a separate
  // adapter. The bundled renderer and all its assets are archived together.
  const info = path.join(app, 'Contents/Info.plist'); regular(info);
  const executableName = plist(info, 'CFBundleExecutable');
  if (!/^[\w .()-]+$/.test(executableName)) fail('APP_METADATA_INVALID');
  const executable = path.join(app, 'Contents/MacOS', executableName); regular(executable);
  const bundleId = plist(info, 'CFBundleIdentifier');
  if (!/^local\.jarvispet\.companion\.[a-f0-9]{24}$/.test(bundleId)) fail('UNSUPPORTED_APP_ID');
  signature(app);
  return { app, data, executable, executableName, bundleId, version: pkg.version, appearance: 'bundled-renderer-and-assets' };
}

// Collect literal entries (not followed links). Preserve signed framework links
// only when both their spelling and resolved target remain inside the bundle.
export function inventory(root) {
  directory(root);
  const result = {};
  function walk(dir) {
    for (const name of fs.readdirSync(dir).sort()) {
      const file = path.join(dir, name), key = path.relative(root, file).split(path.sep).join('/');
      const stat = fs.lstatSync(file);
      if (stat.isDirectory()) { result[key] = { type: 'directory' }; walk(file); }
      else if (stat.isFile()) result[key] = { type: 'file', size: stat.size, executable: Boolean(stat.mode & 0o111), sha256: hash(fs.readFileSync(file)) };
      else if (stat.isSymbolicLink()) {
        const link = fs.readlinkSync(file);
        if (path.isAbsolute(link) || !inside(root, path.resolve(dir, link)) || !inside(root, fs.realpathSync.native(file))) fail('EXTERNAL_APP_LINK');
        result[key] = { type: 'link', target: link };
      } else fail('UNSUPPORTED_FILE_KIND');
    }
  }
  walk(root); return result;
}

// These Chromium files are not the pet's source of truth. Unknown root entries
// stop backup; no recursive scan of unrelated user directories or caches.
const cacheNames = new Set(['browser-session', 'Cache', 'Code Cache', 'GPUCache', 'DawnGraphiteCache',
  'DawnWebGPUCache', 'GPUPersistentCache', 'GraphiteDawnCache', 'blob_storage', 'Session Storage', 'Local Storage', 'Network', 'Preferences', 'Local State',
  'Dictionaries', 'Crashpad', 'Shared Dictionary', 'SharedStorage', 'SharedStorage-wal', 'WebStorage',
  'Network Persistent State', 'TransportSecurity', 'Cookies', 'Cookies-journal', 'Trust Tokens', 'Trust Tokens-journal',
  'SingletonCookie', 'SingletonSocket', 'DIPS', 'DIPS-wal', 'DIPS-shm',
  'declarative_performance_observer.db', 'declarative_performance_observer.db-journal', '.DS_Store', 'pet-diagnostics.log']);
export function profileFiles(root) {
  directory(root);
  const excluded = [];
  for (const name of fs.readdirSync(root).sort()) {
    if (name === 'pet' || name === 'assistant') continue;
    if (name === 'INCOMPLETE') fail('PROFILE_INCOMPLETE');
    if (name === 'SingletonLock') fail('PROFILE_LOCK_PRESENT');
    if (name === 'appearance.json') fail('EXTERNAL_APPEARANCE_UNSUPPORTED');
    // D-072 automatic same-disk snapshots: history of the same stores, not live state.
    if (name === 'snapshots') { excluded.push(name); continue; }
    if (!cacheNames.has(name)) fail('UNKNOWN_PROFILE_FILE');
    excluded.push(name);
  }
  const files = {};
  for (const folder of ['pet', 'assistant']) {
    directory(path.join(root, folder));
    for (const name of fs.readdirSync(path.join(root, folder)).sort()) {
      const relative = `${folder}/${name}`;
      // Finder view metadata only; never part of the pet's state.
      if (name === '.DS_Store') { excluded.push(relative); continue; }
      if (!stores.some(([file]) => file === relative) && !/^pet\/pet\.sqlite3\.v[1-4]-backup$/.test(relative) &&
          !/^assistant\/timers\.sqlite3\.v1-backup-\d+-\d+$/.test(relative)) fail('UNKNOWN_STORE_FILE_OR_SIDECAR');
      const file = path.join(root, relative); regular(file);
      if (!fs.statSync(file).size) fail('EMPTY_STORE');
      files[relative] = hash(fs.readFileSync(file));
    }
  }
  for (const [file] of stores) if (!files[file]) fail('MISSING_STORE');
  return { files, excluded };
}

// Read-only format/integrity checks. No product constructor, first-run creation,
// schema upgrade, or user state is printed. A backup is not a DB repair tool.
export function validateProfile(root) {
  const before = profileFiles(root);
  for (const [file, appId, version] of stores) {
    const db = new DatabaseSync(path.join(root, file), { readOnly: true, allowExtension: false });
    try {
      db.exec('PRAGMA trusted_schema=OFF');
      if (db.prepare('PRAGMA application_id').get()?.application_id !== appId ||
          db.prepare('PRAGMA user_version').get()?.user_version !== version) fail('UNSUPPORTED_STORE_FORMAT');
      const check = db.prepare('PRAGMA integrity_check').all();
      if (check.length !== 1 || check[0].integrity_check !== 'ok' || db.prepare('PRAGMA foreign_key_check').all().length) fail('CORRUPT_STORE');
      if (file.startsWith('pet/')) {
        const pet = db.prepare('SELECT pet_id,created_at,stage,name FROM pet').all();
        const life = db.prepare('SELECT snapshot FROM lifecycle').all();
        if (pet.length !== 1 || life.length !== 1) fail('INVALID_PET_RECORDS');
        const p = pet[0], state = JSON.parse(life[0].snapshot);
        validateLifecycle(state, p.pet_id, { trim: false, maxCodePoints: Number.MAX_SAFE_INTEGER });
        if (!state || !/^[\da-f]{8}-(?:[\da-f]{4}-){3}[\da-f]{12}$/.test(p.pet_id) || !Number.isFinite(Date.parse(p.created_at)) ||
            !['egg', 'baby'].includes(p.stage) || state.petId !== p.pet_id || state.stage !== p.stage || state.name !== p.name ||
            !Number.isSafeInteger(state.revision) || typeof state.ready !== 'boolean') fail('INVALID_PET_RECORDS');
        db.prepare('SELECT elapsed_ms,observed_at_ms FROM egg_life').get() ?? fail('INVALID_PET_RECORDS');
        db.prepare('SELECT kind,occurred_at_ms,elapsed_ms FROM egg_care').all();
        db.prepare('SELECT kind,at_ms,duration_ms FROM baby_experience').all();
        db.prepare('SELECT kind,at_ms FROM baby_social_experience').all();
        const body = db.prepare('SELECT snapshot FROM baby_life').all(), social = db.prepare('SELECT snapshot FROM baby_social').all();
        const count = p.stage === 'baby' && typeof p.name === 'string' ? 1 : 0;
        if (body.length !== count || social.length !== count) fail('INVALID_PET_RECORDS');
        if (count) {
          const b = JSON.parse(body[0].snapshot), s = JSON.parse(social[0].snapshot);
          validateBabyLife(b); validateBabySocial(s);
          if (!b || !s || !Number.isSafeInteger(b.observedAtMs) || !Number.isSafeInteger(b.elapsedMs) || b.elapsedMs !== s.elapsedMs) fail('INVALID_PET_RECORDS');
        }
      } else if (file.includes('timers')) {
        db.prepare('SELECT id,started_at,due_at,duration_ms,status,reason,system_delivery,app_displayed,title,menu,auto_excluded,paused_remaining_ms,restart_of FROM timers').all();
      } else if (file.includes('schedules')) {
        db.prepare('SELECT id,kind,content,due_at,local_date_time,time_zone,utc_offset_minutes,created_at,status,reason,system_delivery,app_displayed FROM schedules').all();
      } else {
        for (const row of db.prepare('SELECT key,document FROM followups').all()) {
          const r = JSON.parse(row.document);
          if (!r || row.key !== `${r.kind}:${r.id}` || !['timer','alarm','reminder'].includes(r.kind) ||
              !['active','done','cancelled','legacy'].includes(r.status) || !Number.isSafeInteger(r.round) ||
              !Array.isArray(r.rounds) || r.rounds.length !== r.round + 1) fail('INVALID_FOLLOWUP_RECORDS');
        }
      }
    } finally { db.close(); }
  }
  if (!same(before, profileFiles(root))) fail('PROFILE_CHANGED');
  return before;
}

function ensureClosed(data, appInfo) {
  const files = [appInfo.executable, ...stores.map(([f]) => path.join(data, f))];
  const result = spawnSync('/usr/sbin/lsof', ['-nP', '-F', 'p', '--', ...files], { encoding: 'utf8', timeout: 30_000 });
  if (result.error || result.signal || ![0, 1].includes(result.status) || result.stderr.trim()) fail('CLOSED_CHECK_FAILED');
  if (result.stdout.trim() || result.status === 0) fail('APP_OR_PROFILE_IN_USE');
}
function newOutput(target) {
  fs.mkdirSync(target, { mode: 0o700 });
  fs.writeFileSync(path.join(target, 'INCOMPLETE'), '미완료 사본입니다. 실행하거나 복원하지 마세요.\n', { flag: 'wx', mode: 0o600 });
}
function writeJSON(file, value) {
  const fd = fs.openSync(file, 'wx', 0o600);
  try { fs.writeFileSync(fd, JSON.stringify(value, null, 2) + '\n'); fs.fsyncSync(fd); } finally { fs.closeSync(fd); }
}
function copyProfile(source, target, files) {
  fs.mkdirSync(target, { mode: 0o700 });
  for (const folder of ['pet', 'assistant']) fs.mkdirSync(path.join(target, folder), { mode: 0o700 });
  for (const file of Object.keys(files)) {
    const dest = path.join(target, file);
    fs.copyFileSync(path.join(source, file), dest, fs.constants.COPYFILE_EXCL); fs.chmodSync(dest, 0o600);
  }
  if (!same(validateProfile(target).files, files)) fail('COPY_MISMATCH');
}
function copyApp(source, target, expected) {
  // A pre-existing target is never merged, even if empty.
  try { fs.lstatSync(target); fail('TARGET_EXISTS'); } catch (e) { if (e.code !== 'ENOENT') throw e; }
  fs.cpSync(source, target, { recursive: true, force: false, errorOnExist: true, verbatimSymlinks: true });
  if (!same(inventory(target), expected)) fail('APP_COPY_MISMATCH');
}

export function backupApplication({ app, to, confirmClosed = false }) {
  if (!confirmClosed) fail('CONFIRM_CLEAN_EXIT_REQUIRED');
  const info = inspectApplication(app), data = existing(info.data);
  if (inside(info.app, data) || inside(data, info.app)) fail('APP_PROFILE_OVERLAP');
  const target = destination(to, [info.app, data]);
  ensureClosed(data, info);
  const profile = validateProfile(data), appEntries = inventory(info.app);
  newOutput(target);
  copyProfile(data, path.join(target, 'data'), profile.files);
  copyApp(info.app, path.join(target, 'Jarvis Pet.app'), appEntries);
  if (!same(profile, profileFiles(data)) || !same(appEntries, inventory(info.app))) fail('SOURCE_CHANGED');
  ensureClosed(data, info);
  writeJSON(path.join(target, 'manifest.json'), { format: 'jarvis-pet-manual-backup', version: 1,
    createdAt: new Date().toISOString(), condition: 'user-confirmed-clean-exit', platform: process.platform, arch: process.arch,
    application: { bundleId: info.bundleId, version: info.version, appearance: info.appearance },
    source: { app: info.app, data: info.data }, profileFiles: profile.files, excluded: profile.excluded, appEntries });
  fs.unlinkSync(path.join(target, 'INCOMPLETE'));
  return { backup: target, files: Object.keys(profile.files).length, appearance: info.appearance };
}

export function verifyBackup(input) {
  const root = existing(input);
  // Opening a backup in Finder may add view metadata; it is not copied on restore.
  const names = fs.readdirSync(root).filter(name => name !== '.DS_Store').sort();
  if (names.includes('INCOMPLETE')) fail('BACKUP_INCOMPLETE');
  if (!same(names, ['Jarvis Pet.app', 'data', 'manifest.json'])) fail('BACKUP_LAYOUT_INVALID');
  regular(path.join(root, 'manifest.json'));
  let manifest;
  try { manifest = json(path.join(root, 'manifest.json')); } catch { fail('MANIFEST_INVALID'); }
  if (!manifest || manifest.format !== 'jarvis-pet-manual-backup' || manifest.version !== 1 ||
      manifest.condition !== 'user-confirmed-clean-exit' || manifest.platform !== 'darwin' ||
      !['arm64','x64'].includes(manifest.arch)) fail('BACKUP_FORMAT_UNSUPPORTED');
  const data = path.join(root, 'data'), app = path.join(root, 'Jarvis Pet.app');
  const files = validateProfile(data);
  if (files.excluded.some(name => path.posix.basename(name) !== '.DS_Store') || !same(files.files, manifest.profileFiles) || !same(inventory(app), manifest.appEntries)) fail('BACKUP_CHECKSUM_MISMATCH');
  const info = inspectApplication(app); // Reads code/metadata only; never follows its original data path.
  if (!manifest.source || !path.isAbsolute(manifest.source.app ?? '') || !path.isAbsolute(manifest.source.data ?? '') ||
      manifest.source.data !== info.data) fail('MANIFEST_INVALID');
  if (!same(manifest.application, { bundleId: info.bundleId, version: info.version, appearance: info.appearance })) fail('MANIFEST_INVALID');
  return { root, data, app, manifest, info };
}

export function restoreApplication({ backup, to }) {
  const source = existing(backup);
  // Protect the entire backup before any writes, including invalid backups.
  const target = destination(to, [source]);
  const verified = verifyBackup(source), { manifest } = verified;
  // Even a NEW child of the original profile/app would modify its directory
  // tree. Preserve those recorded locations too, if this is the original Mac.
  const originalPaths = Object.values(manifest.source).flatMap(file => {
    try { return [file, fs.realpathSync.native(file)]; }
    catch (error) { if (error.code === 'ENOENT') return [file]; throw error; }
  });
  destination(to, [source, ...originalPaths]);
  if (manifest.arch !== process.arch || manifest.platform !== process.platform) fail('RESTORE_PLATFORM_MISMATCH');
  newOutput(target);
  const data = path.join(target, 'data'), app = path.join(target, 'Jarvis Pet.app');
  copyProfile(verified.data, data, manifest.profileFiles);
  copyApp(verified.app, app, manifest.appEntries);
  const bundleId = `local.jarvispet.companion.${hash(data).slice(0, 24)}`;
  // Only this newly-created candidate is rewritten and ad-hoc signed. The
  // archived app remains byte-for-byte intact; no LaunchServices/TCC operation.
  const launcher = path.join(app, 'Contents/Resources/app/launch.cjs');
  fs.writeFileSync(launcher, restoredLauncher(data));
  putPlist(path.join(app, 'Contents/Info.plist'), 'CFBundleIdentifier', bundleId);
  const frameworks = path.join(app, 'Contents/Frameworks');
  for (const name of fs.readdirSync(frameworks).filter(n => n.endsWith('.app'))) {
    const file = path.join(frameworks, name, 'Contents/Info.plist'); regular(file);
    const previous = plist(file, 'CFBundleIdentifier');
    if (!previous.startsWith(manifest.application.bundleId + '.helper')) fail('HELPER_ID_UNSUPPORTED');
    putPlist(file, 'CFBundleIdentifier', bundleId + previous.slice(manifest.application.bundleId.length));
  }
  command('/usr/bin/codesign', ['--force', '--deep', '--sign', '-', app], 'RESTORED_APP_SIGN_FAILED');
  const restored = inspectApplication(app);
  if (restored.data !== data || restored.bundleId !== bundleId || !same(validateProfile(data).files, manifest.profileFiles)) fail('RESTORE_MISMATCH');
  if (!same(verifyBackup(source).manifest, manifest)) fail('BACKUP_CHANGED');
  writeJSON(path.join(target, 'restoration.json'), { format: 'jarvis-pet-manual-restore', version: 1,
    restoredAt: new Date().toISOString(), bundleId, app: 'Jarvis Pet.app', data: 'data',
    profileFiles: manifest.profileFiles, appEntries: inventory(app),
    launchStatus: 'not-launched', permissions: 'not-restored', registration: 'not-changed' });
  fs.unlinkSync(path.join(target, 'INCOMPLETE'));
  return { restored: target, app, data, launched: false, permissionsRestored: false };
}
