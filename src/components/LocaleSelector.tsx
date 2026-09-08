"use client";

import { useBrowserProfile } from "@/components/BrowserProfileProvider";
import type { AppLocale } from "@/lib/browserProfile";

const localeNames: Record<AppLocale, string> = {
  en: "English",
  de: "Deutsch",
  uk: "Українська",
};

export function LocaleSelector({ className = "" }: { className?: string }) {
  const { locale, setLocale, t } = useBrowserProfile();

  return (
    <select
      value={locale}
      onChange={(event) => setLocale(event.target.value as AppLocale)}
      aria-label={t("uiLanguage")}
      title={t("uiLanguage")}
      className={`min-h-11 rounded-lg border border-slate-300 bg-white px-2 py-2 text-base text-slate-700 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-200 sm:text-sm ${className}`}
    >
      {(Object.keys(localeNames) as AppLocale[]).map((option) => (
        <option key={option} value={option}>
          {localeNames[option]}
        </option>
      ))}
    </select>
  );
}
