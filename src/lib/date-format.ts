import { format } from "date-fns";

type DateInput = string | number | Date | null | undefined;

function toDate(value: DateInput): Date | null {
  if (value === null || value === undefined || value === "") return null;
  const d = value instanceof Date ? value : new Date(value);
  return Number.isNaN(d.getTime()) ? null : d;
}

/** Display date as yyyy-MM-dd. */
export function formatDate(value: DateInput, fallback = "-"): string {
  const d = toDate(value);
  return d ? format(d, "yyyy-MM-dd") : fallback;
}

/** Display date and time as yyyy-MM-dd HH:mm. */
export function formatDateTime(value: DateInput, fallback = "-"): string {
  const d = toDate(value);
  return d ? format(d, "yyyy-MM-dd HH:mm") : fallback;
}
