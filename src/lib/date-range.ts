export function dateKey(date: Date) {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`;
}

export function dayStartIso(date: Date) {
  const key = dateKey(date);
  // KST is UTC+9, so KST 00:00 = UTC 15:00 previous day
  return `${key}T15:00:00.000Z`;
}

export function dayEndIso(date: Date) {
  const key = dateKey(date);
  // KST 23:59:59 = UTC next day 14:59:59
  return `${key}T14:59:59.999Z`;
}
