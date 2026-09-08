export type AppLocale = "en" | "de" | "uk";

export const LOCALE_COOKIE_NAME = "loqui-locale";
export const LOCALE_STORAGE_KEY = "loqui-locale";

export interface BrowserProfileInput {
  languages?: readonly string[];
  language?: string;
  userAgent?: string;
  maxTouchPoints?: number;
  userAgentData?: { mobile?: boolean };
}

export function isAppLocale(value: unknown): value is AppLocale {
  return value === "en" || value === "de" || value === "uk";
}

/** Pick the first Loqui UI locale present in the browser's ordered language list. */
export function detectAppLocale(input: BrowserProfileInput): AppLocale {
  const languages = input.languages?.length ? input.languages : input.language ? [input.language] : [];
  for (const language of languages) {
    const base = language.toLowerCase().split(/[-_]/)[0];
    if (isAppLocale(base)) return base;
  }
  return "en";
}

/** Convert an Accept-Language header into its quality-ordered language list. */
export function parseAcceptLanguage(value: string | null): string[] {
  if (!value) return [];
  return value
    .split(",")
    .map((part, index) => {
      const [language = "", ...parameters] = part.trim().split(";");
      const qualityParameter = parameters.find((parameter) => parameter.trim().startsWith("q="));
      const parsedQuality = qualityParameter ? Number(qualityParameter.trim().slice(2)) : 1;
      return { language, quality: Number.isFinite(parsedQuality) ? parsedQuality : 0, index };
    })
    .filter(({ language, quality }) => language.length > 0 && language !== "*" && quality > 0)
    .sort((a, b) => b.quality - a.quality || a.index - b.index)
    .map(({ language }) => language);
}

/**
 * Detect phone/tablet browsers without using viewport width alone (a resized
 * desktop window must not silently change speech engines). The Macintosh +
 * touch check covers iPadOS browsers that request a desktop user agent.
 */
export function isMobileBrowser(input: BrowserProfileInput): boolean {
  if (input.userAgentData?.mobile === true) return true;
  const userAgent = input.userAgent ?? "";
  if (/Android|webOS|iPhone|iPad|iPod|BlackBerry|IEMobile|Opera Mini|Mobile/i.test(userAgent)) {
    return true;
  }
  return /Macintosh/i.test(userAgent) && (input.maxTouchPoints ?? 0) > 1;
}

export function preferredTranslationPair(locale: AppLocale): {
  sourceLang: "auto" | "de" | "uk";
  targetLang: "de" | "uk";
} {
  if (locale === "uk") return { sourceLang: "uk", targetLang: "de" };
  if (locale === "de") return { sourceLang: "de", targetLang: "uk" };
  return { sourceLang: "auto", targetLang: "uk" };
}
