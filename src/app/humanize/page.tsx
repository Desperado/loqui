import type { Metadata } from "next";
import { Humanizer } from "@/components/Humanizer";
import { translate } from "@/lib/i18n";
import { requestLocale } from "@/lib/requestLocale";

export async function generateMetadata(): Promise<Metadata> {
  const locale = await requestLocale();
  return {
    title: translate(locale, "humanMetaTitle"),
    description: translate(locale, "humanMetaDescription"),
  };
}

export default function HumanizePage() {
  return <Humanizer />;
}
