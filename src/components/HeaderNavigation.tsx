"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import { useBrowserProfile } from "@/components/BrowserProfileProvider";
import { LocaleSelector } from "@/components/LocaleSelector";

const links = [
  { href: "/", label: "navTranslate" },
  { href: "/humanize", label: "navHumanize" },
  { href: "/history", label: "navHistory" },
  { href: "/evals", label: "navEvals" },
] as const;

export function HeaderNavigation() {
  const pathname = usePathname();
  const { t } = useBrowserProfile();
  const [open, setOpen] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);
  const buttonRef = useRef<HTMLButtonElement>(null);
  const menuRef = useRef<HTMLElement>(null);

  useEffect(() => {
    if (!open) return;
    const focusFrame = window.requestAnimationFrame(() => menuRef.current?.querySelector<HTMLElement>("a")?.focus());
    const onPointerDown = (event: PointerEvent) => {
      if (!containerRef.current?.contains(event.target as Node)) setOpen(false);
    };
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key !== "Escape") return;
      setOpen(false);
      buttonRef.current?.focus();
    };
    document.addEventListener("pointerdown", onPointerDown);
    document.addEventListener("keydown", onKeyDown);
    return () => {
      window.cancelAnimationFrame(focusFrame);
      document.removeEventListener("pointerdown", onPointerDown);
      document.removeEventListener("keydown", onKeyDown);
    };
  }, [open]);

  return (
    <>
      <nav className="hidden items-center gap-4 text-sm text-slate-600 dark:text-slate-300 sm:flex" aria-label={t("menu")}>
        {links.map((link) => (
          <Link
            key={link.href}
            href={link.href}
            className={pathname === link.href ? "font-medium text-indigo-600 dark:text-indigo-400" : "hover:text-indigo-600 dark:hover:text-indigo-400"}
          >
            {t(link.label)}
          </Link>
        ))}
      </nav>
      <div ref={containerRef} className="relative sm:hidden">
        <button
          ref={buttonRef}
          type="button"
          onClick={() => setOpen((value) => !value)}
          className="inline-flex min-h-11 min-w-11 items-center justify-center rounded-lg text-xl text-slate-600 hover:bg-slate-100 dark:text-slate-300 dark:hover:bg-slate-800"
          aria-expanded={open}
          aria-controls="mobile-navigation"
          aria-label={t("menu")}
        >
          {open ? "✕" : "☰"}
        </button>
        {open && (
          <nav
            ref={menuRef}
            id="mobile-navigation"
            className="absolute left-0 top-12 z-50 w-52 overflow-hidden rounded-xl border border-slate-200 bg-white p-2 shadow-xl dark:border-slate-700 dark:bg-slate-900"
            aria-label={t("menu")}
          >
            {links.map((link) => (
              <Link
                key={link.href}
                href={link.href}
                onClick={() => setOpen(false)}
                className={`block min-h-11 rounded-lg px-3 py-3 text-sm ${
                  pathname === link.href
                    ? "bg-indigo-50 font-medium text-indigo-700 dark:bg-indigo-950 dark:text-indigo-300"
                    : "text-slate-700 hover:bg-slate-50 dark:text-slate-200 dark:hover:bg-slate-800"
                }`}
              >
                {t(link.label)}
              </Link>
            ))}
            <div className="mt-2 border-t border-slate-200 pt-2 dark:border-slate-700">
              <LocaleSelector className="w-full" />
            </div>
          </nav>
        )}
      </div>
    </>
  );
}
