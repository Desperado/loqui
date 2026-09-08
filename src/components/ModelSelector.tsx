export interface ModelInfo {
  id: string;
  label: string;
  provider: string;
  speed: string;
  enabled: boolean;
}

interface ModelSelectorProps {
  models: ModelInfo[];
  value: string;
  onChange: (modelId: string) => void;
  className?: string;
  label?: string;
  unavailableLabel?: string;
}

export function ModelSelector({ models, value, onChange, className = "", label = "Translation model", unavailableLabel = "no API key" }: ModelSelectorProps) {
  return (
    <select
      value={value}
      onChange={(e) => onChange(e.target.value)}
      className={`min-h-11 rounded-lg border border-slate-300 dark:border-slate-700 px-3 py-2 text-base sm:text-sm bg-white dark:bg-slate-800 min-w-56 ${className}`}
      aria-label={label}
    >
      {models.map((m) => (
        <option key={m.id} value={m.id} disabled={!m.enabled}>
          {m.speed === "ultra" ? "⚡ " : ""}
          {m.label}
          {m.enabled ? "" : ` (${unavailableLabel})`}
        </option>
      ))}
    </select>
  );
}
