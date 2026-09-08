import "server-only";

import { cookies, headers } from "next/headers";
import {
  detectAppLocale,
  isAppLocale,
  LOCALE_COOKIE_NAME,
  parseAcceptLanguage,
  type AppLocale,
} from "@/lib/browserProfile";

export async function requestLocale(): Promise<AppLocale> {
  const [cookieStore, headerStore] = await Promise.all([cookies(), headers()]);
  const savedLocale = cookieStore.get(LOCALE_COOKIE_NAME)?.value;
  if (isAppLocale(savedLocale)) return savedLocale;
  return detectAppLocale({ languages: parseAcceptLanguage(headerStore.get("accept-language")) });
}
