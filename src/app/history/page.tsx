import { auth, signIn } from "@/auth";
import { HistoryBrowser } from "@/components/HistoryBrowser";

export default async function HistoryPage() {
  const session = await auth();

  if (!session?.user) {
    return (
      <div className="max-w-md mx-auto text-center space-y-4 pt-16">
        <h1 className="text-xl font-bold">Chat history</h1>
        <p className="text-slate-500 dark:text-slate-400 text-sm">
          Sign in with GitHub to save and browse your translation sessions.
        </p>
        <form
          action={async () => {
            "use server";
            await signIn("github");
          }}
        >
          <button className="rounded-md bg-slate-900 text-white px-4 py-2 text-sm hover:bg-slate-700">
            Sign in with GitHub
          </button>
        </form>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <h1 className="text-xl font-bold">Chat history</h1>
      <HistoryBrowser />
    </div>
  );
}
