import assert from 'node:assert/strict';
import { execFileSync, spawnSync } from 'node:child_process';
import { readFileSync, readdirSync, rmSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { packageMac } from './package-mac.mjs';

const root = fileURLToPath(new URL('../', import.meta.url));
const packaged = packageMac({ validation: true });
try {
  const files = readdirSync(packaged.payload, { recursive: true, withFileTypes: true })
    .filter(entry => entry.isFile()).map(entry => path.relative(packaged.payload, path.join(entry.parentPath, entry.name))).sort();
  assert(files.includes('dist/src/main/index.js'));
  assert(files.includes('dist/src/renderer/prompt.html'));
  assert(files.every(file => file === 'package.json' || file === 'launch.cjs' || file.startsWith('dist/src/')));
  assert(files.every(file => !/\.(sqlite3?|db|env)$/.test(file)));
  for (const file of files.filter(file => file.startsWith('dist/src/'))) {
    assert.deepEqual(readFileSync(path.join(packaged.payload, file)), readFileSync(path.join(root, file)), file);
  }
  const identity = execFileSync('/usr/bin/plutil', ['-extract', 'CFBundleIdentifier', 'raw', path.join(packaged.bundle, 'Contents/Info.plist')], { encoding: 'utf8' }).trim();
  assert.equal(identity, 'local.jarvispet.validation');
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
