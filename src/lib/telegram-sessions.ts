function localParts(tz: string, date: Date) {
  const parts = new Intl.DateTimeFormat("en-US", { timeZone: tz, year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit", second: "2-digit", hourCycle: "h23" }).formatToParts(date);
  const value = (key: Intl.DateTimeFormatPartTypes) => Number(parts.find((part) => part.type === key)?.value);
  return { year: value("year"), month: value("month"), day: value("day"), hour: value("hour"), minute: value("minute"), second: value("second") };
}

export function timezoneOffsetMs(tz: string, date: Date): number {
  const p = localParts(tz, date);
  return Date.UTC(p.year, p.month - 1, p.day, p.hour, p.minute, p.second) - Math.floor(date.getTime() / 1000) * 1000;
}

function localWallTime(tz: string, wallMs: number): Date {
  let utc = wallMs;
  for (let i = 0; i < 4; i++) {
    const next = wallMs - timezoneOffsetMs(tz, new Date(utc));
    if (next === utc) break;
    utc = next;
  }
  return new Date(utc);
}

export function currentOffHoursSessionStart(tz: string, startHour: number, endHour: number, now = new Date()): Date | null {
  const p = localParts(tz, now);
  if (p.hour >= startHour && p.hour < endHour) return null;
  return localWallTime(tz, Date.UTC(p.year, p.month - 1, p.day - (p.hour < startHour ? 1 : 0), endHour));
}

export function sundaySessionStart(tz: string, now = new Date()): Date {
  const p = localParts(tz, now);
  return localWallTime(tz, Date.UTC(p.year, p.month - 1, p.day));
}