import { auth } from "@/auth";
import { TranslatorDemo } from "@/components/TranslatorDemo";

export default async function HomePage() {
  const session = await auth();

  return (
    <div className="space-y-6">
      <div className="text-center space-y-1 pt-2">
        <h1 className="text-2xl font-bold tracking-tight">Instant voice translation</h1>
        <p className="text-slate-500 dark:text-slate-400 text-sm">
          Speak any of 9 languages — German, English, Ukrainian, French, Polish, Spanish, Latin, Italian, or Swedish — and get a live translation in any of them, routed through ultra-fast LLMs.
        </p>
      </div>
      <TranslatorDemo isAuthenticated={Boolean(session?.user)} />
    </div>
  );
}
