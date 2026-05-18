export function dateKey(date: Date) {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`;
}

export function dayStartIso(date: Date) {
  return `${dateKey(date)}T00:00:00.000Z`;
}

export function dayEndIso(date: Date) {
  return `${dateKey(date)}T23:59:59.999Z`;
}