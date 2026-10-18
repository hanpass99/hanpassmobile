import { useEffect } from "react";
import { useTranslation } from "react-i18next";
import { useRouter } from "@tanstack/react-router";

/** Keep document metadata in sync without refetching business data or mutating customer text. */
export function InterfaceLanguage() {
  const { i18n } = useTranslation();
  const router = useRouter();
  useEffect(() => {
    document.documentElement.lang = i18n.language === "en" ? "en" : "ko";
    const onChange = () => {
      document.documentElement.lang = i18n.language === "en" ? "en" : "ko";
      router.update({ ...router.options });
      router.stores.matches.setState((matches) => matches.map((match) => {
        const route = router.routesById[match.routeId];
        const head = route?.options.head?.({ ...match, matches, params: match.params, loaderData: match.loaderData } as never);
        return head && !(head instanceof Promise) ? { ...match, meta: head.meta, links: head.links ?? match.links } : match;
      }));
    };
    i18n.on("languageChanged", onChange);
    return () => { i18n.off("languageChanged", onChange); };
  }, [i18n, router]);
  return null;
}