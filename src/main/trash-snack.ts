import {
  closeSync, constants, fstatSync, lstatSync, mkdtempSync, openSync, realpathSync,
  renameSync, rmdirSync, unlinkSync, type BigIntStats,
} from 'node:fs';
import { homedir } from 'node:os';
import path from 'node:path';
import { randomUUID } from 'node:crypto';
import { TrashSnackService, type TrashSnackBackend, type TrashSnackEntry,
  type TrashSnackHooks, type TrashSnackSnapshot } from '../assistant/trash-snack';
import type { TrashSnackCapabilities, TrashSnackPreparation } from '../shared/trash-snack';

/** No path/content logging. Only a relative preservation location is returned to UI. */
export interface TrashSnackRecoveryNotice { folderName: string; fileName: string }
const failure = (reason: 'unsafe-target' | 'invalid-selection' | 'busy' | 'unsupported') =>
  ({ status: 'blocked' as const, reason });
const stat = (file: string) => lstatSync(file, { bigint: true });
const objectId = (s: BigIntStats) => [s.dev, s.ino, s.birthtimeNs].join(':');
const contentId = (s: BigIntStats) => [objectId(s), s.size, s.mtimeNs, s.mode, s.uid, s.gid, s.nlink].join(':');
const identity = (s: BigIntStats) => `${contentId(s)}:${s.ctimeNs}`;
const regular = (s: BigIntStats) => s.isFile() && !s.isSymbolicLink() && s.nlink === 1n;
const safeName = (name: string) => !!name && name !== '.' && name !== '..'
  && !/[/\\\u0000-\u001f\u007f-\u009f\u202a-\u202e\u2066-\u2069]/u.test(name);

export function getTrashSnackCapabilities(): TrashSnackCapabilities {
  const available = process.platform === 'darwin';
  return { available, exactTrashOrder: false, conditionalDelete: false, dockDrop: false,
    selectionMode: 'user-selected', deletionSafety: 'staged-revalidation',
    message: available
      ? '휴지통에서 직접 고른 일반 파일 최대 2개를 최종 확인 후 영구삭제합니다. 외장 휴지통과 Dock 드롭은 아직 지원하지 않습니다.'
      : '휴지통 파일 선택은 macOS에서만 지원합니다.' };
}

/**
 * Main-owned adapter. Tests use an isolated synthetic root; production must use
 * createTrashSnackService(), which never accepts a root from renderer/IPC.
 *
 * No global enumeration, recursive deletion or alias resolution. Finder aliases
 * are ordinary files here: only the selected alias itself is removed, never its
 * target. Use Electron dialog's noResolveAliases option.
 *
 * Node has no compare-inode-and-unlink primitive. After final confirmation this
 * adapter captures one path with rename into a fresh 0700 folder, verifies the
 * captured object against an open O_NOFOLLOW descriptor, then unlinks it there.
 * This closes ordinary source-path replacement races without claiming protection
 * against a same-user/root process changing the private directory/ancestors, or
 * an already-open writer modifying content between the last check and unlink.
 * https://nodejs.org/api/fs.html#fsunlinkpath-callback
 */
export class SelectedTrashSnackBackend implements TrashSnackBackend {
  private selected: Array<{ id: string; file: string }> = [];
  private notices: TrashSnackRecoveryNotice[] = [];
  private rootIdentity?: string;
  private frozen = false;
  constructor(readonly root: string, private support = getTrashSnackCapabilities()) {}
  capabilities(): TrashSnackCapabilities { return { ...this.support }; }
  recoveryNotices(): TrashSnackRecoveryNotice[] { return this.notices.map(n => ({ ...n })); }

  setSelection(files: unknown): boolean {
    this.selected = []; this.rootIdentity = undefined;
    if (this.frozen || !Array.isArray(files) || files.length < 1 || files.length > 2) return false;
    const seen = new Set<string>();
    for (const file of files) {
      if (typeof file !== 'string' || !path.isAbsolute(file) || file !== path.normalize(file)
        || path.dirname(file) !== this.root || !safeName(path.basename(file)) || seen.has(file)) return false;
      seen.add(file);
    }
    this.selected = files.map(file => ({ id: randomUUID(), file: file as string }));
    return true;
  }

  private checkRoot(): BigIntStats {
    const s = stat(this.root);
    if (!s.isDirectory() || s.isSymbolicLink() || realpathSync(this.root) !== this.root
      || s.uid !== BigInt(process.getuid!()) || (s.mode & 0o022n) !== 0n) throw new Error('Unsafe trash root');
    const id = objectId(s);
    if (this.rootIdentity && this.rootIdentity !== id) throw new Error('Trash root changed');
    this.rootIdentity = id;
    return s;
  }

  async snapshot(): Promise<TrashSnackSnapshot> {
    if (this.frozen) throw new Error('Unresolved preservation');
    // No root access until main has supplied a nonempty, structurally valid selection.
    if (this.selected.length === 0) return { selectionMode: 'user-selected', complete: true,
      exactOrder: false, revision: 'no-selection', entries: [] };
    this.checkRoot();
    const entries = this.selected.map(({ id, file }): TrashSnackEntry => {
      const s = stat(file);
      if (!regular(s) || s.uid !== BigInt(process.getuid!()) || realpathSync(file) !== file) throw new Error('Unsafe selection');
      return { id, name: path.basename(file), identity: identity(s), kind: 'file', location: 'home-trash-root',
        linkCount: 1, trashOrder: null };
    });
    if (new Set(entries.map(e => e.identity)).size !== entries.length) throw new Error('Duplicate selection');
    return { selectionMode: 'user-selected', complete: true, exactOrder: false,
      revision: this.rootIdentity!, entries };
  }

  /** Overridable only by fixture subclasses to inject a deterministic race. */
  protected capture(source: string, destination: string): void { renameSync(source, destination); }

  async deleteIfUnchanged(expected: Readonly<TrashSnackEntry>): Promise<'deleted' | 'changed' | 'failed' | 'unknown'> {
    const item = this.selected.find(s => s.id === expected.id);
    if (this.frozen || !item || path.basename(item.file) !== expected.name) return 'changed';
    let descriptor: number | undefined;
    let stage: string | undefined;
    let captured = false;
    let removed = false;
    try {
      this.checkRoot();
      const before = stat(item.file);
      if (!regular(before) || identity(before) !== expected.identity) return 'changed';
      // Opening metadata does not read file contents. NOFOLLOW refuses a raced link.
      descriptor = openSync(item.file, constants.O_RDONLY | constants.O_NOFOLLOW | constants.O_NONBLOCK);
      const opened = fstatSync(descriptor, { bigint: true });
      if (!regular(opened) || identity(opened) !== expected.identity) return 'changed';
      stage = mkdtempSync(path.join(this.root, 'Jarvis Snack Pending-'));
      const stageId = objectId(stat(stage));
      const target = path.join(stage, expected.name);
      this.checkRoot();
      const immediatelyBefore = stat(item.file);
      if (!regular(immediatelyBefore) || identity(immediatelyBefore) !== expected.identity) return 'changed';
      this.capture(item.file, target);
      captured = true;
      const held = stat(target);
      // Rename changes ctime; retain object/birthtime/size/mtime/mode/ownership/nlink comparisons.
      if (!regular(held) || contentId(held) !== contentId(opened)
        || objectId(fstatSync(descriptor, { bigint: true })) !== objectId(held)) return 'unknown';
      this.checkRoot();
      const stageNow = stat(stage);
      if (!stageNow.isDirectory() || stageNow.isSymbolicLink() || objectId(stageNow) !== stageId
        || stageNow.uid !== BigInt(process.getuid!()) || (stageNow.mode & 0o077n) !== 0n
        || realpathSync(stage) !== stage) return 'unknown';
      if (identity(stat(target)) !== identity(held)
        || identity(fstatSync(descriptor, { bigint: true })) !== identity(held)) return 'unknown';
      unlinkSync(target); // One captured regular file only. Never rm/recursive deletion.
      removed = true;
      return 'deleted';
    } catch {
      return captured ? 'unknown' : 'failed';
    } finally {
      if (descriptor !== undefined) { try { closeSync(descriptor); } catch { /* No retry of deletion. */ } }
      if (stage) {
        if (captured && !removed) {
          this.frozen = true;
          this.notices.push({ folderName: path.basename(stage), fileName: expected.name });
        } else {
          // rmdir removes only an empty directory created by this operation. A
          // nonempty/raced folder is preserved; never recursively clean it up.
          try { rmdirSync(stage); } catch {
            this.notices.push({ folderName: path.basename(stage), fileName: expected.name });
          }
        }
      }
    }
  }
}

export class SelectedTrashSnackService extends TrashSnackService {
  constructor(private selectionBackend: SelectedTrashSnackBackend, hooks: TrashSnackHooks) {
    super(selectionBackend, hooks);
  }
  selectionRoot(): string { return this.selectionBackend.root; }
  recoveryNotices(): TrashSnackRecoveryNotice[] { return this.selectionBackend.recoveryNotices(); }
  async prepareSelection(files: unknown): Promise<TrashSnackPreparation> {
    if (!this.capabilities().available) return failure('unsupported');
    if (!this.canPrepareSelection()) return failure('busy');
    this.invalidateProposal();
    if (!this.selectionBackend.setSelection(files)) return failure('invalid-selection');
    const result = await this.prepare();
    // Metadata errors here mean the selection cannot be safely used. No raw
    // filesystem error/path is leaked and the caller can request another selection.
    return result.status === 'blocked' && result.reason === 'read-failed' ? failure('unsafe-target') : result;
  }
}

/** Constructing the service neither queries the trash nor creates any directory. */
export function createTrashSnackService(hooks: TrashSnackHooks): SelectedTrashSnackService {
  return new SelectedTrashSnackService(new SelectedTrashSnackBackend(path.join(homedir(), '.Trash')), hooks);
}
