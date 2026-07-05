"use client";

import { useCallback, useRef, useState } from "react";
import { wer } from "@/lib/metrics";

interface Phrase {
  id: string;
  lang: "de" | "en";
  text: string;
}

interface Attempt {
  phraseId: string;
  expected: string;
  recognized: string;
  wer: number;
}

const SPEECH_LANG = { de: "de-DE", en: "en-US" } as const;

export function SttValidator({ phrases }: { phrases: Phrase[] }) {
  const [current, setCurrent] = useState(0);
  const [recording, setRecording] = useState(false);
  const [recognized, setRecognized] = useState("");
  const [attempts, setAttempts] = useState<Attempt[]>([]);
  const [error, setError] = useState<string | null>(null);
  const recognitionRef = useRef<SpeechRecognition | null>(null);

  const phrase = phrases[current];

  const stop = useCallback(() => {
    recognitionRef.current?.stop();
    recognitionRef.current = null;
    setRecording(false);
  }, []);

  const record = useCallback(() => {
    const Ctor = window.SpeechRecognition || window.webkitSpeechRecognition;
    if (!Ctor) {
      setError("Speech recognition is not supported in this browser (try Chrome or Edge).");
      return;
    }
    setError(null);
    setRecognized("");
    const rec = new Ctor();
    rec.lang = SPEECH_LANG[phrase.lang];
    rec.continuous = false;
    rec.interimResults = true;
    rec.onresult = (ev) => {
      let text = "";
      for (let i = 0; i < ev.results.length; i++) {
        text += ev.results[i][0]?.transcript ?? "";
      }
      setRecognized(text);
    };
    rec.onerror = (ev) => {
      if (ev.error !== "aborted" && ev.error !== "no-speech") {
        setError(`Recognition error: ${ev.error}`);
      }
      setRecording(false);
    };
    rec.onend = () => setRecording(false);
    recognitionRef.current = rec;
    setRecording(true);
    rec.start();
  }, [phrase]);

  const score = () => {
    if (!recognized.trim()) return;
    const attempt: Attempt = {
      phraseId: phrase.id,
      expected: phrase.text,
      recognized: recognized.trim(),
      wer: wer(recognized, phrase.text),
    };
    setAttempts((prev) => [...prev, attempt]);
    setRecognized("");
    setCurrent((c) => (c + 1) % phrases.length);
  };

  const avgWer = attempts.length
    ? Math.round((attempts.reduce((a, b) => a + b.wer, 0) / attempts.length) * 1000) / 10
    : null;

  return (
    <div className="bg-white dark:bg-slate-800 rounded-xl border border-slate-200 dark:border-slate-700 p-4 space-y-3">
      <h2 className="font-semibold">Voice recognition validation (WER)</h2>
      <p className="text-sm text-slate-500 dark:text-slate-400">
        Read the phrase aloud; Loqui compares what the recognizer heard against the reference and computes
        the word error rate. Lower is better (0% = perfect recognition).
      </p>

      <div className="rounded-lg bg-slate-50 dark:bg-slate-800/50 border border-slate-200 dark:border-slate-700 p-4 text-center">
        <div className="text-xs text-slate-400 dark:text-slate-500 mb-1">
          {phrase.lang === "de" ? "🇩🇪 Read aloud in German" : "🇬🇧 Read aloud in English"} ·{" "}
          {current + 1}/{phrases.length}
        </div>
        <p className="text-lg font-medium">{phrase.text}</p>
      </div>

      <div className="flex items-center gap-3">
        <button
          onClick={recording ? stop : record}
          className={`rounded-lg px-4 py-2 text-sm font-medium text-white ${
            recording ? "bg-red-500 recording" : "bg-indigo-600 hover:bg-indigo-500"
          }`}
        >
          {recording ? "■ Stop" : "🎙️ Record"}
        </button>
        <button
          onClick={score}
          disabled={!recognized.trim()}
          className="rounded-lg border border-slate-300 dark:border-slate-700 px-4 py-2 text-sm hover:bg-slate-50 dark:hover:bg-slate-800/50 disabled:opacity-40"
        >
          Score & next
        </button>
        <button
          onClick={() => setCurrent((c) => (c + 1) % phrases.length)}
          className="text-sm text-slate-400 dark:text-slate-500 hover:text-slate-600 dark:hover:text-slate-300"
        >
          Skip
        </button>
      </div>

      {recognized && (
        <p className="text-sm">
          <span className="text-slate-400 dark:text-slate-500">Heard:</span> {recognized}
        </p>
      )}
      {error && <p className="text-sm text-red-600 dark:text-red-400">{error}</p>}

      {attempts.length > 0 && (
        <div className="pt-2">
          <div className="text-sm font-medium mb-2">
            Average WER: <span className={avgWer! <= 10 ? "text-green-600 dark:text-green-400" : avgWer! <= 25 ? "text-amber-600 dark:text-amber-400" : "text-red-600 dark:text-red-400"}>{avgWer}%</span>{" "}
            over {attempts.length} attempt{attempts.length > 1 ? "s" : ""}
          </div>
          <table className="w-full text-xs">
            <thead>
              <tr className="text-left text-slate-400 dark:text-slate-500 border-b border-slate-100 dark:border-slate-700">
                <th className="py-1 pr-3">Expected</th>
                <th className="py-1 pr-3">Recognized</th>
                <th className="py-1">WER</th>
              </tr>
            </thead>
            <tbody>
              {attempts.map((a, i) => (
                <tr key={i} className="border-b border-slate-50 dark:border-slate-700 align-top">
                  <td className="py-1 pr-3">{a.expected}</td>
                  <td className="py-1 pr-3">{a.recognized}</td>
                  <td className="py-1">{Math.round(a.wer * 1000) / 10}%</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
