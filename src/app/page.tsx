import { auth } from "@/auth";
import { TranslatorDemo } from "@/components/TranslatorDemo";
import { LocalizedText } from "@/components/BrowserProfileProvider";

export default async function HomePage() {
  const session = await auth();

  return (
    <div className="space-y-6">
      <div className="text-center space-y-1 pt-1 sm:pt-2">
        <h1 className="text-xl font-bold tracking-tight sm:text-2xl"><LocalizedText id="homeTitle" /></h1>
        <p className="text-slate-500 dark:text-slate-400 text-sm">
          <LocalizedText id="homeSubtitle" />
        </p>
      </div>
      <TranslatorDemo isAuthenticated={Boolean(session?.user)} />
    </div>
  );
}
