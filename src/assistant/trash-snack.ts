import { randomUUID } from 'node:crypto';
import { performance } from 'node:perf_hooks';
import type {
  TrashSnackCapabilities, TrashSnackExecution, TrashSnackFailure, TrashSnackItemResult,
  TrashSnackMealResult, TrashSnackPreparation, TrashSnackProblem,
} from '../shared/trash-snack';

/** Main-process-only descriptor. A renderer must never construct one. */
export interface TrashSnackEntry {
  id: string;
  name: string;
  /** Backend's stable object/version identity, including rename/content/type changes. */
  identity: string;
  kind: 'file' | 'directory' | 'symlink' | 'alias' | 'package' | 'other';
  location: 'home-trash-root' | 'external-trash' | 'outside-trash';
  linkCount: number;
  /** Exact historical order, not birthtime/mtime/ctime/addedToDirectoryDate. Null = unknown. */
  trashOrder: number | null;
}
export interface TrashSnackSnapshot {
  selectionMode?: 'oldest-first' | 'user-selected';
  complete: boolean;
  exactOrder: boolean;
  /** Changes on any addition/removal/replacement/rename. */
  revision: string;
  entries: TrashSnackEntry[];
}
export interface TrashSnackBackend {
  capabilities(): TrashSnackCapabilities;
  snapshot(): Promise<TrashSnackSnapshot>;
  /**
   * Must revalidate identity, direct membership, type and single-link status.
   * capabilities.deletionSafety describes the actual guarantee; the production
   * staged-revalidation adapter is explicitly NOT an atomic conditional unlink.
   * 'deleted' means this exact item was deleted; disappearance alone is not success.
   */
  deleteIfUnchanged(entry: Readonly<TrashSnackEntry>): Promise<'deleted' | 'changed' | 'failed' | 'unknown'>;
}
export interface TrashSnackHooks {
  canEatSnack(): boolean;
  /** Called only when the caller reports actual eating-animation completion. */
  finishSnack(): void;
}
interface Proposal { id: string; expires: number; fingerprint: string; entries: TrashSnackEntry[] }
const CONFIRMATION_LIFETIME_MS = 120_000;
const blocked = (reason: TrashSnackProblem): TrashSnackFailure => ({ status: 'blocked', reason });

function select(snapshot: TrashSnackSnapshot): TrashSnackEntry[] | TrashSnackFailure {
  const selected = snapshot.selectionMode === 'user-selected';
  if (!snapshot.complete || (!selected && !snapshot.exactOrder) || !snapshot.revision) return blocked('untrusted-order');
  if (selected && snapshot.entries.length > 2) return blocked('invalid-selection');
  const ids = new Set<string>();
  const identities = new Set<string>();
  const orders = new Set<number>();
  const candidates: TrashSnackEntry[] = [];
  for (const entry of snapshot.entries) {
    if (!entry.id || ids.has(entry.id)) return blocked('unsafe-target');
    ids.add(entry.id);
    // Folders, app bundles and every link-like/unknown type are never traversed.
    if (entry.kind !== 'file') { if (selected) return blocked('unsafe-target'); else continue; }
    if (entry.location !== 'home-trash-root' || entry.linkCount !== 1 || !entry.identity || identities.has(entry.identity)
      || !entry.name || entry.name === '.' || entry.name === '..'
      || /[/\\\u0000-\u001f\u007f-\u009f\u202a-\u202e\u2066-\u2069]/u.test(entry.name)) return blocked('unsafe-target');
    // Ties are ambiguous: don't choose an arbitrary name/ID to pretend exact order.
    if (!selected) {
      if (entry.trashOrder === null || !Number.isSafeInteger(entry.trashOrder) || entry.trashOrder < 0
        || orders.has(entry.trashOrder)) return blocked('untrusted-order');
      orders.add(entry.trashOrder);
    }
    identities.add(entry.identity);
    candidates.push({ ...entry });
  }
  return selected ? candidates : candidates.sort((a, b) => a.trashOrder! - b.trashOrder!).slice(0, 2);
}

function fingerprint(snapshot: TrashSnackSnapshot): string {
  return JSON.stringify([snapshot.selectionMode, snapshot.revision, snapshot.entries.map(e => [e.id, e.name, e.identity,
    e.kind, e.location, e.linkCount, e.trashOrder]).sort((a, b) => String(a[0]).localeCompare(String(b[0])))]);
}

/** Pure orchestration; no fs, shell, Electron, permission prompt or automatic retry. */
export class TrashSnackService {
  private proposal?: Proposal;
  private busy = false;
  private mealOperation?: string;
  private uncertain = false;
  constructor(private backend: TrashSnackBackend, private hooks: TrashSnackHooks,
    private clock: () => number = () => performance.now()) {}

  capabilities(): TrashSnackCapabilities { return { ...this.backend.capabilities() }; }

  private supported(): boolean {
    const c = this.capabilities();
    return c.available && ((c.selectionMode === 'user-selected' && c.deletionSafety === 'staged-revalidation')
      || (c.exactTrashOrder && c.conditionalDelete));
  }

  /** Main-process selection adapters must call this before replacing selections. */
  canPrepareSelection(): boolean { return !this.busy && !this.mealOperation && !this.uncertain; }
  invalidateProposal(): void { if (!this.busy) this.proposal = undefined; }

  private canEat(): boolean {
    try { return this.hooks.canEatSnack() === true; } catch { return false; }
  }

  async prepare(): Promise<TrashSnackPreparation> {
    if (!this.supported()) return blocked('unsupported');
    if (this.busy || this.mealOperation || this.uncertain) return blocked('busy');
    this.proposal = undefined; // A newer prompt invalidates any old confirmation.
    if (!this.canEat()) return blocked('cannot-eat');
    this.busy = true;
    try {
      const snapshot = await this.backend.snapshot();
      const entries = select(snapshot);
      if (!Array.isArray(entries)) return entries;
      if (entries.length === 0) return blocked('empty');
      if (!this.canEat()) return blocked('cannot-eat');
      const now = this.clock();
      if (!Number.isFinite(now)) return blocked('expired');
      const id = randomUUID();
      this.proposal = { id, expires: now + CONFIRMATION_LIFETIME_MS, fingerprint: fingerprint(snapshot), entries };
      return { status: 'confirmation-required', operationId: id,
        candidates: entries.map(e => ({ id: e.id, name: e.name })),
        warning: '표시된 파일을 영구삭제합니다. 되돌릴 수 없습니다. 이 파일들을 삭제할까요?' };
    } catch { return blocked('read-failed'); }
    finally { this.busy = false; }
  }

  cancel(operationId: unknown): boolean {
    if (!this.proposal || this.proposal.id !== operationId || this.busy) return false;
    this.proposal = undefined;
    return true;
  }

  async confirm(input: unknown): Promise<TrashSnackExecution> {
    if (!this.supported()) return blocked('unsupported');
    if (this.busy || this.mealOperation || this.uncertain) return blocked('busy');
    if (!input || typeof input !== 'object' || Array.isArray(input)) return blocked('invalid-confirmation');
    const request = input as Record<string, unknown>;
    if (Object.keys(request).some(key => key !== 'operationId' && key !== 'permanentlyDelete')
      || request.permanentlyDelete !== true || !this.proposal
      || this.proposal.id !== request.operationId) return blocked('invalid-confirmation');
    const proposal = this.proposal;
    this.proposal = undefined; // Consume BEFORE asynchronous work; never replay authority.
    const now = this.clock();
    if (!Number.isFinite(now) || now >= proposal.expires) return blocked('expired');
    if (!this.canEat()) return blocked('cannot-eat');
    this.busy = true;
    try {
      const current = await this.backend.snapshot();
      const entries = select(current);
      if (!Array.isArray(entries)) return entries;
      if (fingerprint(current) !== proposal.fingerprint) return blocked('changed');
      const validatedAt = this.clock();
      if (!Number.isFinite(validatedAt) || validatedAt >= proposal.expires) return blocked('expired');
      if (!this.canEat()) return blocked('cannot-eat');
      const items: TrashSnackItemResult[] = [];
      let stop = false;
      for (const entry of proposal.entries) {
        let status: TrashSnackItemResult['status'] = 'not-attempted';
        if (!stop && this.canEat()) {
          try {
            const result = await this.backend.deleteIfUnchanged(Object.freeze({ ...entry }));
            status = ['deleted', 'changed', 'failed', 'unknown'].includes(result) ? result : 'unknown';
          } catch { status = 'unknown'; } // Could have deleted before throwing; never claim failure/undo.
        }
        items.push({ id: entry.id, name: entry.name, status });
        if (status !== 'deleted') stop = true;
      }
      const allDeleted = items.every(item => item.status === 'deleted');
      const anyDeleted = items.some(item => item.status === 'deleted');
      const unknown = items.some(item => item.status === 'unknown');
      if (unknown) this.uncertain = true; // Requires external reconciliation; no retry API.
      if (allDeleted) this.mealOperation = proposal.id;
      return { status: unknown ? 'unknown' : allDeleted ? 'completed' : anyDeleted ? 'partial' : 'failed',
        operationId: proposal.id, items, mealReady: allDeleted };
    } catch { return blocked('read-failed'); }
    finally { this.busy = false; }
  }

  /** Call only after a successful batch AND the actual eating animation ends. */
  completeMeal(operationId: unknown): TrashSnackMealResult {
    if (!this.mealOperation || this.mealOperation !== operationId) return 'not-ready';
    this.mealOperation = undefined; // Reentrant/duplicate completion must not write twice.
    this.busy = true;
    try { this.hooks.finishSnack(); return 'recorded'; }
    catch { this.uncertain = true; return 'unknown'; }
    finally { this.busy = false; }
  }
}
