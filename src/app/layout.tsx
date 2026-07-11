import type { Metadata } from "next";
import "./globals.css";
import { Header } from "@/components/Header";
import { themeInitScript } from "@/components/ThemeToggle";

export const metadata: Metadata = {
  title: "Loqui — language tools powered by fast models",
  description:
    "Open-source streaming translation and natural writing tools, powered by fast models from Cerebras, Groq, Gemini, and more.",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" suppressHydrationWarning>
      <head>
        <script dangerouslySetInnerHTML={{ __html: themeInitScript }} />
      </head>
      <body className="min-h-screen flex flex-col">
        <Header />
        <main className="flex-1 w-full max-w-5xl mx-auto px-4 py-6">{children}</main>
        <footer className="text-center text-xs text-slate-400 dark:text-slate-500 py-4">
          Loqui — open-source language tools. No subscriptions, no nonsense.
        </footer>
      </body>
    </html>
  );
}
