"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { ModelSelector, type ModelInfo } from "@/components/ModelSelector";
import { VoiceSelector } from "@/components/VoiceSelector";
import { DEFAULT_PERSONA_ID, personaVoice } from "@/lib/voices";

type Lang = "de" | "en" | "uk";
type SourceLang = "auto" | Lang;
type DetectedLang = Lang;

interface Segment {
  id: string;
  source: string;
  target: string;
  latencyMs: number | null;
  streaming: boolean;
  error?: string;
}

const SPEECH_LANG: Record<Lang, string> = { de: "de-DE", en: "en-US", uk: "uk-UA" };
const LANG_LABEL: Record<Lang, string> = { de: "German", en: "English", uk: "Ukrainian" };
const LANG_FLAG: Record<SourceLang, string> = { auto: "🌐", de: "🇩🇪", en: "🇬🇧", uk: "🇺🇦" };

const SOURCE_OPTIONS: SourceLang[] = ["auto", "de", "en", "uk"];
const TARGET_OPTIONS: Lang[] = ["uk", "de", "en"];

/** Lightweight source-language heuristic for adaptive speech recognition. */
function detectLang(text: string): DetectedLang | null {
  const t = text.toLowerCase();
  if (/[Ѐ-ӿ]/.test(t)) return "uk"; // Cyrillic → Ukrainian
  if (/[äöüß]/.test(t)) return "de";
  const de = (
    t.match(
      /\b(der|die|das|und|ich|nicht|ist|ein|eine|mit|auf|für|sie|wir|aber|auch|sehr|was|wenn|weil|dass|schon|noch|immer|kein|habe|haben|sind|wird|nach|über|oder|als|bei|nur)\b/g
    ) || []
  ).length;
  const en = (
    t.match(
      /\b(the|and|is|are|you|to|of|in|it|that|this|with|for|was|have|not|but|they|we|he|she|on|at|my|your|from|what|when|because|would|there|about)\b/g
    ) || []
  ).length;
  if (de > en) return "de";
  if (en > de) return "en";
  return null;
}

function pickVoice(lang: Lang): SpeechSynthesisVoice | null {
  if (typeof window === "undefined" || !window.speechSynthesis) return null;
  const prefix = SPEECH_LANG[lang].slice(0, 2).toLowerCase();
  return window.speechSynthesis.getVoices().find((v) => v.lang?.toLowerCase().startsWith(prefix)) ?? null;
}

function makeUtterance(text: string, lang: Lang): SpeechSynthesisUtterance {
  const u = new SpeechSynthesisUtterance(text);
  u.lang = SPEECH_LANG[lang];
  const v = pickVoice(lang);
  if (v) u.voice = v;
  return u;
}

let segmentCounter = 0;
const nextSegmentId = () => `seg-${++segmentCounter}-${Date.now()}`;

export function TranslatorDemo({ isAuthenticated }: { isAuthenticated: boolean }) {
  const [models, setModels] = useState<ModelInfo[]>([]);
  const [model, setModel] = useState("");
  const [sourceLang, setSourceLang] = useState<SourceLang>("auto");
  const [targetLang, setTargetLang] = useState<Lang>("uk");
  const [detectedLang, setDetectedLang] = useState<DetectedLang | null>(null);
  const [autoSpeak, setAutoSpeak] = useState(false);
  const [personaId, setPersonaId] = useState(DEFAULT_PERSONA_ID);
  const [sendToDisplay, setSendToDisplay] = useState(false);
  const [displayListeners, setDisplayListeners] = useState<number | null>(null);
  const [engine, setEngine] = useState<"browser" | "server">("browser");
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
  const targetRef = useRef(targetLang);
  const modelRef = useRef(model);
  const autoSpeakRef = useRef(autoSpeak);
  const personaIdRef = useRef(personaId);
  const sendToDisplayRef = useRef(sendToDisplay);
  const sttLangRef = useRef<DetectedLang>("en");
  const speechQueueRef = useRef<{ text: string; lang: Lang; voice: string }[]>([]);
  const speakingRef = useRef(false);
  const audioElRef = useRef<HTMLAudioElement | null>(null);
  const mediaStreamRef = useRef<MediaStream | null>(null);
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const audioCtxRef = useRef<AudioContext | null>(null);
  const analyserRef = useRef<AnalyserNode | null>(null);
  langRef.current = sourceLang;
  targetRef.current = targetLang;
  modelRef.current = model;
  autoSpeakRef.current = autoSpeak;
  personaIdRef.current = personaId;
  sendToDisplayRef.current = sendToDisplay;

  // ---- External display broadcast (LED ticker / kiosk page on /display) ----
  const pushToDisplay = useCallback((kind: "final" | "interim" | "clear", text = "") => {
    if (!sendToDisplayRef.current) return;
    fetch("/api/display/send", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ kind, text, lang: targetRef.current }),
    })
      .then((r) => (r.ok ? r.json() : null))
      .then((data: { listeners?: number } | null) => {
        if (data && typeof data.listeners === "number") setDisplayListeners(data.listeners);
      })
      .catch(() => {});
  }, []);

  // Poll listener count while the toggle is on, so the UI can show whether a
  // display is actually connected.
  useEffect(() => {
    if (!sendToDisplay) {
      setDisplayListeners(null);
      return;
    }
    let cancelled = false;
    const check = () =>
      fetch("/api/display/send")
        .then((r) => r.json())
        .then((data: { listeners?: number }) => {
          if (!cancelled && typeof data.listeners === "number") setDisplayListeners(data.listeners);
        })
        .catch(() => {});
    void check();
    const timer = setInterval(check, 10_000);
    return () => {
      cancelled = true;
      clearInterval(timer);
    };
  }, [sendToDisplay]);

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

  // Warm up the speech-synthesis voice list (populated asynchronously by the browser).
  useEffect(() => {
    if (typeof window === "undefined" || !window.speechSynthesis) return;
    const warm = () => window.speechSynthesis.getVoices();
    warm();
    window.speechSynthesis.addEventListener("voiceschanged", warm);
    return () => window.speechSynthesis.removeEventListener("voiceschanged", warm);
  }, []);

  // ---- Target-language voice playback ----
  // Prefer server-side TTS (/api/speak, OpenAI); fall back to the browser voice.
  const drainSpeechQueue = useCallback(async () => {
    if (speakingRef.current) return;
    const next = speechQueueRef.current.shift();
    if (!next) return;
    speakingRef.current = true;
    const done = () => {
      speakingRef.current = false;
      void drainSpeechQueue();
    };
    let url: string | null = null;
    try {
      const res = await fetch("/api/speak", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ text: next.text, lang: next.lang, voice: next.voice }),
      });
      if (res.ok) url = URL.createObjectURL(await res.blob());
    } catch {
      /* fall through to the browser voice */
    }
    if (url) {
      const audio = audioElRef.current ?? new Audio();
      audioElRef.current = audio;
      audio.src = url;
      audio.onended = () => {
        URL.revokeObjectURL(url as string);
        done();
      };
      audio.onerror = () => {
        URL.revokeObjectURL(url as string);
        done();
      };
      audio.play().catch(done);
      return;
    }
    if (typeof window !== "undefined" && window.speechSynthesis) {
      const u = makeUtterance(next.text, next.lang);
      u.onend = done;
      u.onerror = done;
      window.speechSynthesis.speak(u);
    } else {
      done();
    }
  }, []);

  const enqueueSpeak = useCallback(
    (text: string, lang: Lang) => {
      if (!text.trim()) return;
      speechQueueRef.current.push({ text, lang, voice: personaVoice(personaIdRef.current) });
      void drainSpeechQueue();
    },
    [drainSpeechQueue]
  );

  const stopSpeaking = useCallback(() => {
    speechQueueRef.current = [];
    speakingRef.current = false;
    if (audioElRef.current) {
      audioElRef.current.pause();
      audioElRef.current.src = "";
    }
    if (typeof window !== "undefined" && window.speechSynthesis) window.speechSynthesis.cancel();
  }, []);

  const ensureConversation = useCallback(async (): Promise<string | null> => {
    if (!isAuthenticated || !saveHistory) return null;
    if (conversationIdRef.current) return conversationIdRef.current;
    try {
      const src = langRef.current === "auto" ? "Auto" : LANG_LABEL[langRef.current];
      const res = await fetch("/api/conversations", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          title: `${src} → ${LANG_LABEL[targetRef.current]} · ${new Date().toLocaleString()}`,
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
      const target = targetRef.current;
      setSegments((prev) => [...prev, { id, source, target: "", latencyMs: null, streaming: true }]);
      const started = performance.now();
      let firstToken: number | null = null;
      let out = "";
      try {
        const res = await fetch("/api/translate", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            text: source,
            sourceLang: langRef.current,
            targetLang: target,
            model: modelRef.current,
          }),
        });
        if (!res.ok || !res.body) throw new Error(await res.text());
        const reader = res.body.getReader();
        const decoder = new TextDecoder();
        while (true) {
          const { done, value } = await reader.read();
          if (done) break;
          if (firstToken === null) firstToken = performance.now() - started;
          out += decoder.decode(value, { stream: true });
          setSegments((prev) => prev.map((s) => (s.id === id ? { ...s, target: out } : s)));
        }
        const latencyMs = Math.round(firstToken ?? performance.now() - started);
        const finished: Segment = { id, source, target: out, latencyMs, streaming: false };
        setSegments((prev) => prev.map((s) => (s.id === id ? finished : s)));
        if (out) {
          void saveMessage(finished);
          if (autoSpeakRef.current) enqueueSpeak(out, target);
          pushToDisplay("final", out);
        }
      } catch (err) {
        const message = err instanceof Error ? err.message : "Translation failed";
        setSegments((prev) =>
          prev.map((s) => (s.id === id ? { ...s, streaming: false, error: message } : s))
        );
      }
    },
    [saveMessage, enqueueSpeak, pushToDisplay]
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
          body: JSON.stringify({
            text,
            sourceLang: langRef.current,
            targetLang: targetRef.current,
            model: modelRef.current,
          }),
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
        // One push per completed interim stream — a live preview line on the
        // display without a network call per token.
        if (!controller.signal.aborted && out) pushToDisplay("interim", out);
      } catch {
        /* aborted or failed — interim translation is best-effort */
      }
    }, 350);
  }, [pushToDisplay]);

  const stopListening = useCallback(() => {
    listeningRef.current = false;
    setListening(false);
    recognitionRef.current?.stop();
    recognitionRef.current = null;
    setInterim("");
    setLiveTranslation("");
    stopSpeaking();
  }, [stopSpeaking]);

  const startListening = useCallback(() => {
    const Ctor = window.SpeechRecognition || window.webkitSpeechRecognition;
    if (!Ctor) {
      setSpeechSupported(false);
      return;
    }
    setStatusMsg(null);
    const rec = new Ctor();
    rec.lang =
      langRef.current === "auto" ? SPEECH_LANG[sttLangRef.current] : SPEECH_LANG[langRef.current];
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
          if (finalText) {
            // Adaptive language detection: switch the recognizer for the next
            // utterance when Auto mode detects a different language.
            if (langRef.current === "auto") {
              const detected = detectLang(finalText);
              if (detected) {
                setDetectedLang(detected);
                if (detected !== sttLangRef.current) {
                  sttLangRef.current = detected;
                  try {
                    rec.stop(); // onend restarts with the new language
                  } catch {
                    /* will restart via onend */
                  }
                }
              }
            }
            void translateSegment(finalText);
          }
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
          if (langRef.current === "auto") rec.lang = SPEECH_LANG[sttLangRef.current];
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

  // ---- Server STT (OpenAI Whisper): record utterances (cut on pause), transcribe, translate ----
  const MONITOR_MS = 100;
  const SPEECH_RMS = 0.025;
  const SILENCE_HOLD_MS = 800; // trailing pause that ends an utterance
  const MAX_SEG_MS = 15000; // hard cap so a long monologue still flushes
  const FIXED_FALLBACK_MS = 4000; // fixed clip length when VAD is unavailable

  const transcribeAndTranslate = useCallback(
    async (blob: Blob) => {
      const fd = new FormData();
      fd.append("file", blob, "audio.webm");
      fd.append("sourceLang", langRef.current);
      try {
        const res = await fetch("/api/transcribe", { method: "POST", body: fd });
        if (!res.ok) return;
        const { text, language } = await res.json();
        if (language && langRef.current === "auto") {
          const map: Record<string, DetectedLang> = { english: "en", german: "de", ukrainian: "uk" };
          const d = map[String(language).toLowerCase()];
          if (d) setDetectedLang(d);
        }
        const t = (text ?? "").trim();
        if (t) void translateSegment(t);
      } catch {
        /* best-effort */
      }
    },
    [translateSegment]
  );

  const cycleRecord = useCallback(() => {
    const stream = mediaStreamRef.current;
    if (!stream || !listeningRef.current) return;
    const mime = typeof MediaRecorder !== "undefined" && MediaRecorder.isTypeSupported("audio/webm") ? "audio/webm" : "";
    const mr = mime ? new MediaRecorder(stream, { mimeType: mime }) : new MediaRecorder(stream);
    const chunks: Blob[] = [];
    mr.ondataavailable = (e) => {
      if (e.data.size) chunks.push(e.data);
    };
    // Silence-based segmentation: keep recording until the speaker pauses, then
    // cut — so clips break at natural sentence boundaries instead of mid-word.
    // Also gates out silence (Whisper hallucinates stock phrases on silent audio).
    const analyser = analyserRef.current;
    const buf = analyser ? new Uint8Array(analyser.fftSize) : null;
    let hadSpeech = !analyser; // fail open: no VAD → treat as speech, use a fixed cut
    let silenceMs = 0;
    let segMs = 0;
    const monitor = setInterval(() => {
      segMs += MONITOR_MS;
      let cut = false;
      if (analyser && buf) {
        analyser.getByteTimeDomainData(buf);
        let sum = 0;
        for (let i = 0; i < buf.length; i++) {
          const v = (buf[i] - 128) / 128;
          sum += v * v;
        }
        if (Math.sqrt(sum / buf.length) > SPEECH_RMS) {
          hadSpeech = true;
          silenceMs = 0;
        } else if (hadSpeech) {
          silenceMs += MONITOR_MS;
        }
        if (hadSpeech && silenceMs >= SILENCE_HOLD_MS) cut = true; // pause → end of utterance
        if (segMs >= MAX_SEG_MS) cut = true; // safety cap
      } else if (segMs >= FIXED_FALLBACK_MS) {
        cut = true; // no VAD: fall back to fixed-length clips
      }
      if (cut && mr.state !== "inactive") mr.stop();
    }, MONITOR_MS);
    mr.onstop = () => {
      clearInterval(monitor);
      const blob = new Blob(chunks, { type: mr.mimeType || "audio/webm" });
      if (hadSpeech && blob.size > 1200) void transcribeAndTranslate(blob);
      if (listeningRef.current) cycleRecord();
    };
    mediaRecorderRef.current = mr;
    mr.start();
  }, [transcribeAndTranslate]);

  const startServerListening = useCallback(async () => {
    setStatusMsg(null);
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      mediaStreamRef.current = stream;
      try {
        const ctx = new AudioContext();
        const source = ctx.createMediaStreamSource(stream);
        const analyser = ctx.createAnalyser();
        analyser.fftSize = 512;
        source.connect(analyser);
        void ctx.resume().catch(() => {}); // may start suspended (Safari/iOS)
        audioCtxRef.current = ctx;
        analyserRef.current = analyser;
      } catch {
        /* VAD unavailable — the server-side filter still guards against hallucinations */
      }
      listeningRef.current = true;
      setListening(true);
      cycleRecord();
    } catch {
      setStatusMsg("Microphone access denied — allow the microphone or type below.");
    }
  }, [cycleRecord]);

  const stopServerListening = useCallback(() => {
    listeningRef.current = false;
    setListening(false);
    try {
      mediaRecorderRef.current?.stop();
    } catch {
      /* already stopped */
    }
    mediaRecorderRef.current = null;
    mediaStreamRef.current?.getTracks().forEach((t) => t.stop());
    mediaStreamRef.current = null;
    analyserRef.current = null;
    audioCtxRef.current?.close().catch(() => {});
    audioCtxRef.current = null;
    setInterim("");
    setLiveTranslation("");
    stopSpeaking();
  }, [stopSpeaking]);

  const beginListening = () => (engine === "server" ? void startServerListening() : startListening());
  const endListening = () => (engine === "server" ? stopServerListening() : stopListening());

  useEffect(
    () => () => {
      stopListening();
      stopServerListening();
    },
    [stopListening, stopServerListening]
  );

  const handleTypedSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    const text = typedText.trim();
    if (!text || !model) return;
    setTypedText("");
    void translateSegment(text);
  };

  /** Manual playback — interrupts whatever is currently speaking. */
  const speak = (text: string) => {
    if (!text.trim()) return;
    stopSpeaking();
    enqueueSpeak(text, targetRef.current);
  };

  const resetSttLang = () => {
    sttLangRef.current = "en";
    setDetectedLang(null);
  };

  const clearAll = () => {
    setSegments([]);
    setInterim("");
    setLiveTranslation("");
    resetSttLang();
    conversationIdRef.current = null;
    stopSpeaking();
    pushToDisplay("clear");
  };

  const enabledCount = models.filter((m) => m.enabled).length;

  const heardLabel =
    sourceLang === "auto"
      ? detectedLang
        ? `${LANG_LABEL[detectedLang]} · auto`
        : "Source · auto"
      : LANG_LABEL[sourceLang];

  return (
    <div className="space-y-4">
      {/* Controls */}
      <div className="flex flex-col items-center gap-4 bg-white dark:bg-slate-800 rounded-xl border border-slate-200 dark:border-slate-700 p-4">
        <div className="flex flex-wrap items-center justify-center gap-3">
          <div className="flex rounded-lg overflow-hidden border border-slate-300 dark:border-slate-700" role="group" aria-label="Source language">
            {SOURCE_OPTIONS.map((lang) => (
              <button
                key={lang}
                onClick={() => {
                  setSourceLang(lang);
                  resetSttLang();
                  if (listening) stopListening();
                }}
                className={`px-3 py-2 text-sm font-medium ${
                  sourceLang === lang ? "bg-indigo-600 text-white" : "bg-white dark:bg-slate-800 text-slate-600 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-800/50"
                }`}
              >
                {LANG_FLAG[lang]} {lang === "auto" ? "Auto" : LANG_LABEL[lang]}
              </button>
            ))}
          </div>
          <span className="text-slate-400 dark:text-slate-500">→</span>
          <div className="flex rounded-lg overflow-hidden border border-slate-300 dark:border-slate-700" role="group" aria-label="Target language">
            {TARGET_OPTIONS.map((lang) => (
              <button
                key={lang}
                onClick={() => {
                  setTargetLang(lang);
                  stopSpeaking();
                }}
                className={`px-3 py-2 text-sm font-medium ${
                  targetLang === lang ? "bg-indigo-600 text-white" : "bg-white dark:bg-slate-800 text-slate-600 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-800/50"
                }`}
              >
                {LANG_FLAG[lang]} {LANG_LABEL[lang]}
              </button>
            ))}
          </div>
        </div>
        <ModelSelector models={models} value={model} onChange={setModel} />
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
          onClick={listening ? endListening : beginListening}
          disabled={!model || (engine === "browser" && !speechSupported)}
          className={`w-20 h-20 rounded-full text-3xl flex items-center justify-center transition-colors ${
            listening ? "bg-red-500 text-white recording" : "bg-indigo-600 text-white hover:bg-indigo-500"
          } disabled:opacity-40 disabled:cursor-not-allowed`}
          aria-label={listening ? "Stop listening" : "Start listening"}
        >
          {listening ? "■" : "🎙️"}
        </button>
        <p className="text-sm text-slate-500 dark:text-slate-400">
          {listening
            ? `Listening (${
                sourceLang === "auto"
                  ? detectedLang
                    ? `auto · ${LANG_LABEL[detectedLang]}`
                    : "auto-detecting…"
                  : LANG_LABEL[sourceLang]
              }) → ${LANG_LABEL[targetLang]}… ${engine === "server" ? "speak naturally, pause between sentences" : "speak naturally"}`
            : engine === "browser" && !speechSupported
              ? "Live recognition isn't supported here — switch to ☁️ Whisper below, or type."
              : "Tap to speak"}
        </p>
        {statusMsg && <p className="text-sm text-red-600 dark:text-red-400">{statusMsg}</p>}
      </div>

      {/* Typed fallback */}
      <form onSubmit={handleTypedSubmit} className="flex gap-2">
        <input
          value={typedText}
          onChange={(e) => setTypedText(e.target.value)}
          placeholder={`Or type ${sourceLang === "auto" ? "any" : LANG_LABEL[sourceLang]} text and press Enter…`}
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
            {heardLabel} (heard)
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
          <h2 className="text-xs font-semibold uppercase tracking-wide text-slate-400 dark:text-slate-500 mb-3">
            {LANG_LABEL[targetLang]}
          </h2>
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
              <p className="text-slate-300 dark:text-slate-600 text-sm">Translation will appear here…</p>
            )}
          </div>
        </div>
      </div>

      {/* Footer controls */}
      <div className="flex flex-wrap items-center justify-between gap-3 text-sm text-slate-500 dark:text-slate-400">
        <div className="flex flex-wrap items-center gap-4">
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
          <label className="flex items-center gap-2">
            <input
              type="checkbox"
              checked={autoSpeak}
              onChange={(e) => {
                setAutoSpeak(e.target.checked);
                if (!e.target.checked) stopSpeaking();
              }}
              className="rounded"
            />
            🔊 Auto-play {LANG_LABEL[targetLang]}
          </label>
          <VoiceSelector
            value={personaId}
            onChange={(id) => {
              setPersonaId(id);
              stopSpeaking();
            }}
          />
          <label
            className="flex items-center gap-2"
            title="Broadcast translations to connected displays (LED ticker, /display page)"
          >
            <input
              type="checkbox"
              checked={sendToDisplay}
              onChange={(e) => setSendToDisplay(e.target.checked)}
              className="rounded"
            />
            📺 Send to display
            {sendToDisplay && displayListeners !== null && (
              <span
                className={`text-xs ${
                  displayListeners > 0 ? "text-emerald-600 dark:text-emerald-400" : "text-slate-400 dark:text-slate-500"
                }`}
              >
                {displayListeners > 0
                  ? `${displayListeners} connected`
                  : "no displays connected"}
              </span>
            )}
          </label>
          <span className="flex items-center gap-1.5">
            Voice input:
            <span className="flex rounded-lg overflow-hidden border border-slate-300 dark:border-slate-700">
              {(["browser", "server"] as const).map((e) => (
                <button
                  key={e}
                  onClick={() => {
                    if (listening) endListening();
                    setEngine(e);
                  }}
                  className={`px-2 py-1 text-xs font-medium ${
                    engine === e
                      ? "bg-indigo-600 text-white"
                      : "bg-white dark:bg-slate-800 text-slate-600 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-800/50"
                  }`}
                  title={e === "browser" ? "Live browser recognition (Chrome/Edge)" : "Server-side Whisper — works in any browser"}
                >
                  {e === "browser" ? "⚡ Live" : "☁️ Whisper"}
                </button>
              ))}
            </span>
          </span>
        </div>
        {segments.length > 0 && (
          <button onClick={clearAll} className="text-slate-400 dark:text-slate-500 hover:text-red-500 dark:hover:text-red-400">
            Clear session
          </button>
        )}
      </div>
    </div>
  );
}
