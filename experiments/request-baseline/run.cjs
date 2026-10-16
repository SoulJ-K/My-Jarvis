// Runs group-A requests through the built parsers with the same routing as src/renderer/prompt.ts.
// Usage: npm run build && node experiments/request-baseline/run.cjs
// Prints raw parser output only; success is judged by a person against the intent in requests.json.
process.env.TZ = 'Asia/Seoul';
const path = require('path');
const fs = require('fs');

const root = path.resolve(__dirname, '../..');
const { parseTimerInput } = require(path.join(root, 'dist/src/assistant/timer.js'));
const { parseSchedule } = require(path.join(root, 'dist/src/assistant/time-parser.js'));
const data = JSON.parse(fs.readFileSync(path.join(__dirname, 'requests.json'), 'utf8'));
const now = new Date(data.baseTime).getTime();

// Keep in sync with the calendar check in src/renderer/prompt.ts.
const isCalendar = text => !/타이머/.test(text) && /알람|알림|리마인더|오늘|내일|오전|오후|\d{4}-\d{2}-\d{2}|\d{1,2}:\d{2}/.test(text);

function run(text) {
  if (isCalendar(text)) {
    const reply = parseSchedule('baseline', text, now);
    return reply.ok
      ? { route: 'schedule', accepted: true, output: `${reply.draft.kind} ${reply.draft.localDateTime} "${reply.draft.content}"` }
      : { route: 'schedule', accepted: false, output: reply.message };
  }
  const timer = parseTimerInput(text);
  return timer
    ? { route: 'timer', accepted: true, output: `${timer.durationMs / 60000}분 "${timer.title}"` }
    : { route: 'timer', accepted: false, output: '(해석 안 됨)' };
}

const rows = [...data.groupA, ...data.probes].map(item => ({ id: item.id, judgement: item.judgement ?? '-', ...run(item.text), text: item.text }));
for (const row of rows) console.log(`${row.id}\t${row.judgement}\t${row.accepted ? 'accepted' : 'rejected'}\t${row.route}\t${row.output}\t${row.text}`);

const success = data.groupA.filter(item => item.judgement === 'success').length;
console.log(`\nrecorded success: ${success}/${data.groupA.length} (${(success / data.groupA.length * 100).toFixed(1)}%)`);
const tags = {};
for (const item of data.groupA) for (const tag of item.tags) tags[tag] = (tags[tag] ?? 0) + 1;
console.log('tags:', Object.entries(tags).sort((a, b) => b[1] - a[1]).map(([tag, n]) => `${tag} ${n}`).join(', '));
