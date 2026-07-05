"use client";

import { useEffect, useState } from "react";

interface ModelInfo {
  id: string;
  label: string;
  enabled: boolean;
}

interface ResultLine {
  model: string;
  itemId: string;
  source: string;
  reference: string;
  output: string;
  chrf: number | null;
  judgeScore: number | null;
  latencyMs: number | null;
  error?: string | null;
}

interface Summary {
  [model: string]: {
    avgChrf: number | null;
    avgJudge: number | null;
    avgLatencyMs: number | null;
    items: number;
    errors: number;
  };
}

interface PastRun {
  id: string;
  kind: string;
  models: string;
  summary: string;
  created_at: number;
}

export function EvalRunner() {
  const [models, setModels] = useState<ModelInfo[]>([]);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [useJudge, setUseJudge] = useState(false);
  const [running, setRunning] = useState(false);
  const [progress, setProgress] = useState({ done: 0, total: 0 });
  const [results, setResults] = useState<ResultLine[]>([]);
  const [summary, setSummary] = useState<Summary | null>(null);
  const [pastRuns, setPastRuns] = useState<PastRun[]>([]);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    fetch("/api/models")
      .then((r) => r.json())
      .then((data: { models: ModelInfo[] }) => {
        setModels(data.models);
        setSelected(new Set(data.models.filter((m) => m.enabled).slice(0, 2).map((m) => m.id)));
      })
      .catch(() => {});
    void loadRuns();
  }, []);

  const loadRuns = async () => {
    try {
      const res = await fetch("/api/evals");
      if (res.ok) {
        const data = await res.json();
        setPastRuns((data.runs as PastRun[]).filter((r) => r.kind === "translation"));
      }
    } catch {
      /* non-fatal */
    }
  };

  const toggle = (id: string) => {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const run = async () => {
    setRunning(true);
    setResults([]);
    setSummary(null);
    setError(null);
    setProgress({ done: 0, total: 0 });
    try {
      const res = await fetch("/api/evals/run", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ models: [...selected], judge: useJudge }),
      });
      if (!res.ok || !res.body) {
        setError(await res.text());
        return;
      }
      const reader = res.body.getReader();
      const decoder = new TextDecoder();
      let buffer = "";
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split("\n");
        buffer = lines.pop() ?? "";
        for (const line of lines) {
          if (!line.trim()) continue;
          const event = JSON.parse(line);
          if (event.type === "start") {
            setProgress({ done: 0, total: event.total });
          } else if (event.type === "result") {
            setResults((prev) => [...prev, event]);
            setProgress((p) => ({ ...p, done: p.done + 1 }));
          } else if (event.type === "done") {
            setSummary(event.summary);
          }
        }
      }
      void loadRuns();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Eval run failed");
    } finally {
      setRunning(false);
    }
  };

  const modelLabel = (id: string) => models.find((m) => m.id === id)?.label ?? id;

  return (
    <div className="space-y-4">
      <div className="bg-white rounded-xl border border-slate-200 p-4 space-y-3">
        <h2 className="font-semibold">Translation quality (chrF + LLM judge)</h2>
        <p className="text-sm text-slate-500">
          Runs the built-in DE→UK / EN→UK sentence set through the selected models. Scores each output
          with chrF against a reference translation; optionally an LLM judge rates adequacy 1–5.
        </p>
        <div className="flex flex-wrap gap-2">
          {models.map((m) => (
            <label
              key={m.id}
              className={`flex items-center gap-2 text-sm rounded-lg border px-3 py-1.5 cursor-pointer ${
                !m.enabled
                  ? "opacity-40 cursor-not-allowed"
                  : selected.has(m.id)
                    ? "border-indigo-400 bg-indigo-50"
                    : "border-slate-200"
              }`}
            >
              <input
                type="checkbox"
                disabled={!m.enabled}
                checked={selected.has(m.id)}
                onChange={() => toggle(m.id)}
              />
              {m.label}
            </label>
          ))}
        </div>
        <div className="flex items-center gap-4">
          <label className="flex items-center gap-2 text-sm text-slate-600">
            <input type="checkbox" checked={useJudge} onChange={(e) => setUseJudge(e.target.checked)} />
            LLM-as-judge scoring (slower)
          </label>
          <button
            onClick={run}
            disabled={running || selected.size === 0}
            className="ml-auto rounded-lg bg-indigo-600 text-white px-4 py-2 text-sm font-medium hover:bg-indigo-500 disabled:opacity-40"
          >
            {running ? `Running… ${progress.done}/${progress.total || "…"}` : "Run eval"}
          </button>
        </div>
        {error && <p className="text-sm text-red-600">{error}</p>}
      </div>

      {summary && (
        <div className="bg-white rounded-xl border border-slate-200 p-4">
          <h3 className="font-semibold mb-3">Summary</h3>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="text-left text-slate-400 border-b border-slate-100">
                  <th className="py-2 pr-4">Model</th>
                  <th className="py-2 pr-4">avg chrF</th>
                  <th className="py-2 pr-4">avg judge (1–5)</th>
                  <th className="py-2 pr-4">avg latency</th>
                  <th className="py-2">errors</th>
                </tr>
              </thead>
              <tbody>
                {Object.entries(summary)
                  .sort(([, a], [, b]) => (b.avgChrf ?? 0) - (a.avgChrf ?? 0))
                  .map(([model, s]) => (
                    <tr key={model} className="border-b border-slate-50">
                      <td className="py-2 pr-4 font-medium">{modelLabel(model)}</td>
                      <td className="py-2 pr-4">{s.avgChrf ?? "—"}</td>
                      <td className="py-2 pr-4">{s.avgJudge ?? "—"}</td>
                      <td className="py-2 pr-4">{s.avgLatencyMs != null ? `${s.avgLatencyMs} ms` : "—"}</td>
                      <td className="py-2">{s.errors}</td>
                    </tr>
                  ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {results.length > 0 && (
        <div className="bg-white rounded-xl border border-slate-200 p-4">
          <h3 className="font-semibold mb-3">Per-item results</h3>
          <div className="overflow-x-auto max-h-96 overflow-y-auto">
            <table className="w-full text-xs">
              <thead className="sticky top-0 bg-white">
                <tr className="text-left text-slate-400 border-b border-slate-100">
                  <th className="py-2 pr-3">Model</th>
                  <th className="py-2 pr-3">Source</th>
                  <th className="py-2 pr-3">Output</th>
                  <th className="py-2 pr-3">Reference</th>
                  <th className="py-2 pr-3">chrF</th>
                  <th className="py-2">judge</th>
                </tr>
              </thead>
              <tbody>
                {results.map((r, i) => (
                  <tr key={i} className="border-b border-slate-50 align-top">
                    <td className="py-2 pr-3 whitespace-nowrap">{modelLabel(r.model)}</td>
                    <td className="py-2 pr-3">{r.source}</td>
                    <td className="py-2 pr-3">{r.error ? <span className="text-red-500">{r.error}</span> : r.output}</td>
                    <td className="py-2 pr-3 text-slate-400">{r.reference}</td>
                    <td className="py-2 pr-3">{r.chrf ?? "—"}</td>
                    <td className="py-2">{r.judgeScore ?? "—"}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {pastRuns.length > 0 && (
        <div className="bg-white rounded-xl border border-slate-200 p-4">
          <h3 className="font-semibold mb-3">Past runs</h3>
          <div className="space-y-2 text-sm">
            {pastRuns.map((r) => {
              let parsed: { perModel?: Summary } = {};
              try {
                parsed = JSON.parse(r.summary);
              } catch {
                /* legacy row */
              }
              return (
                <div key={r.id} className="border border-slate-100 rounded-lg p-3">
                  <div className="text-xs text-slate-400 mb-1">
                    {new Date(r.created_at).toLocaleString()}
                  </div>
                  {parsed.perModel ? (
                    <div className="flex flex-wrap gap-3">
                      {Object.entries(parsed.perModel).map(([model, s]) => (
                        <span key={model} className="text-slate-600">
                          <span className="font-medium">{modelLabel(model)}</span>: chrF {s.avgChrf ?? "—"}
                          {s.avgJudge != null && ` · judge ${s.avgJudge}`}
                          {s.avgLatencyMs != null && ` · ${s.avgLatencyMs} ms`}
                        </span>
                      ))}
                    </div>
                  ) : (
                    <span className="text-slate-400">in progress / incomplete</span>
                  )}
                </div>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}
