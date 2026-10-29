import i18n from "i18next";
import { initReactI18next } from "react-i18next";
import ko from "./locales/ko";

export type InterfaceLang = "ko" | "en";

i18n.use(initReactI18next).init({
  // 한국어(기본)만 첫 화면에 포함. 영어는 영어로 바꿀 때 한 번만 따로 내려받음.
  resources: { ko: { translation: ko } },
  lng: "ko",
  supportedLngs: ["ko", "en"],
  fallbackLng: "ko",
  partialBundledLanguages: true,
  interpolation: { escapeValue: false },
});

let enLoading: Promise<void> | null = null;

/** 영어 번역 파일을 필요할 때만 불러옴 (이미 불러왔으면 바로 끝남). */
export function ensureLanguageLoaded(lng: InterfaceLang): Promise<void> {
  if (lng === "ko" || i18n.hasResourceBundle("en", "translation")) return Promise.resolve();
  enLoading ??= import("./locales/en")
    .then((mod) => {
      i18n.addResourceBundle("en", "translation", mod.default, true, true);
    })
    .catch((err) => {
      enLoading = null;
      throw err;
    });
  return enLoading;
}

/** 언어 전환은 항상 이 함수로: 번역을 먼저 불러온 뒤 바꿔서 키 문자열이 잠깐 보이지 않게 함. */
export async function setInterfaceLanguage(lng: InterfaceLang): Promise<void> {
  await ensureLanguageLoaded(lng);
  await i18n.changeLanguage(lng);
}

export default i18n;
