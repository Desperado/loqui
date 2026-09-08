"use client";

import { createContext, useCallback, useContext, useEffect, useMemo, useState } from "react";
import {
  detectAppLocale,
  isAppLocale,
  isMobileBrowser,
  LOCALE_COOKIE_NAME,
  LOCALE_STORAGE_KEY,
  type AppLocale,
} from "@/lib/browserProfile";
import { translate, type TranslationKey } from "@/lib/i18n";

interface BrowserProfile {
  locale: AppLocale;
  isMobile: boolean;
  ready: boolean;
  setLocale: (locale: AppLocale) => void;
  t: (key: TranslationKey) => string;
}

const BrowserProfileContext = createContext<BrowserProfile>({
  locale: "en",
  isMobile: false,
  ready: false,
  setLocale: () => {},
  t: (key) => translate("en", key),
});

function savedLocale(): AppLocale | null {
  try {
    const value = window.localStorage.getItem(LOCALE_STORAGE_KEY);
    return isAppLocale(value) ? value : null;
  } catch {
    return null;
  }
}

function saveLocale(locale: AppLocale) {
  try {
    window.localStorage.setItem(LOCALE_STORAGE_KEY, locale);
  } catch {
    // Storage can be unavailable in hardened/private browser contexts.
  }
  const secure = window.location.protocol === "https:" ? "; Secure" : "";
  document.cookie = `${LOCALE_COOKIE_NAME}=${locale}; Path=/; Max-Age=31536000; SameSite=Lax${secure}`;
}

export function BrowserProfileProvider({
  children,
  initialLocale,
}: {
  children: React.ReactNode;
  initialLocale: AppLocale;
}) {
  const [profile, setProfile] = useState({ locale: initialLocale, isMobile: false, ready: false });

  const persistLocale = useCallback((locale: AppLocale) => {
    document.documentElement.lang = locale;
    saveLocale(locale);
    setProfile((current) => ({ ...current, locale }));
  }, []);

  useEffect(() => {
    const navigatorWithUaData = navigator as Navigator & { userAgentData?: { mobile?: boolean } };
    const input = {
      languages: navigator.languages,
      language: navigator.language,
      userAgent: navigator.userAgent,
      maxTouchPoints: navigator.maxTouchPoints,
      userAgentData: navigatorWithUaData.userAgentData,
    };
    const locale = savedLocale() ?? detectAppLocale(input);
    document.documentElement.lang = locale;
    saveLocale(locale);
    setProfile({ locale, isMobile: isMobileBrowser(input), ready: true });
  }, []);

  const value = useMemo<BrowserProfile>(
    () => ({ ...profile, setLocale: persistLocale, t: (key) => translate(profile.locale, key) }),
    [persistLocale, profile]
  );

  return <BrowserProfileContext.Provider value={value}>{children}</BrowserProfileContext.Provider>;
}

export function useBrowserProfile(): BrowserProfile {
  return useContext(BrowserProfileContext);
}

export function LocalizedText({ id }: { id: TranslationKey }) {
  const { t } = useBrowserProfile();
  return <>{t(id)}</>;
}
