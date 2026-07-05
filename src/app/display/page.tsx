"use client";

import { useEffect, useRef, useState } from "react";

interface DisplayEvent {
  kind: "final" | "interim" | "clear";
  text: string;
  lang: string;
  ts: number;
}

/** How long a finished line stays on screen before the display goes idle. */
const FINAL_HOLD_MS = 12_000;
/** Interim previews vanish if no update arrives for this long. */
const INTERIM_HOLD_MS = 5_000;

/**
 * /display — fullscreen subtitle view for a device placed at the TV
 * (tablet, kiosk-mode browser, Pi with a bar screen). Subscribes to the
 * SSE feed and renders whatever the translator broadcasts via the
 * "Send to display" toggle. Pass ?token=… if LOQUI_DISPLAY_TOKEN is set.
 */
export default function DisplayPage() {
  const [finalText, setFinalText] = useState("");
  const [interimText, setInterimText] = useState("");
  const [connected, setConnected] = useState(false);
  const finalTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const interimTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    const token = new URLSearchParams(window.location.search).get("token");
    const url = `/api/display/stream${token ? `?token=${encodeURIComponent(token)}` : ""}`;
    const es = new EventSource(url); // auto-reconnects on drop
    es.onopen = () => setConnected(true);
    es.onerror = () => setConnected(false);
    es.onmessage = (msg) => {
      let event: DisplayEvent;
      try {
        event = JSON.parse(msg.data);
      } catch {
        return;
      }
      if (finalTimerRef.current) clearTimeout(finalTimerRef.current);
      if (interimTimerRef.current) clearTimeout(interimTimerRef.current);
      if (event.kind === "clear") {
        setFinalText("");
        setInterimText("");
      } else if (event.kind === "final") {
        setFinalText(event.text);
        setInterimText("");
        finalTimerRef.current = setTimeout(() => setFinalText(""), FINAL_HOLD_MS);
      } else {
        setInterimText(event.text);
        interimTimerRef.current = setTimeout(() => setInterimText(""), INTERIM_HOLD_MS);
      }
    };
    return () => {
      es.close();
      if (finalTimerRef.current) clearTimeout(finalTimerRef.current);
      if (interimTimerRef.current) clearTimeout(interimTimerRef.current);
    };
  }, []);

  // Keep the screen awake — this page lives on a device parked at the TV.
  useEffect(() => {
    let lock: { release(): Promise<void> } | null = null;
    const acquire = async () => {
      try {
        lock = await navigator.wakeLock?.request("screen");
      } catch {
        /* unsupported or denied — the OS screen timeout applies */
      }
    };
    void acquire();
    const onVisible = () => {
      if (document.visibilityState === "visible") void acquire();
    };
    document.addEventListener("visibilitychange", onVisible);
    return () => {
      document.removeEventListener("visibilitychange", onVisible);
      void lock?.release().catch(() => {});
    };
  }, []);

  const idle = !finalText && !interimText;

  return (
    <div className="fixed inset-0 z-50 bg-black flex flex-col items-center justify-center px-[4vw] select-none cursor-none">
      {idle ? (
        <p className="text-slate-700 text-[3vmin] tracking-widest uppercase">
          Loqui display · {connected ? "waiting for translation…" : "connecting…"}
        </p>
      ) : (
        <div className="text-center space-y-[2vmin]">
          {finalText && (
            <p className="text-white font-semibold leading-tight text-[8vmin] [text-wrap:balance]">
              {finalText}
            </p>
          )}
          {interimText && (
            <p className={`leading-tight [text-wrap:balance] ${finalText ? "text-slate-500 text-[4.5vmin]" : "text-slate-200 font-medium text-[7vmin]"}`}>
              {interimText}
            </p>
          )}
        </div>
      )}
      <span
        className={`absolute bottom-[2vmin] right-[2vmin] w-[1.2vmin] h-[1.2vmin] rounded-full ${connected ? "bg-emerald-500" : "bg-red-500 animate-pulse"}`}
        title={connected ? "Connected" : "Reconnecting…"}
      />
    </div>
  );
}
