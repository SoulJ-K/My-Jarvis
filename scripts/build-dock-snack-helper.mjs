import { execFileSync } from 'node:child_process';
import { existsSync, mkdirSync } from 'node:fs';
import { homedir } from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

/** Build only; never launch UI, download headers, install tools or change signing settings.
 * Export name is retained for callers; output is now an in-process Node-API addon.
 */
export function buildDockSnackHelper(outputDirectory) {
  if (process.platform !== 'darwin') throw new Error('MACOS_REQUIRED');
  const root = fileURLToPath(new URL('../', import.meta.url));
  const headers = process.env.NODE_HEADERS_DIR
    ? path.resolve(process.env.NODE_HEADERS_DIR)
    : path.join(homedir(), 'Library', 'Caches', 'node-gyp', process.versions.node, 'include', 'node');
  if (!['node_api.h', 'js_native_api.h', 'node_api_types.h', 'js_native_api_types.h'].every(name => existsSync(path.join(headers, name)))) {
    throw new Error('LOCAL_NODE_HEADERS_REQUIRED: set NODE_HEADERS_DIR to an existing include/node directory; no automatic download');
  }
  const out = outputDirectory ?? path.join(root, 'dist/native');
  mkdirSync(out, { recursive: true });
  const addon = path.join(out, 'jarvis-dock-snack.node');
  const compiler = execFileSync('/usr/bin/xcrun', ['--find', 'clang++'], { encoding: 'utf8' }).trim();
  const sdk = execFileSync('/usr/bin/xcrun', ['--show-sdk-path'], { encoding: 'utf8' }).trim();
  execFileSync(compiler, ['-O2', '-std=c++17', '-fobjc-arc', '-fblocks', '-DNAPI_VERSION=8',
    '-DNODE_GYP_MODULE_NAME=jarvis_dock_snack', '-I', headers, '-isysroot', sdk,
    '-bundle', '-undefined', 'dynamic_lookup', '-framework', 'AppKit', '-framework', 'Foundation',
    path.join(root, 'scripts/dock-snack-native.mm'), '-o', addon], { stdio: 'pipe' });
  return addon;
}
if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  console.log(buildDockSnackHelper());
}
