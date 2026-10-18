import i18n from "./index";

/** Localize reference labels, never identifiers used by queries or writes. */
export function countryName(country: { code: string; name_ko: string }): string {
  if (i18n.language !== "en") return country.name_ko;
  return i18n.t(`countryNames.${country.code}`, { defaultValue: country.code });
}

export function companyName(value: string): string {
  if (value === i18n.t("brand.hanpass", { lng: "ko" })) return i18n.t("brand.hanpass");
  if (value === i18n.t("brand.hanpassMobile", { lng: "ko" })) return i18n.t("brand.hanpassMobile");
  return value;
}