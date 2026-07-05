"use client";

import { useCallback, useEffect, useRef, useState } from "react";

type SourceLang = "de" | "en";

interface ModelInfo {
  id: string;
  label: string;
  provider: string;
  speed: string;
  enabled: boolean;
}

interface Segment {
  id: string;
  source: string;
  target: string;
  latencyMs: number | null;
  streaming: boolean;
  error?: string;
}

const SPEECH_LANG: Record<SourceLang, string> = { de: "de-DE", en: "en-US" };

let segmentCounter = 0;
const nextSegmentId = () => `seg-${++segmentCounter}-${Date.now()}`;

export function TranslatorDemo({ isAuthenticated }: { isAuthenticated: boolean }) {
  const [models, setModels] = useState<ModelInfo[]>([]);
  const [model, setModel] = useState("");
  const [sourceLang, setSourceLang] = useState<SourceLang>("de");
  const [listening, setListening] = useState(false);
  const [speechSupported, setSpeechSupported] = useState(true);
  const [segments, setSegments] = useState<Segment[]>([]);
  const [interim, setInterim] = useState("");
  const [liveTranslation, setLiveTranslation] = useState("");
  const [typedText, setTypedText] = useState("");
  const [saveHistory, setSaveHistory] = useState(isAuthenticated);
  const [statusMsg, setStatusMsg] = useState<string | null>(null);

  const recognitionRef = useRef<SpeechRecognition | null>(null);
  const conversationIdRef = useRef<string | null>(null);
  const liveAbortRef = useRef<AbortController | null>(null);
  const liveDebounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const listeningRef = useRef(false);
  const langRef = useRef(sourceLang);
  const modelRef = useRef(model);
  langRef.current = sourceLang;
  modelRef.current = model;

  // Load model registry
  useEffect(() => {
    fetch("/api/models")
      .then((r) => r.json())
      .then((data: { models: ModelInfo[] }) => {
        setModels(data.models);
        const firstEnabled = data.models.find((m) => m.enabled);
        if (firstEnabled) setModel(firstEnabled.id);
        else if (data.models.length) setModel(data.models[0].id);
      })
      .catch(() => setStatusMsg("Failed to load models"));
  }, []);

  useEffect(() => {
    if (typeof window !== "undefined" && !(window.SpeechRecognition || window.webkitSpeechRecognition)) {
      setSpeechSupported(false);
    }
  }, []);

  const ensureConversation = useCallback(async (): Promise<string | null> => {
    if (!isAuthenticated || !saveHistory) return null;
    if (conversationIdRef.current) return conversationIdRef.current;
    try {
      const res = await fetch("/api/conversations", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          title: `${langRef.current === "de" ? "German" : "English"} → Ukrainian · ${new Date().toLocaleString()}`,
          sourceLang: langRef.current,
          model: modelRef.current,
        }),
      });
      if (!res.ok) return null;
      const data = await res.json();
      conversationIdRef.current = data.conversation.id;
      return conversationIdRef.current;
    } catch {
      return null;
    }
  }, [isAuthenticated, saveHistory]);

  const saveMessage = useCallback(
    async (segment: Segment) => {
      const conversationId = await ensureConversation();
      if (!conversationId) return;
      fetch(`/api/conversations/${conversationId}/messages`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          sourceText: segment.source,
          translatedText: segment.target,
          sourceLang: langRef.current,
          model: modelRef.current,
          latencyMs: segment.latencyMs,
        }),
      }).catch(() => {});
    },
    [ensureConversation]
  );

  /** Stream a translation for a finalized segment into the segment list. */
  const translateSegment = useCallback(
    async (source: string) => {
      const id = nextSegmentId();
      setSegments((prev) => [...prev, { id, source, target: "", latencyMs: null, streaming: true }]);
      const started = performance.now();
      let firstToken: number | null = null;
      let target = "";
      try {
        const res = await fetch("/api/translate", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ text: source, sourceLang: langRef.current, model: modelRef.current }),
        });
        if (!res.ok || !res.body) throw new Error(await res.text());
        const reader = res.body.getReader();
        const decoder = new TextDecoder();
        while (true) {
          const { done, value } = await reader.read();
          if (done) break;
          if (firstToken === null) firstToken = performance.now() - started;
          target += decoder.decode(value, { stream: true });
          setSegments((prev) => prev.map((s) => (s.id === id ? { ...s, target } : s)));
        }
        const latencyMs = Math.round(firstToken ?? performance.now() - started);
        const finished: Segment = { id, source, target, latencyMs, streaming: false };
        setSegments((prev) => prev.map((s) => (s.id === id ? finished : s)));
        if (target) void saveMessage(finished);
      } catch (err) {
        const message = err instanceof Error ? err.message : "Translation failed";
        setSegments((prev) =>
          prev.map((s) => (s.id === id ? { ...s, streaming: false, error: message } : s))
        );
      }
    },
    [saveMessage]
  );

  /** Live-translate interim speech with debounce; replaced on every update. */
  const translateInterim = useCallback((text: string) => {
    if (liveDebounceRef.current) clearTimeout(liveDebounceRef.current);
    if (!text.trim()) {
      setLiveTranslation("");
      return;
    }
    liveDebounceRef.current = setTimeout(async () => {
      liveAbortRef.current?.abort();
      const controller = new AbortController();
      liveAbortRef.current = controller;
      try {
        const res = await fetch("/api/translate", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ text, sourceLang: langRef.current, model: modelRef.current }),
          signal: controller.signal,
        });
        if (!res.ok || !res.body) return;
        const reader = res.body.getReader();
        const decoder = new TextDecoder();
        let out = "";
        while (true) {
          const { done, value } = await reader.read();
          if (done) break;
          out += decoder.decode(value, { stream: true });
          if (!controller.signal.aborted) setLiveTranslation(out);
        }
      } catch {
        /* aborted or failed — interim translation is best-effort */
      }
    }, 350);
  }, []);

  const stopListening = useCallback(() => {
    listeningRef.current = false;
    setListening(false);
    recognitionRef.current?.stop();
    recognitionRef.current = null;
    setInterim("");
    setLiveTranslation("");
  }, []);

  const startListening = useCallback(() => {
    const Ctor = window.SpeechRecognition || window.webkitSpeechRecognition;
    if (!Ctor) {
      setSpeechSupported(false);
      return;
    }
    setStatusMsg(null);
    const rec = new Ctor();
    rec.lang = SPEECH_LANG[langRef.current];
    rec.continuous = true;
    rec.interimResults = true;
    rec.maxAlternatives = 1;

    rec.onresult = (ev) => {
      let interimText = "";
      for (let i = ev.resultIndex; i < ev.results.length; i++) {
        const result = ev.results[i];
        const transcript = result[0]?.transcript ?? "";
        if (result.isFinal) {
          const finalText = transcript.trim();
          if (finalText) void translateSegment(finalText);
        } else {
          interimText += transcript;
        }
      }
      setInterim(interimText);
      translateInterim(interimText);
    };
    rec.onerror = (ev) => {
      if (ev.error === "not-allowed") {
        setStatusMsg("Microphone access denied — allow the microphone or type below.");
        stopListening();
      } else if (ev.error === "no-speech") {
        // benign; recognition auto-restarts via onend
      } else if (ev.error !== "aborted") {
        setStatusMsg(`Speech recognition error: ${ev.error}`);
      }
    };
    rec.onend = () => {
      // Chrome stops recognition periodically; restart while the mic is on.
      if (listeningRef.current) {
        try {
          rec.start();
        } catch {
          stopListening();
        }
      }
    };

    recognitionRef.current = rec;
    listeningRef.current = true;
    setListening(true);
    rec.start();
  }, [stopListening, translateInterim, translateSegment]);

  useEffect(() => () => stopListening(), [stopListening]);

  const handleTypedSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    const text = typedText.trim();
    if (!text || !model) return;
    setTypedText("");
    void translateSegment(text);
  };

  const speak = (text: string) => {
    if (typeof window === "undefined" || !window.speechSynthesis) return;
    const utterance = new SpeechSynthesisUtterance(text);
    utterance.lang = "uk-UA";
    const ukVoice = window.speechSynthesis.getVoices().find((v) => v.lang.startsWith("uk"));
    if (ukVoice) utterance.voice = ukVoice;
    window.speechSynthesis.cancel();
    window.speechSynthesis.speak(utterance);
  };

  const clearAll = () => {
    setSegments([]);
    setInterim("");
    setLiveTranslation("");
    conversationIdRef.current = null;
  };

  const enabledCount = models.filter((m) => m.enabled).length;

  return (
    <div className="space-y-4">
      {/* Controls */}
      <div className="flex flex-wrap items-center gap-3 bg-white dark:bg-slate-800 rounded-xl border border-slate-200 dark:border-slate-700 p-4">
        <div className="flex rounded-lg overflow-hidden border border-slate-300 dark:border-slate-700" role="group" aria-label="Source language">
          {(["de", "en"] as SourceLang[]).map((lang) => (
            <button
              key={lang}
              onClick={() => {
                setSourceLang(lang);
                if (listening) {
                  stopListening();
                }
              }}
              className={`px-4 py-2 text-sm font-medium ${
                sourceLang === lang ? "bg-indigo-600 text-white" : "bg-white dark:bg-slate-800 text-slate-600 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-800/50"
              }`}
            >
              {lang === "de" ? "🇩🇪 German" : "🇬🇧 English"}
            </button>
          ))}
        </div>
        <span className="text-slate-400 dark:text-slate-500">→</span>
        <span className="px-4 py-2 text-sm font-medium bg-slate-100 dark:bg-slate-800 rounded-lg">🇺🇦 Ukrainian</span>

        <select
          value={model}
          onChange={(e) => setModel(e.target.value)}
          className="ml-auto rounded-lg border border-slate-300 dark:border-slate-700 px-3 py-2 text-sm bg-white dark:bg-slate-800 min-w-56"
          aria-label="Translation model"
        >
          {models.map((m) => (
            <option key={m.id} value={m.id} disabled={!m.enabled}>
              {m.speed === "ultra" ? "⚡ " : ""}
              {m.label}
              {m.enabled ? "" : " (no API key)"}
            </option>
          ))}
        </select>
      </div>

      {enabledCount === 0 && models.length > 0 && (
        <div className="rounded-lg bg-amber-50 dark:bg-amber-950 border border-amber-200 dark:border-amber-800 text-amber-800 dark:text-amber-200 text-sm px-4 py-3">
          No model API keys configured. Add <code>CEREBRAS_API_KEY</code>, <code>GROQ_API_KEY</code>,{" "}
          <code>GOOGLE_AI_API_KEY</code> or <code>OPENAI_API_KEY</code> to <code>.env</code> to enable translation.
        </div>
      )}

      {/* Mic */}
      <div className="flex flex-col items-center gap-2 py-2">
        <button
          onClick={listening ? stopListening : startListening}
          disabled={!speechSupported || !model}
          className={`w-20 h-20 rounded-full text-3xl flex items-center justify-center transition-colors ${
            listening ? "bg-red-500 text-white recording" : "bg-indigo-600 text-white hover:bg-indigo-500"
          } disabled:opacity-40 disabled:cursor-not-allowed`}
          aria-label={listening ? "Stop listening" : "Start listening"}
        >
          {listening ? "■" : "🎙️"}
        </button>
        <p className="text-sm text-slate-500 dark:text-slate-400">
          {listening
            ? `Listening in ${sourceLang === "de" ? "German" : "English"}… speak naturally`
            : speechSupported
              ? "Tap to speak"
              : "Speech recognition is not supported in this browser — use the text box below (Chrome/Edge recommended)."}
        </p>
        {statusMsg && <p className="text-sm text-red-600 dark:text-red-400">{statusMsg}</p>}
      </div>

      {/* Typed fallback */}
      <form onSubmit={handleTypedSubmit} className="flex gap-2">
        <input
          value={typedText}
          onChange={(e) => setTypedText(e.target.value)}
          placeholder={`Or type ${sourceLang === "de" ? "German" : "English"} text and press Enter…`}
          className="flex-1 rounded-lg border border-slate-300 dark:border-slate-700 px-4 py-2.5 text-sm bg-white dark:bg-slate-800 focus:outline-none focus:ring-2 focus:ring-indigo-500"
        />
        <button
          type="submit"
          disabled={!typedText.trim() || !model}
          className="rounded-lg bg-indigo-600 text-white px-4 py-2 text-sm font-medium hover:bg-indigo-500 disabled:opacity-40"
        >
          Translate
        </button>
      </form>

      {/* Transcript panes */}
      <div className="grid md:grid-cols-2 gap-4">
        <div className="bg-white dark:bg-slate-800 rounded-xl border border-slate-200 dark:border-slate-700 p-4 min-h-48">
          <h2 className="text-xs font-semibold uppercase tracking-wide text-slate-400 dark:text-slate-500 mb-3">
            {sourceLang === "de" ? "German" : "English"} (heard)
          </h2>
          <div className="space-y-2 text-slate-800 dark:text-slate-100">
            {segments.map((s) => (
              <p key={s.id}>{s.source}</p>
            ))}
            {interim && <p className="text-slate-400 dark:text-slate-500 italic">{interim}</p>}
            {segments.length === 0 && !interim && (
              <p className="text-slate-300 dark:text-slate-600 text-sm">Your speech will appear here…</p>
            )}
          </div>
        </div>
        <div className="bg-white dark:bg-slate-800 rounded-xl border border-slate-200 dark:border-slate-700 p-4 min-h-48">
          <h2 className="text-xs font-semibold uppercase tracking-wide text-slate-400 dark:text-slate-500 mb-3">Ukrainian</h2>
          <div className="space-y-2 text-slate-800 dark:text-slate-100">
            {segments.map((s) => (
              <div key={s.id} className="group flex items-start gap-2">
                <p className="flex-1">
                  {s.error ? (
                    <span className="text-red-500 dark:text-red-400 text-sm">⚠ {s.error}</span>
                  ) : (
                    <>
                      {s.target}
                      {s.streaming && <span className="animate-pulse">▍</span>}
                    </>
                  )}
                </p>
                {!s.streaming && s.target && (
                  <span className="flex items-center gap-2 shrink-0">
                    {s.latencyMs !== null && (
                      <span className="text-[10px] text-slate-400 dark:text-slate-500 whitespace-nowrap">{s.latencyMs} ms</span>
                    )}
                    <button
                      onClick={() => speak(s.target)}
                      className="opacity-0 group-hover:opacity-100 text-slate-400 dark:text-slate-500 hover:text-indigo-600 dark:hover:text-indigo-400"
                      title="Speak (dubbing preview)"
                      aria-label="Speak translation"
                    >
                      🔊
                    </button>
                  </span>
                )}
              </div>
            ))}
            {liveTranslation && <p className="text-slate-400 dark:text-slate-500 italic">{liveTranslation}</p>}
            {segments.length === 0 && !liveTranslation && (
              <p className="text-slate-300 dark:text-slate-600 text-sm">Переклад з’явиться тут…</p>
            )}
          </div>
        </div>
      </div>

      {/* Footer controls */}
      <div className="flex items-center justify-between text-sm text-slate-500 dark:text-slate-400">
        <label className="flex items-center gap-2">
          <input
            type="checkbox"
            checked={saveHistory}
            disabled={!isAuthenticated}
            onChange={(e) => setSaveHistory(e.target.checked)}
            className="rounded"
          />
          Save to history{!isAuthenticated && " (sign in with GitHub to enable)"}
        </label>
        {segments.length > 0 && (
          <button onClick={clearAll} className="text-slate-400 dark:text-slate-500 hover:text-red-500 dark:hover:text-red-400">
            Clear session
          </button>
        )}
      </div>
    </div>
  );
}
