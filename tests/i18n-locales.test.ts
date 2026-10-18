import { describe, expect, test } from "bun:test";
import ko from "../src/i18n/locales/ko";
import en from "../src/i18n/locales/en";

function leaves(value: unknown, prefix = ""): Record<string, string> {
  if (typeof value === "string") return { [prefix]: value };
  if (!value || typeof value !== "object") return {};
  return Object.assign(
    {},
    ...Object.entries(value).map(([key, child]) =>
      leaves(child, prefix ? `${prefix}.${key}` : key),
    ),
  );
}

describe("Korean and English interface locales", () => {
  const korean = leaves(ko);
  const english = leaves(en);
  test("every key exists in both locales", () => {
    expect(Object.keys(korean).sort()).toEqual(Object.keys(english).sort());
  });
  test("English entries contain no untranslated Korean", () => {
    expect(Object.entries(english).filter(([, value]) => /[가-힣]/.test(value))).toEqual([]);
  });
  test("interpolation variables agree", () => {
    for (const [key, value] of Object.entries(korean)) {
      const tokens = (text: string) => (text.match(/\{\{[^}]+\}\}/g) ?? []).sort();
      expect(tokens(english[key] ?? "")).toEqual(tokens(value));
    }
  });
});
