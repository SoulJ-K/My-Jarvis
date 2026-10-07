// Local-only static trial. No Electron startup, pet store, external requests or writes.
const http = require('node:http');
const fs = require('node:fs');
const path = require('node:path');
const allowed = new Set(['index.html', 'trial.css', 'trial.js', 'assets.js', 'geometry.js', 'facing.js',
  ...['leaf', 'wing'].flatMap(f => ['stand', 'sit', 'sleep'].map(p => `materials/working/v001/${f}-${p}.png`)),
  ...['leaf', 'wing'].flatMap(f => ['stand', 'sit'].flatMap(p => ['front', 'left'].map(d => `materials/working/v002/${f}-${p}-${d}.png`))),
  ...['leaf', 'wing'].flatMap(f => ['left', 'right'].map(d => `materials/working/v003/${f}-head-${d}.png`))]);
function createTrialServer() {
  return http.createServer((req, res) => {
    if (req.method !== 'GET' && req.method !== 'HEAD') { res.writeHead(405); res.end(); return; }
    let file;
    try { file = decodeURIComponent(new URL(req.url, 'http://localhost').pathname).slice(1) || 'index.html'; }
    catch { res.writeHead(400); res.end(); return; }
    if (!allowed.has(file)) { res.writeHead(404); res.end(); return; }
    const mime = { '.html': 'text/html; charset=utf-8', '.css': 'text/css; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.png': 'image/png' };
    fs.readFile(path.join(__dirname, file), (error, bytes) => {
      if (error) { res.writeHead(404); res.end(); return; }
      res.writeHead(200, { 'Content-Type': mime[path.extname(file)], 'Cache-Control': 'no-store', 'X-Content-Type-Options': 'nosniff', 'Cross-Origin-Resource-Policy': 'same-origin' });
      res.end(req.method === 'HEAD' ? undefined : bytes);
    });
  });
}
module.exports = { createTrialServer };
if (require.main === module) {
  const port = Number(process.env.TRIAL_PORT || 0);
  if (!Number.isInteger(port) || port < 0 || port > 65535) throw new Error('INVALID_TRIAL_PORT');
  const server = createTrialServer();
  server.listen(port, '127.0.0.1', () => console.log(`외형 시험: http://127.0.0.1:${server.address().port}\n종료: Ctrl+C (펫 앱과 별개)`));
}
