import type { Metadata } from "next";
import "./globals.css";
import { Header } from "@/components/Header";
import { themeInitScript } from "@/components/ThemeToggle";
import { BrowserProfileProvider, LocalizedText } from "@/components/BrowserProfileProvider";
import type { AppLocale } from "@/lib/browserProfile";
import { requestLocale } from "@/lib/requestLocale";

const metadataByLocale: Record<AppLocale, Metadata> = {
  en: {
    title: "Loqui — language tools powered by fast models",
    description: "Open-source streaming translation and natural writing tools, powered by fast models from Cerebras, Groq, Gemini, and more.",
  },
  de: {
    title: "Loqui — Sprachwerkzeuge mit schnellen Modellen",
    description: "Quelloffene Live-Übersetzung und Werkzeuge für natürliches Schreiben mit schnellen Modellen von Cerebras, Groq, Gemini und weiteren.",
  },
  uk: {
    title: "Loqui — мовні інструменти на швидких моделях",
    description: "Переклад наживо та інструменти для природного письма з відкритим кодом на швидких моделях Cerebras, Groq, Gemini та інших.",
  },
};

export async function generateMetadata(): Promise<Metadata> {
  return metadataByLocale[await requestLocale()];
}

export default async function RootLayout({ children }: { children: React.ReactNode }) {
  const initialLocale = await requestLocale();
  return (
    <html lang={initialLocale} suppressHydrationWarning>
      <head>
        <script dangerouslySetInnerHTML={{ __html: themeInitScript }} />
      </head>
      <body className="min-h-screen flex flex-col">
        <BrowserProfileProvider initialLocale={initialLocale}>
          <Header />
          <main className="flex-1 w-full max-w-5xl mx-auto px-3 py-4 sm:px-4 sm:py-6">{children}</main>
          <footer className="px-4 py-4 text-center text-xs text-slate-400 dark:text-slate-500">
            <LocalizedText id="footer" />
          </footer>
        </BrowserProfileProvider>
      </body>
    </html>
  );
}
