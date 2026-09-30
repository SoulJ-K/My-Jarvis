import type { ScheduleDraft, SchedulePreview } from '../shared/schedule';

const pad = (value: number) => String(value).padStart(2, '0');
const localStamp = (date: Date) => `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())} ${pad(date.getHours())}:${pad(date.getMinutes())}`;
const fail = (message: string): SchedulePreview => ({ ok: false, message });
const hourWords = new Map<string, number>([
  ['한', 1], ['두', 2], ['세', 3], ['네', 4], ['다섯', 5], ['여섯', 6],
  ['일곱', 7], ['여덟', 8], ['아홉', 9], ['열', 10], ['열한', 11], ['열두', 12],
]);
const minuteDigits = new Map<string, number>([
  ['영', 0], ['일', 1], ['이', 2], ['삼', 3], ['사', 4], ['오', 5],
  ['육', 6], ['칠', 7], ['팔', 8], ['구', 9],
]);

function minuteWord(value: string): number {
  if (minuteDigits.has(value)) return minuteDigits.get(value)!;
  const match = /^([일이삼사오])?십([일이삼사오육칠팔구])?$/.exec(value);
  if (!match) return NaN;
  return (match[1] ? minuteDigits.get(match[1])! : 1) * 10 + (match[2] ? minuteDigits.get(match[2])! : 0);
}

function take(text: string, match: RegExpExecArray): string {
  return `${text.slice(0, match.index)} ${text.slice(match.index + match[0].length)}`.replace(/\s+/g, ' ').trim();
}

/** Bounded one-time grammar; infer only today's date or a uniquely future spoken hour. */
export function parseSchedule(id: string, input: unknown, now: number): SchedulePreview {
  if (typeof input !== 'string' || input.length > 200 || !input.trim())
    return fail('날짜·시각·알림 내용을 200자 안으로 적어 주세요.');
  const text = input.trim().replace(/[.!?]+$/, '').trim();
  if (/매일|매주|매월|반복/.test(text)) return fail('지금은 한 번만 울리는 알림을 지원합니다. 날짜를 하나 정해 주세요.');
  const dateMatch = /(?:^|\s)(오늘|내일|\d{4}-\d{2}-\d{2})(?:은|에)?(?=\s|$)/.exec(text);
  const requestedDate = dateMatch?.[1] ?? '오늘';
  let rest = dateMatch ? take(text, dateMatch) : text;
  const time = /(?:^|\s)(?:(오전|오후)\s*)?(?:(\d{1,2}):(\d{2})분?|([가-힣]+|\d{1,2})시(?:\s*(반|(?:\d{1,2}|[가-힣]+)분))?)(?:에|쯤)?(?=\s|$)/.exec(rest);
  if (!time) return fail('몇 시인가요? 예: 18:30, 오후 6시 반');
  let hour = time[2] !== undefined ? Number(time[2]) : hourWords.get(time[4]!) ?? Number(time[4]);
  const minuteText = time[5]?.replace(/분$/, '');
  const minute = time[3] !== undefined ? Number(time[3]) : time[5] === '반' ? 30 :
    minuteText === undefined ? 0 : /^\d+$/.test(minuteText) ? Number(minuteText) : minuteWord(minuteText);
  if (!Number.isInteger(hour) || !Number.isInteger(minute) || minute > 59 || (time[1] ? hour < 1 || hour > 12 : hour > 23))
    return fail('시각 범위를 확인해 주세요. 24시간은 00:00~23:59, 오전·오후는 1~12시입니다.');
  if (time[1]) hour = hour % 12 + (time[1] === '오후' ? 12 : 0);
  rest = take(rest, time);
  const taskMatch = /(?:^|\s)(알람|리마인더|알림)(?:\s*(?:해\s*줘|맞춰\s*줘|등록해\s*줘))?(?=\s|$)/.exec(rest);
  if (!taskMatch) return fail('알람인지 리마인더인지 알려 주세요. 예: 내일 오후 3시 리마인더 서류 확인');
  const kind = taskMatch[1] === '알람' ? 'alarm' : 'reminder';
  const requestedContent = take(rest, taskMatch).replace(/\s*(?:해\s*줘|알려\s*줘)[.!?]*$/, '')
    .trim().replace(/(을|를)$/, '');
  if (/(?:^|\s)(?:오늘|내일|\d{4}-\d{2}-\d{2}|알람|리마인더|알림)(?=\s|$)/.test(requestedContent) ||
      /(?:^|\s)(?:\d{1,2}:\d{2}|\d{1,2}시)(?=\s|$)/.test(requestedContent))
    return fail('날짜·시각·알림 종류는 한 번씩만 적어 주세요. 입력한 문장은 그대로 남겨두었습니다.');
  const content = requestedContent || (kind === 'alarm' ? '알람' : '');
  if (!content) return fail('무엇을 알려드릴까요? 리마인더 뒤에 할 일을 적어 주세요.');
  if (content.length > 120) return fail('알림 내용은 120자 안으로 적어 주세요.');
  let year: number, month: number, day: number;
  if (requestedDate === '오늘' || requestedDate === '내일') {
    const local = new Date(now);
    local.setHours(12, 0, 0, 0);
    if (requestedDate === '내일') local.setDate(local.getDate() + 1);
    [year, month, day] = [local.getFullYear(), local.getMonth() + 1, local.getDate()];
  } else [year, month, day] = requestedDate.split('-').map(Number);
  if (year < 1000 || year > 9999 || month < 1 || month > 12 || day < 1 || day > 31)
    return fail('존재하는 날짜를 YYYY-MM-DD로 적어 주세요.');
  // A spoken 1–12 o'clock has two possible instants. The request time and
  // explicit date can eliminate one; otherwise the user must choose.
  if (!time[1] && time[4] !== undefined && hour >= 1 && hour <= 12) {
    const candidates = [hour % 12, hour % 12 + 12].filter(candidate => {
      const local = new Date(year, month - 1, day, candidate, minute);
      return localStamp(local) === `${year}-${pad(month)}-${pad(day)} ${pad(candidate)}:${pad(minute)}` && local.getTime() > now;
    });
    if (candidates.length > 1) {
      const spokenTime = time[0].trim();
      const position = text.indexOf(spokenTime);
      if (position < 0) return fail('오전·오후 중 어느 때인가요?');
      return { ok: false, message: '오전·오후 중 어느 때인가요? 시간만 선택해 주세요. 아직 저장하지 않았습니다.',
        clarification: { choices: ['오전', '오후'].map(meridiem => ({
          label: `${meridiem} ${hour}:${pad(minute)}`,
          input: `${text.slice(0, position)}${meridiem} ${text.slice(position)}`,
        })) } };
    }
    if (candidates.length === 1) hour = candidates[0];
  }
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
  if (date.getTime() <= now) return fail('이미 지난 시각입니다. 입력한 문장은 그대로 두었습니다. 새 날짜·시각을 알려 주세요. 내일로 자동 변경하지 않았습니다.');
  const timeZone = Intl.DateTimeFormat().resolvedOptions().timeZone;
  const draft: ScheduleDraft = { id, kind, content, dueAt: date.getTime(), localDateTime: target,
    timeZone, utcOffsetMinutes: -date.getTimezoneOffset() };
  return { ok: true, draft, message: '날짜·시각·내용을 확인한 뒤 등록해 주세요. 아직 저장하지 않았습니다.' };
}
