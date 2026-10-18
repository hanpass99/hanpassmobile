import { useEffect } from "react";
import { useTranslation } from "react-i18next";
import { useRouterState } from "@tanstack/react-router";

/** Keep document metadata in sync without refetching business data or mutating customer text. */
export function InterfaceLanguage() {
  const { i18n } = useTranslation();
  const matches = useRouterState({ select: (state) => state.matches });
  useEffect(() => {
    document.documentElement.lang = i18n.language === "en" ? "en" : "ko";
    const path = matches.at(-1)?.pathname ?? "/";
    const section = path === "/" ? "dashboard" : path.slice(1);
    const title = i18n.t(`pages.${section}.title`);
    const description = i18n.t(`pages.${section}.description`);
    if (title !== `pages.${section}.title`) {
      document.title = title;
      for (const [selector, content] of [
        ['meta[property="og:title"]', title],
        ['meta[name="description"]', description],
        ['meta[property="og:description"]', description],
      ]) {
        document.querySelector(selector)?.setAttribute("content", content);
      }
    }
    const saved = localStorage.getItem("lang");
    if ((saved === "ko" || saved === "en") && saved !== i18n.language)
      void i18n.changeLanguage(saved);
  }, [i18n, i18n.language, matches]);
  return null;
}
