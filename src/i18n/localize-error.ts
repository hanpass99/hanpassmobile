import i18n from "./index";
import ko from "./locales/ko";

const patterns = Object.entries(ko.uiErrors).map(([key, text]) => {
  const variables: string[] = [];
  const expression = text
    .split(/(\{\{[^}]+\}\})/g)
    .map((part) => {
      if (part.startsWith("{{")) {
        variables.push(part.slice(2, -2));
        return "([\\s\\S]*?)";
      }
      return part.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    })
    .join("");
  return { key, variables, pattern: new RegExp(`^${expression}$`) };
});

/** Known app errors only; customer messages and provider payloads stay untouched. */
export function localizeError(message: unknown): string {
  const raw = String(message);
  if (i18n.language !== "en") return raw;
  for (const { key, variables, pattern } of patterns) {
    const match = pattern.exec(raw);
    if (!match) continue;
    const values = Object.fromEntries(
      variables.map((name, index) => [name, localizeError(match[index + 1] ?? "")]),
    );
    return String(i18n.t(`uiErrors.${key}`, values));
  }
  return raw;
}
