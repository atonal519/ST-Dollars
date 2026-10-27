const ISO_DATE_TIME = /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})(?::(\d{2})(?:\.\d+)?)?(Z|([+-])(\d{2}):(\d{2}))?$/;

/** Formats explicit ISO date-time text without interpreting its timezone or changing story facts. */
export function formatStoryTime(value: string): string {
  const match = ISO_DATE_TIME.exec(value);
  if (!match) return value;
  const [, year, month, day, hour, minute, second = '00', zone, , offsetHour, offsetMinute] = match;
  const monthNumber = Number(month), dayNumber = Number(day);
  const yearNumber = Number(year);
  const leapYear = yearNumber % 4 === 0 && (yearNumber % 100 !== 0 || yearNumber % 400 === 0);
  const daysInMonth = [31, leapYear ? 29 : 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31][monthNumber - 1];
  const hourNumber = Number(hour), minuteNumber = Number(minute), secondNumber = Number(second);
  if (!daysInMonth || dayNumber < 1 || dayNumber > daysInMonth || hourNumber > 23 || minuteNumber > 59 || secondNumber > 59
    || Number(offsetHour ?? 0) > 23 || Number(offsetMinute ?? 0) > 59) return value;
  const timezone = zone === 'Z' ? ' UTC' : zone ? ` UTC${zone}` : '';
  return `${year}年${month}月${day}日 ${hour}:${minute}${timezone}`;
}
