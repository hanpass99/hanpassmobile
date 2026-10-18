import i18n from "./index";

/** Translate presentation copy only; never use this for stored business values. */
export function uiCopy(key: string, values?: Record<string, unknown>, language?: "ko" | "en"): string {
  return String(i18n.t(key, { ...values, ...(language ? { lng: language } : {}) }));
}