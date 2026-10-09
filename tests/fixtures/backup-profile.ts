// Verification helper only: no production entry point, live backup or default userData lookup.
// The caller owns the synthetic profile and must await its application's clean exit.
import { constants, copyFileSync, lstatSync, mkdirSync, readFileSync, readdirSync, unlinkSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { createHash } from 'node:crypto';
import { DatabaseSync } from 'node:sqlite';
import { loadOrCreateEgg } from '../../src/storage/pet-repository';
import { LifecycleRepository } from '../../src/storage/lifecycle-repository';
import { BabyLifeRepository } from '../../src/storage/baby-life-repository';
import { TimerRepository } from '../../src/storage/timer-repository';
import { ScheduleRepository } from '../../src/storage/schedule-repository';
import { FollowupRepository } from '../../src/storage/followup-repository';

export const stores = [
  ['pet/pet.sqlite3', 0x4a505431, 5],
  ['assistant/timers.sqlite3', 0x4a505432, 2],
  ['assistant/schedules.sqlite3', 0x4a505333, 1],
  ['assistant/followups.sqlite3', 0x4a504634, 1],
] as const;
const fail = (code: string): never => { throw new Error(code); };
function regular(file: string) {
  const stat = lstatSync(file);
  if (!stat.isFile() || stat.isSymbolicLink() || stat.size === 0) fail('PROFILE_FILE_INVALID');
}
function directory(dir: string) {
  const stat = lstatSync(dir);
  if (!stat.isDirectory() || stat.isSymbolicLink()) fail('PROFILE_DIRECTORY_INVALID');
}
export function hashes(dir: string): Record<string, string> {
  directory(dir);
  // This test launcher stores browser-only caches in browser-session. Other
  // launchers (including appearance.json trials) need their own audited scope.
  for (const name of readdirSync(dir)) {
    if (!['pet', 'assistant', 'browser-session', 'pet-diagnostics.log', 'INCOMPLETE'].includes(name)) fail('PROFILE_UNEXPECTED_ROOT_FILE');
  }
  const result: Record<string, string> = {};
  for (const folder of ['pet', 'assistant']) {
    directory(path.join(dir, folder));
    for (const name of readdirSync(path.join(dir, folder)).sort()) {
      const relative = `${folder}/${name}`;
      // Unknown state, SQLite sidecars and links require investigation, never omission.
      if (!stores.some(([file]) => file === relative) &&
          !/^pet\/pet\.sqlite3\.v[1-4]-backup$/.test(relative) &&
          !/^assistant\/timers\.sqlite3\.v1-backup-\d+-\d+$/.test(relative)) fail('PROFILE_UNEXPECTED_FILE');
      const file = path.join(dir, relative); regular(file);
      result[relative] = createHash('sha256').update(readFileSync(file)).digest('hex');
    }
  }
  for (const [file] of stores) if (!result[file]) fail('PROFILE_MISSING_STORE');
  return result;
}
export function checkProfile(dir: string) {
  const before = hashes(dir);
  for (const [file, id, version] of stores) {
    const db = new DatabaseSync(path.join(dir, file), { readOnly: true, allowExtension: false });
    try {
      db.exec('PRAGMA trusted_schema=OFF');
      const check = db.prepare('PRAGMA integrity_check').all();
      if (check.length !== 1 || check[0].integrity_check !== 'ok' || db.prepare('PRAGMA foreign_key_check').all().length) fail('PROFILE_CORRUPT');
      if (db.prepare('PRAGMA application_id').get()?.application_id !== id) fail('PROFILE_WRONG_APPLICATION');
      if (db.prepare('PRAGMA user_version').get()?.user_version !== version) fail('PROFILE_UNSUPPORTED_FORMAT');
    } finally { db.close(); }
  }
  return before;
}
/** Validate an isolated candidate with the same row readers as the product.
 * Current versions are checked first, so these constructors cannot migrate it. */
export function readProfile(dir: string) {
  const before = checkProfile(dir);
  const pet = loadOrCreateEgg(dir);
  const lifecycle = new LifecycleRepository(dir, { namePolicy: { trim: true, maxCodePoints: 20 } });
  let state;
  try { state = lifecycle.read(); } finally { lifecycle.close(); }
  const baby = new BabyLifeRepository(dir);
  let life, social;
  try { life = baby.read(); social = life ? baby.readSocial() : null; } finally { baby.close(); }
  const timers = new TimerRepository(dir);
  let timerRows;
  try { timerRows = timers.all(); } finally { timers.close(); }
  const schedules = new ScheduleRepository(dir);
  let scheduleRows;
  try { scheduleRows = schedules.all(); } finally { schedules.close(); }
  const followups = new FollowupRepository(dir);
  let followupRows;
  try { followupRows = followups.all(); } finally { followups.close(); }
  const db = new DatabaseSync(path.join(dir, stores[0][0]), { readOnly: true });
  let care, experiences, socialExperiences;
  try {
    care = db.prepare('SELECT * FROM egg_care ORDER BY id').all();
    experiences = db.prepare('SELECT * FROM baby_experience ORDER BY id').all();
    socialExperiences = db.prepare('SELECT * FROM baby_social_experience ORDER BY id').all();
  } finally { db.close(); }
  if (JSON.stringify(before) !== JSON.stringify(hashes(dir))) fail('VALIDATION_CHANGED_PROFILE');
  return { pet, lifecycle: state, life, social, timers: timerRows, schedules: scheduleRows, followups: followupRows,
    care, experiences, socialExperiences };
}
type Manifest = { format: 1; condition: 'clean-exit'; files: Record<string, string>; runtime: typeof process.versions };
function copyProfile(source: string, target: string, files: Record<string, string>) {
  for (const folder of ['pet', 'assistant']) mkdirSync(path.join(target, folder), { mode: 0o700 });
  for (const file of Object.keys(files)) copyFileSync(path.join(source, file), path.join(target, file), constants.COPYFILE_EXCL);
  if (JSON.stringify(files) !== JSON.stringify(hashes(target))) fail('PROFILE_COPY_MISMATCH');
}
export function backupClosedProfile(source: string, target: string) {
  if (readdirSync(source).includes('INCOMPLETE')) fail('PROFILE_INCOMPLETE');
  const files = checkProfile(source);
  mkdirSync(target, { mode: 0o700 }); // Existing folders, files and dangling links all fail.
  writeFileSync(path.join(target, 'INCOMPLETE'), 'Do not restore this incomplete copy.\n', { flag: 'wx', mode: 0o600 });
  const data = path.join(target, 'data'); mkdirSync(data, { mode: 0o700 });
  copyProfile(source, data, files);
  readProfile(data);
  if (JSON.stringify(files) !== JSON.stringify(hashes(source))) fail('SOURCE_CHANGED_DURING_COPY');
  const manifest: Manifest = { format: 1, condition: 'clean-exit', files, runtime: process.versions };
  writeFileSync(path.join(target, 'manifest.json'), JSON.stringify(manifest, null, 2) + '\n', { flag: 'wx', mode: 0o600 });
  unlinkSync(path.join(target, 'INCOMPLETE'));
}
export function restoreClosedProfile(source: string, target: string) {
  directory(source);
  if (readdirSync(source).includes('INCOMPLETE')) fail('BACKUP_INCOMPLETE');
  regular(path.join(source, 'manifest.json'));
  const manifest = JSON.parse(readFileSync(path.join(source, 'manifest.json'), 'utf8')) as Manifest;
  if (manifest.format !== 1 || manifest.condition !== 'clean-exit') fail('BACKUP_UNSUPPORTED_FORMAT');
  const data = path.join(source, 'data');
  const files = checkProfile(data);
  // Use the discovered allowlist, never manifest-supplied paths, for copying.
  if (JSON.stringify(manifest.files) !== JSON.stringify(files)) fail('BACKUP_CHECKSUM_MISMATCH');
  mkdirSync(target, { mode: 0o700 });
  writeFileSync(path.join(target, 'INCOMPLETE'), 'Do not launch this incomplete restore.\n', { flag: 'wx', mode: 0o600 });
  copyProfile(data, target, files);
  readProfile(target);
  if (JSON.stringify(files) !== JSON.stringify(hashes(data))) fail('BACKUP_CHANGED_DURING_RESTORE');
  unlinkSync(path.join(target, 'INCOMPLETE'));
}
