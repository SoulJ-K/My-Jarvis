import type { ScheduleDraft, SchedulePreview } from '../shared/schedule';

const pad = (value: number) => String(value).padStart(2, '0');
const localStamp = (date: Date) => `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())} ${pad(date.getHours())}:${pad(date.getMinutes())}`;
const fail = (message: string): SchedulePreview => ({ ok: false, message });

/** Deliberately bounded grammar; never guesses a date, meridiem or recurrence. */
export function parseSchedule(id: string, input: unknown, now: number): SchedulePreview {
  if (typeof input !== 'string' || input.length > 200 || !input.trim())
    return fail('날짜·시각·알림 내용을 200자 안으로 적어 주세요.');
  const text = input.trim();
  if (/매일|매주|매월|반복/.test(text)) return fail('지금은 한 번만 울리는 알림을 지원합니다. 날짜를 하나 정해 주세요.');
  const dateMatch = /^(오늘|내일|\d{4}-\d{2}-\d{2})\s+/.exec(text);
  if (!dateMatch) return fail('어느 날짜인가요? 오늘·내일 또는 YYYY-MM-DD를 앞에 적어 주세요.');
  const rest = text.slice(dateMatch[0].length);
  const time = /^(?:(\d{1,2}):(\d{2})|(오전|오후)\s*(\d{1,2})시(?:\s*(\d{1,2})분)?)\s+/.exec(rest);
  if (!time) return fail('몇 시인가요? 24시간 시각(예: 15:00) 또는 오전·오후를 적어 주세요.');
  let hour = time[1] === undefined ? Number(time[4]) : Number(time[1]);
  const minute = Number(time[2] ?? time[5] ?? 0);
  if (minute > 59 || (time[3] ? hour < 1 || hour > 12 : hour > 23))
    return fail('시각 범위를 확인해 주세요. 24시간은 00:00~23:59, 오전·오후는 1~12시입니다.');
  if (time[3]) hour = hour % 12 + (time[3] === '오후' ? 12 : 0);
  const task = rest.slice(time[0].length).trim();
  const taskMatch = /^(알람|리마인더)(?:\s+(.+))?$/.exec(task);
  if (!taskMatch) return fail('시각 뒤에 “알람” 또는 “리마인더 할 일”을 적어 주세요. 예: 내일 오후 3시 리마인더 서류 확인');
  const kind = taskMatch[1] === '알람' ? 'alarm' : 'reminder';
  const content = taskMatch[2]?.trim() || (kind === 'alarm' ? '알람' : '');
  if (!content) return fail('무엇을 알려드릴까요? 리마인더 뒤에 할 일을 적어 주세요.');
  if (content.length > 120) return fail('알림 내용은 120자 안으로 적어 주세요.');
  let year: number, month: number, day: number;
  if (dateMatch[1] === '오늘' || dateMatch[1] === '내일') {
    const local = new Date(now);
    local.setHours(12, 0, 0, 0);
    if (dateMatch[1] === '내일') local.setDate(local.getDate() + 1);
    [year, month, day] = [local.getFullYear(), local.getMonth() + 1, local.getDate()];
  } else [year, month, day] = dateMatch[1].split('-').map(Number);
  if (year < 1000 || year > 9999 || month < 1 || month > 12 || day < 1 || day > 31)
    return fail('존재하는 날짜를 YYYY-MM-DD로 적어 주세요.');
  const target = `${year}-${pad(month)}-${pad(day)} ${pad(hour)}:${pad(minute)}`;
  const date = new Date(year, month - 1, day, hour, minute);
  // Date normalizes invalid dates and DST gaps; reject rather than silently move them.
  if (localStamp(date) !== target) return fail('존재하지 않는 날짜·시각입니다. 날짜 또는 시간대의 시각 변경을 확인해 주세요.');
  // Find both instants during a DST fold, including half-hour transitions.
  const offsets = new Set<number>();
  for (let h = -26; h <= 26; h++) offsets.add(new Date(date.getTime() + h * 3600000).getTimezoneOffset());
  const nominal = Date.UTC(year, month - 1, day, hour, minute);
  const matches = [...offsets].map(offset => nominal + offset * 60000)
    .filter(instant => localStamp(new Date(instant)) === target);
  if (matches.length !== 1) return fail('시간대 변경으로 두 번 오는 시각입니다. 겹치지 않는 다른 시각을 정해 주세요.');
  if (date.getTime() <= now) return fail('이미 지난 시각입니다. 미래 날짜·시각을 적어 주세요. 자동으로 내일로 넘기지 않았습니다.');
  const timeZone = Intl.DateTimeFormat().resolvedOptions().timeZone;
  const draft: ScheduleDraft = { id, kind, content, dueAt: date.getTime(), localDateTime: target,
    timeZone, utcOffsetMinutes: -date.getTimezoneOffset() };
  return { ok: true, draft, message: '날짜·시각·내용을 확인한 뒤 등록해 주세요. 아직 저장하지 않았습니다.' };
}
