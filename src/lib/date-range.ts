export function dateKey(date: Date) {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`;
}

export function dayStartIso(date: Date) {
  // KST 00:00 on D = UTC 15:00 on D-1
  const d = new Date(date);
  d.setDate(d.getDate() - 1);
  return `${dateKey(d)}T15:00:00.000Z`;
}

export function dayEndIso(date: Date) {
  // KST 23:59:59.999 on D = UTC 14:59:59.999 on D+1
  const d = new Date(date);
  d.setDate(d.getDate() + 1);
  return `${dateKey(d)}T14:59:59.999Z`;
}
