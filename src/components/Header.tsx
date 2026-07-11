import Link from "next/link";
import { auth, signIn, signOut } from "@/auth";
import { ThemeToggle } from "@/components/ThemeToggle";

export async function Header() {
  const session = await auth();

  return (
    <header className="border-b border-slate-200 bg-white dark:border-slate-800 dark:bg-slate-900">
      <div className="max-w-5xl mx-auto px-4 h-14 flex items-center justify-between">
        <div className="flex items-center gap-6">
          <Link href="/" className="text-lg font-bold tracking-tight text-indigo-600 dark:text-indigo-400">
            🎙️ Loqui
          </Link>
          <nav className="flex items-center gap-4 text-sm text-slate-600 dark:text-slate-300">
            <Link href="/" className="hover:text-indigo-600 dark:hover:text-indigo-400">
              Translate
            </Link>
            <Link href="/humanize" className="hover:text-indigo-600 dark:hover:text-indigo-400">
              Humanize
            </Link>
            <Link href="/history" className="hover:text-indigo-600 dark:hover:text-indigo-400">
              History
            </Link>
            <Link href="/evals" className="hover:text-indigo-600 dark:hover:text-indigo-400">
              Evals
            </Link>
          </nav>
        </div>
        <div className="flex items-center gap-3 text-sm">
          <ThemeToggle />
          {session?.user ? (
            <>
              <span className="flex items-center gap-2 text-slate-600 dark:text-slate-300">
                {session.user.image && (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img
                    src={session.user.image}
                    alt=""
                    className="w-6 h-6 rounded-full"
                  />
                )}
                {session.user.name ?? session.user.email}
              </span>
              <form
                action={async () => {
                  "use server";
                  await signOut();
                }}
              >
                <button className="text-slate-500 hover:text-slate-800 dark:text-slate-400 dark:hover:text-slate-100">Sign out</button>
              </form>
            </>
          ) : (
            <form
              action={async () => {
                "use server";
                await signIn("github");
              }}
            >
              <button className="inline-flex items-center gap-2 rounded-md bg-slate-900 text-white px-3 py-1.5 hover:bg-slate-700">
                <svg viewBox="0 0 16 16" width="16" height="16" fill="currentColor" aria-hidden>
                  <path d="M8 0C3.58 0 0 3.58 0 8c0 3.54 2.29 6.53 5.47 7.59.4.07.55-.17.55-.38 0-.19-.01-.82-.01-1.49-2.01.37-2.53-.49-2.69-.94-.09-.23-.48-.94-.82-1.13-.28-.15-.68-.52-.01-.53.63-.01 1.08.58 1.23.82.72 1.21 1.87.87 2.33.66.07-.52.28-.87.51-1.07-1.78-.2-3.64-.89-3.64-3.95 0-.87.31-1.59.82-2.15-.08-.2-.36-1.02.08-2.12 0 0 .67-.21 2.2.82.64-.18 1.32-.27 2-.27s1.36.09 2 .27c1.53-1.04 2.2-.82 2.2-.82.44 1.1.16 1.92.08 2.12.51.56.82 1.27.82 2.15 0 3.07-1.87 3.75-3.65 3.95.29.25.54.73.54 1.48 0 1.07-.01 1.93-.01 2.2 0 .21.15.46.55.38A8.01 8.01 0 0 0 16 8c0-4.42-3.58-8-8-8z" />
                </svg>
                Sign in with GitHub
              </button>
            </form>
          )}
        </div>
      </div>
    </header>
  );
}
