import { randomUUID } from 'node:crypto';
import path from 'node:path';

export interface DockSnackDragImage {
  imagePNGBase64: string;
  /** Logical image size and pointer hotspot, measured from the image's top left. */
  width: number; height: number; hotSpotX: number; hotSpotY: number;
}
export type DockSnackDragResult =
  | { kind: 'snack-requested' | 'cancelled'; screenPoint: { x: number; y: number } }
  | { kind: 'unavailable' | 'failed' | 'busy'; reason: string };
export type DockSnackDiagnostic = { code: 'in-process-native-v4' } | {
  code: 'drag-summary'; durationMs: number; moves: number; externalMaskQueries: number;
  localMaskQueries: number; endedWhileButtonDown: boolean; operationRaw: number;
};
/** Main process only. Never expose this interface or a native handle to a renderer. */
export interface DockNativeBridge {
  attach(handle: Buffer): number;
  start(token: number, payload: string, receive: (event: string) => void): void;
  cancel(token: number): void;
  dispose(token: number): void;
  selfTest(): boolean;
}
export interface DockSnackControllerOptions {
  helperPath: string;
  nativeHandle: Buffer;
  /** Dependency injection: pure tests do not load AppKit or create windows. */
  bridge?: DockNativeBridge;
  platform?: NodeJS.Platform;
  timeoutMs?: number;
  onDiagnostic?: (diagnostic: DockSnackDiagnostic) => void;
}
export function dockSnackHelperPath(appRoot: string): string {
  return path.join(appRoot, 'dist', 'native', 'jarvis-dock-snack.node');
}
export function validDockSnackImage(input: unknown): input is DockSnackDragImage {
  if (!input || typeof input !== 'object' || Array.isArray(input)) return false;
  const data = input as Record<string, unknown>;
  if (Object.keys(data).some(key => !['imagePNGBase64', 'width', 'height', 'hotSpotX', 'hotSpotY'].includes(key))) return false;
  const { imagePNGBase64, width, height, hotSpotX, hotSpotY } = data;
  if (typeof imagePNGBase64 !== 'string' || imagePNGBase64.length > 700_000
    || !/^[A-Za-z0-9+/]+={0,2}$/.test(imagePNGBase64)) return false;
  if (![width, height, hotSpotX, hotSpotY].every(value => typeof value === 'number' && Number.isFinite(value))) return false;
  if ((width as number) < 1 || (width as number) > 1024 || (height as number) < 1 || (height as number) > 1024
    || (hotSpotX as number) < 0 || (hotSpotX as number) > (width as number)
    || (hotSpotY as number) < 0 || (hotSpotY as number) > (height as number)) return false;
  const bytes = Buffer.from(imagePNGBase64, 'base64');
  return bytes.length >= 24 && bytes.length <= 512_000
    && bytes.subarray(0, 8).equals(Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]))
    && bytes.subarray(12, 16).toString('ascii') === 'IHDR'
    && bytes.readUInt32BE(16) > 0 && bytes.readUInt32BE(16) <= 2048
    && bytes.readUInt32BE(20) > 0 && bytes.readUInt32BE(20) <= 2048;
}

/** Owns one native gesture. A delete signal requests selection, never file deletion. */
export class DockSnackController {
  private bridge?: DockNativeBridge;
  private token?: number;
  private active?: () => void;
  private disposed = false;
  private unavailable = 'native-unavailable';
  constructor(private options: DockSnackControllerOptions) {
    if ((options.platform ?? process.platform) !== 'darwin') { this.unavailable = 'not-macos'; return; }
    if (!path.isAbsolute(options.helperPath) || !Buffer.isBuffer(options.nativeHandle)
      || options.nativeHandle.length !== 8) { this.unavailable = 'invalid-handle'; return; }
    try {
      // This main-owned path and handle cannot be supplied by renderer IPC.
      const bridge: DockNativeBridge = options.bridge ?? require(options.helperPath);
      const token = bridge.attach(options.nativeHandle);
      if (!Number.isSafeInteger(token) || token < 1) throw Error('invalid-native-token');
      this.bridge = bridge; this.token = token;
    } catch { /* Missing module/closed window is safely unavailable, not a subprocess fallback. */ }
  }

  start(image: DockSnackDragImage, onStarted: () => void = () => {}): Promise<DockSnackDragResult> {
    if (this.disposed) return Promise.resolve({ kind: 'unavailable', reason: 'disposed' });
    if (!this.bridge || this.token === undefined) return Promise.resolve({ kind: 'unavailable', reason: this.unavailable });
    if (this.active) return Promise.resolve({ kind: 'busy', reason: 'drag-active' });
    if (!validDockSnackImage(image)) return Promise.resolve({ kind: 'failed', reason: 'invalid-input' });
    const bridge = this.bridge, token = this.token, requestId = randomUUID();
    return new Promise(resolve => {
      let settled = false, started = false, terminal = false, outputLength = 0;
      const diagnostics = new Set<string>();
      let timer: ReturnType<typeof setTimeout>;
      const finish = (result: DockSnackDragResult, cancel = false) => {
        if (settled) return;
        settled = true; clearTimeout(timer); this.active = undefined;
        if (cancel) { try { bridge.cancel(token); } catch {} }
        resolve(result);
      };
      const fail = (reason: string) => finish({ kind: 'failed', reason }, true);
      this.active = () => fail('cancelled');
      timer = setTimeout(() => fail('timeout'), this.options.timeoutMs ?? 50_000);
      const receive = (line: string) => {
        if (settled) return;
        if (typeof line !== 'string' || (outputLength += line.length) > 8192) { fail('protocol-error'); return; }
        try {
          const event = JSON.parse(line) as Record<string, unknown>;
          if (!event || typeof event !== 'object' || Array.isArray(event) || terminal
            || event.protocolVersion !== 1 || event.requestId !== requestId) { fail('protocol-error'); return; }
          if (event.event === 'diagnostic') {
            const code = event.code;
            const bounded = (v: unknown, max: number) => typeof v === 'number' && Number.isInteger(v) && v >= 0 && v <= max;
            if (typeof code !== 'string' || diagnostics.has(code)) { fail('protocol-error'); return; }
            let diagnostic: DockSnackDiagnostic;
            if (code === 'in-process-native-v4' && !started && Object.keys(event).length === 4) {
              diagnostic = { code };
            } else if (code === 'drag-summary' && started && Object.keys(event).length === 10
              && bounded(event.durationMs, 60_000) && bounded(event.moves, 100_000)
              && bounded(event.externalMaskQueries, 100_000) && bounded(event.localMaskQueries, 100_000)
              && typeof event.endedWhileButtonDown === 'boolean' && bounded(event.operationRaw, 0xffff_ffff)) {
              diagnostic = { code, durationMs: event.durationMs as number, moves: event.moves as number,
                externalMaskQueries: event.externalMaskQueries as number, localMaskQueries: event.localMaskQueries as number,
                endedWhileButtonDown: event.endedWhileButtonDown, operationRaw: event.operationRaw as number };
            } else { fail('protocol-error'); return; }
            diagnostics.add(code);
            try { this.options.onDiagnostic?.(diagnostic); } catch { /* Diagnostics cannot authorize actions. */ }
          } else if (event.event === 'started') {
            if (started || Object.keys(event).length !== 3) { fail('protocol-error'); return; }
            started = true;
            try { onStarted(); } catch { fail('callback-failed'); }
          } else if (event.event === 'ended') {
            const point = event.screenPoint as {x?: unknown; y?: unknown} | undefined;
            if (!started || Object.keys(event).length !== 5 || !point || typeof point !== 'object'
              || Object.keys(point).length !== 2 || typeof point.x !== 'number' || typeof point.y !== 'number'
              || !Number.isFinite(point.x) || !Number.isFinite(point.y)
              || Math.abs(point.x) > 1_000_000 || Math.abs(point.y) > 1_000_000
              || !['delete','none'].includes(event.operation as string)) { fail('protocol-error'); return; }
            terminal = true;
            const result: DockSnackDragResult = {kind:event.operation === 'delete' ? 'snack-requested':'cancelled',
              screenPoint:{x:point.x,y:point.y}};
            // Synchronous duplicate/malformed terminal output must not authorize a request.
            queueMicrotask(() => finish(result));
          } else if (event.event === 'failed') {
            const allowed = ['button-released','invalid-image','timeout','source-unavailable','drag-busy','missing-mouse-down','stale-mouse-down','native-start-failed','native-exception'];
            fail(Object.keys(event).length === 4 && allowed.includes(event.reason as string) ? event.reason as string : 'native-failed');
          } else fail('protocol-error');
        } catch { fail('protocol-error'); }
      };
      try { bridge.start(token, JSON.stringify({protocolVersion:1,requestId,...image}), receive); }
      catch { fail('native-failed'); }
    });
  }
  cancel(): void { this.active?.(); }
  dispose(): void {
    if (this.disposed) return;
    this.disposed = true; this.cancel();
    if (this.bridge && this.token !== undefined) { try { this.bridge.dispose(this.token); } catch {} }
    this.bridge = undefined; this.token = undefined;
  }
}
