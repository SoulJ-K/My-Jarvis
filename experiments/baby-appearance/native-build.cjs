// Build a separate runtime. Never changes the ordinary dist or installed app.
const fs = require('node:fs');
const path = require('node:path');
const { execFileSync } = require('node:child_process');
const root = path.resolve(__dirname, '../..');
const runtime = path.join(root, '.local/appearance-trial/native-runtime');
fs.mkdirSync(runtime, { recursive: true });
execFileSync(path.join(root, 'node_modules/.bin/tsc'), ['--outDir', runtime], { cwd: root, stdio: 'inherit' });
const renderer = path.join(runtime, 'src/renderer');
for (const name of fs.readdirSync(path.join(root, 'src/renderer'))) {
  if (/\.(html|css)$/.test(name)) fs.copyFileSync(path.join(root, 'src/renderer', name), path.join(renderer, name));
}
const trial = path.join(renderer, 'appearance');
fs.mkdirSync(trial, { recursive: true });
for (const name of ['assets.js', 'geometry.js', 'facing.js', 'native.js', 'native.css']) fs.copyFileSync(path.join(__dirname, name), path.join(trial, name));
for (const version of ['v001', 'v002', 'v003']) fs.cpSync(path.join(__dirname, 'materials/working', version), path.join(trial, 'materials/working', version), { recursive: true });
const index = path.join(renderer, 'index.html');
fs.writeFileSync(index, fs.readFileSync(index, 'utf8').replace('</head>', '<link rel="stylesheet" href="appearance/native.css">\n' + ['assets.js','geometry.js','facing.js','native.js'].map(n => `<script src="appearance/${n}" defer></script>`).join('\n') + '\n</head>'));
const preload = path.join(runtime, 'src/preload/index.js');
fs.appendFileSync(preload, `\nrequire('electron').contextBridge.exposeInMainWorld('appearanceTrial', {read:()=>require('electron').ipcRenderer.invoke('appearance:read'), frame:(pose,view)=>require('electron').ipcRenderer.invoke('appearance:frame',pose,view)});\n`);
console.log('Isolated native runtime built:', runtime);
