"use client";

import { useCallback, useEffect, useState } from "react";

interface Conversation {
  id: string;
  title: string;
  source_lang: string;
  model: string;
  created_at: number;
  message_count: number;
}

interface Message {
  id: string;
  source_text: string;
  translated_text: string;
  source_lang: string;
  model: string;
  latency_ms: number | null;
  created_at: number;
}

export function HistoryBrowser() {
  const [conversations, setConversations] = useState<Conversation[]>([]);
  const [selected, setSelected] = useState<string | null>(null);
  const [messages, setMessages] = useState<Message[]>([]);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch("/api/conversations");
      if (res.ok) {
        const data = await res.json();
        setConversations(data.conversations);
      }
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  useEffect(() => {
    if (!selected) {
      setMessages([]);
      return;
    }
    fetch(`/api/conversations/${selected}`)
      .then((r) => (r.ok ? r.json() : null))
      .then((data) => data && setMessages(data.messages))
      .catch(() => {});
  }, [selected]);

  const remove = async (id: string) => {
    await fetch(`/api/conversations/${id}`, { method: "DELETE" });
    if (selected === id) setSelected(null);
    void load();
  };

  if (loading) return <p className="text-slate-400 dark:text-slate-500 text-sm">Loading history…</p>;

  if (conversations.length === 0) {
    return (
      <p className="text-slate-500 dark:text-slate-400 text-sm">
        No saved sessions yet. Translate something on the demo page with “Save to history” enabled.
      </p>
    );
  }

  return (
    <div className="grid md:grid-cols-[280px_1fr] gap-4">
      <div className="space-y-2">
        {conversations.map((c) => (
          <div
            key={c.id}
            className={`group rounded-lg border p-3 cursor-pointer text-sm ${
              selected === c.id
                ? "border-indigo-400 dark:border-indigo-500 bg-indigo-50 dark:bg-indigo-950"
                : "border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 hover:border-slate-300 dark:hover:border-slate-700"
            }`}
            onClick={() => setSelected(c.id)}
          >
            <div className="flex items-start justify-between gap-2">
              <span className="font-medium text-slate-800 dark:text-slate-100 line-clamp-2">{c.title}</span>
              <button
                onClick={(e) => {
                  e.stopPropagation();
                  void remove(c.id);
                }}
                className="opacity-0 group-hover:opacity-100 text-slate-400 dark:text-slate-500 hover:text-red-500 dark:hover:text-red-400"
                title="Delete conversation"
              >
                ✕
              </button>
            </div>
            <div className="text-xs text-slate-400 dark:text-slate-500 mt-1">
              {c.message_count} messages · {new Date(c.created_at).toLocaleDateString()}
            </div>
          </div>
        ))}
      </div>
      <div className="bg-white dark:bg-slate-800 rounded-xl border border-slate-200 dark:border-slate-700 p-4 min-h-64">
        {!selected ? (
          <p className="text-slate-400 dark:text-slate-500 text-sm">Select a session to view its transcript.</p>
        ) : (
          <div className="space-y-3">
            {messages.map((m) => (
              <div key={m.id} className="border-b border-slate-100 dark:border-slate-700 pb-3 last:border-0">
                <p className="text-slate-500 dark:text-slate-400 text-sm">
                  {m.source_lang === "de" ? "🇩🇪" : "🇬🇧"} {m.source_text}
                </p>
                <p className="text-slate-900 dark:text-slate-100">🇺🇦 {m.translated_text}</p>
                <p className="text-[10px] text-slate-400 dark:text-slate-500 mt-1">
                  {m.model}
                  {m.latency_ms != null ? ` · ${m.latency_ms} ms` : ""} ·{" "}
                  {new Date(m.created_at).toLocaleTimeString()}
                </p>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
