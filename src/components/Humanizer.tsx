"use client";

import { useEffect, useMemo, useState } from "react";
import { ModelSelector, type ModelInfo } from "@/components/ModelSelector";
import { useBrowserProfile } from "@/components/BrowserProfileProvider";
import { pluralKey } from "@/lib/i18n";
import { MAX_WRITING_SAMPLE_CHARACTERS } from "@/lib/humanizerRubric";

type Style = "casual" | "crisp" | "warm" | "polished";

const starters = {
  en: "I built Loqui because language tools should feel useful before they feel expensive. The goal is simple: help people understand each other, quickly, without putting their words behind a paywall.",
  de: "Ich habe Loqui entwickelt, weil Sprachwerkzeuge nützlich sein sollten, bevor sie teuer werden. Das Ziel ist einfach: Menschen sollen einander schnell verstehen, ohne dass ihre Worte hinter einer Bezahlschranke verschwinden.",
  uk: "Я створив Loqui, бо мовні інструменти мають бути корисними ще до того, як стануть дорогими. Мета проста: допомагати людям швидко розуміти одне одного, не ховаючи їхні слова за платним бар’єром.",
} as const;

export function Humanizer() {
  const { locale, ready, t } = useBrowserProfile();
  const [models, setModels] = useState<ModelInfo[]>([]);
  const [model, setModel] = useState("");
  const [text, setText] = useState<string>(starters.en);
  const [writingSample, setWritingSample] = useState("");
  const [result, setResult] = useState("");
  const [style, setStyle] = useState<Style>("casual");
  const [working, setWorking] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);
  const words = useMemo(() => (text.trim() ? text.trim().split(/\s+/).length : 0), [text]);
  const styles = useMemo<{ id: Style; name: string; hint: string }[]>(
    () => [
      { id: "casual", name: t("conversational"), hint: t("conversationalHint") },
      { id: "crisp", name: t("crisp"), hint: t("crispHint") },
      { id: "warm", name: t("warm"), hint: t("warmHint") },
      { id: "polished", name: t("polished"), hint: t("polishedHint") },
    ],
    [t]
  );

  useEffect(() => {
    if (!ready) return;
    setText((current) => Object.values(starters).includes(current as (typeof starters)[keyof typeof starters]) ? starters[locale] : current);
  }, [locale, ready]);

  useEffect(() => {
    fetch("/api/models")
      .then((r) => r.json())
      .then((data: { models: ModelInfo[] }) => {
        const writingModels = data.models.filter((item) => item.provider === "Groq" || item.provider === "Cerebras");
        setModels(writingModels);
        const preferred = writingModels.find((item) => item.enabled && item.provider === "Groq") ?? writingModels.find((item) => item.enabled);
        if (preferred) setModel(preferred.id);
      })
      .catch(() => setError("Could not load the model list."));
  }, []);

  async function humanize() {
    if (!text.trim() || !model || working) return;
    setWorking(true);
    setError(null);
    setResult("");
    try {
      const response = await fetch("/api/humanize", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          text,
          style,
          model,
          language: locale,
          writing_sample: writingSample.trim() || undefined,
        }),
      });
      if (!response.ok || !response.body) throw new Error((await response.text()) || "The rewrite could not start.");
      const reader = response.body.getReader();
      const decoder = new TextDecoder();
      let complete = "";
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        complete += decoder.decode(value, { stream: true });
        setResult(complete);
      }
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "The rewrite could not finish.");
    } finally {
      setWorking(false);
    }
  }

  async function copy() {
    if (!result) return;
    await navigator.clipboard.writeText(result);
    setCopied(true);
    window.setTimeout(() => setCopied(false), 1600);
  }

  return (
    <section className="space-y-6">
      <div className="space-y-2 pt-2 text-center">
        <p className="text-xs font-semibold uppercase tracking-[0.2em] text-violet-500 dark:text-violet-400">{t("humanKicker")}</p>
        <h1 className="text-3xl font-bold tracking-tight sm:text-4xl">{t("humanTitle")}</h1>
        <p className="mx-auto max-w-2xl text-sm leading-6 text-slate-500 dark:text-slate-400">{t("humanSubtitle")}</p>
      </div>

      <div className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm dark:border-slate-800 dark:bg-slate-900">
        <div className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-200 bg-slate-50 px-4 py-3 text-xs text-slate-500 dark:border-slate-800 dark:bg-slate-950/40 dark:text-slate-400">
          <span className="inline-flex items-center gap-2"><i className="h-2 w-2 rounded-full bg-emerald-500" />{t("privateByDesign")}</span>
          <ModelSelector models={models} value={model} onChange={setModel} label={t("translationModel")} unavailableLabel={t("noApiKey")} className="min-w-0 py-1.5 text-xs" />
        </div>
        <div className="grid divide-y divide-slate-200 dark:divide-slate-800 md:grid-cols-2 md:divide-x md:divide-y-0">
          <article className="flex min-h-[360px] flex-col p-5">
            <div className="mb-3 flex items-center justify-between text-xs font-medium text-slate-500 dark:text-slate-400"><span>{t("yourDraft")}</span><span>{words} {t(pluralKey("word", locale, words))}</span></div>
            <textarea value={text} onChange={(event) => setText(event.target.value)} className="min-h-[255px] flex-1 resize-none bg-transparent text-base leading-7 outline-none placeholder:text-slate-400 sm:text-sm" placeholder={t("draftPlaceholder")} aria-label={t("yourDraft")} />
            <div className="mt-3 flex justify-end border-t border-slate-100 pt-3 dark:border-slate-800"><button onClick={() => setText("")} className="min-h-11 px-2 text-xs text-slate-400 hover:text-slate-700 dark:hover:text-slate-200">{t("clear")}</button></div>
          </article>
          <article className="flex min-h-[360px] flex-col bg-violet-50/50 p-5 dark:bg-violet-950/10">
            <div className="mb-3 flex items-center justify-between text-xs font-medium text-slate-500 dark:text-slate-400"><span>{t("revisedVersion")}</span><button onClick={copy} disabled={!result} className="min-h-11 px-2 hover:text-violet-600 disabled:opacity-40 dark:hover:text-violet-300">{copied ? t("copied") : t("copy")}</button></div>
            <div className="whitespace-pre-wrap text-sm leading-7 text-slate-700 dark:text-slate-200">{working && !result ? <span className="text-slate-400">{t("findingWords")}</span> : result || <span className="text-slate-400">{t("revisedPlaceholder")}</span>}</div>
          </article>
        </div>
        <details className="border-t border-slate-200 bg-white px-4 py-3 dark:border-slate-800 dark:bg-slate-900">
          <summary className="min-h-11 cursor-pointer select-none py-3 text-sm font-semibold text-slate-700 dark:text-slate-200">
            {t("matchVoice")}
          </summary>
          <div className="pb-2">
            <p className="mb-2 text-xs leading-5 text-slate-500 dark:text-slate-400">{t("matchVoiceHint")}</p>
            <textarea
              value={writingSample}
              onChange={(event) => setWritingSample(event.target.value)}
              maxLength={MAX_WRITING_SAMPLE_CHARACTERS}
              className="min-h-32 w-full resize-y rounded-lg border border-slate-200 bg-slate-50 p-3 text-base leading-6 outline-none focus:border-violet-400 dark:border-slate-700 dark:bg-slate-950 sm:text-sm"
              placeholder={t("voiceSamplePlaceholder")}
              aria-label={t("matchVoice")}
            />
            <p className="mt-1 text-right text-[10px] text-slate-400">
              {writingSample.length}/{MAX_WRITING_SAMPLE_CHARACTERS}
            </p>
          </div>
        </details>
        <div className="flex flex-col gap-4 border-t border-slate-200 bg-slate-50 p-4 dark:border-slate-800 dark:bg-slate-950/40 sm:flex-row sm:items-center sm:justify-between">
          <div className="grid grid-cols-2 gap-2 sm:flex">
            {styles.map((option) => <button key={option.id} onClick={() => setStyle(option.id)} className={`rounded-lg border px-3 py-2 text-left transition ${style === option.id ? "border-violet-500 bg-violet-100 text-violet-950 dark:bg-violet-950/50 dark:text-violet-100" : "border-slate-200 bg-white text-slate-600 hover:border-violet-300 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-300"}`}><span className="block text-xs font-semibold">{option.name}</span><span className="block text-[10px] opacity-70">{option.hint}</span></button>)}
          </div>
          <button onClick={humanize} disabled={working || !text.trim() || !model} className="inline-flex min-h-11 items-center justify-center gap-2 rounded-lg bg-violet-600 px-5 py-3 text-sm font-semibold text-white shadow-sm transition hover:bg-violet-500 disabled:cursor-not-allowed disabled:opacity-50">{working ? t("reworking") : t("humanizeThis")}</button>
        </div>
      </div>
      {error && <p role="alert" className="rounded-lg border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-800 dark:border-rose-900 dark:bg-rose-950/30 dark:text-rose-200">{error}</p>}
      <div className="grid gap-4 sm:grid-cols-3">
        {[ [t("keepPoint"), t("keepPointDetail")], [t("chooseEnergy"), t("chooseEnergyDetail")], [t("bringKey"), t("bringKeyDetail")] ].map(([title, detail], index) => <div key={title} className="rounded-xl border border-slate-200 p-4 dark:border-slate-800"><span className="font-mono text-xs text-violet-500">0{index + 1}</span><h2 className="mt-2 text-sm font-semibold">{title}</h2><p className="mt-1 text-xs leading-5 text-slate-500 dark:text-slate-400">{detail}</p></div>)}
      </div>
    </section>
  );
}
