import type { StoryTurn } from '../application/contracts';

function numericDate(value:string):string {
  return value.replace(/^(\d{4})年(\d{1,2})月(\d{1,2})日\s*[T ]?\s*(\d{1,2}):(\d{2})(?::(\d{2}))?$/,(_all,year,month,day,hour,minute,second)=>`${year}-${month.padStart(2,'0')}-${day.padStart(2,'0')}T${hour.padStart(2,'0')}:${minute}${second===undefined?'':':'+second}`);
}
/** Normalizes only an explicit Gregorian value; other calendars remain untouched. */
export function normalizeStoryTime(value:string):string {
  const converted=numericDate(value.trim());
  return converted!==value.trim()&&storyMinutes(converted)!==null?converted:value;
}

/** Gregorian numbers from explicit story metadata, never the host's real clock. */
export function storyMinutes(value: unknown): number | null {
  if (typeof value !== 'string') return null;
  const match = /^(\d{4})-(\d{1,2})-(\d{1,2})[T ](\d{1,2}):(\d{2})(?::(\d{2}))?$/.exec(numericDate(value.trim()));
  if (!match) return null;
  const [year, month, day, hour, minute, second = 0] = match.slice(1).map(value=>Number(value ?? 0));
  const stamp = Date.UTC(year, month - 1, day, hour, minute, second), date = new Date(stamp);
  return date.getUTCFullYear() === year && date.getUTCMonth() === month - 1 && date.getUTCDate() === day && hour < 24 && minute < 60 && second < 60 ? stamp / 60000 : null;
}
function numericClock(text: string): string | null {
  const iso = /\b\d{4}-\d{1,2}-\d{1,2}[T ]\d{1,2}:\d{2}(?::\d{2})?\b/.exec(text)?.[0];
  const date = /\bdate\s*=\s*(\d{4}年\d{1,2}月\d{1,2}日|\d{4}-\d{1,2}-\d{1,2})/i.exec(text)?.[1];
  const time = /\btime\s*=\s*(\d{1,2}:\d{2}(?::\d{2})?)\b/i.exec(text)?.[1];
  const value = iso ?? (date && time ? `${date}T${time}` : /^\d{4}年/.test(text.trim())?text.trim():null);
  if (!value || storyMinutes(value) === null) return null;
  return /年/.test(value)?normalizeStoryTime(value):new Date(storyMinutes(value)! * 60000).toISOString().slice(0, 19);
}
export function readStoryClock(turns: StoryTurn[]): string | null {
  const last = turns.filter(turn => !turn.isUser).at(-1);
  if (!last) return null;
  const endings = [...last.text.matchAll(/<!--\s*(?:SDC|QQJ|myknots)-end\b([\s\S]*?)-->/gi)];
  if (endings.length) {
    const values = endings.map(match => numericClock(match[1]));
    return values.every(value => value !== null && value === values[0]) ? values[0] : null;
  }
  const dates = [...last.text.matchAll(/<date>([^<]*)<\/date\s*>/gi)].map(match => match[1].trim());
  const times = [...last.text.matchAll(/<time>([^<]*)<\/time\s*>/gi)].map(match => match[1].trim());
  if (!dates.length || !times.length || new Set(dates).size !== 1 || new Set(times).size !== 1) return null;
  return numericClock(`${dates[0]}T${times[0]}`);
}
