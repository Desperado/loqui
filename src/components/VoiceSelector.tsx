import { VOICE_PERSONAS } from "@/lib/voices";

interface VoiceSelectorProps {
  value: string;
  onChange: (personaId: string) => void;
  className?: string;
}

export function VoiceSelector({ value, onChange, className = "" }: VoiceSelectorProps) {
  return (
    <label className={`flex items-center gap-2 text-sm text-slate-600 dark:text-slate-300 ${className}`}>
      Voice
      <select
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className="rounded-lg border border-slate-300 dark:border-slate-700 px-3 py-2 text-sm bg-white dark:bg-slate-800"
        aria-label="Voice persona"
      >
        {VOICE_PERSONAS.map((p) => (
          <option key={p.id} value={p.id}>
            {p.label}
          </option>
        ))}
      </select>
    </label>
  );
}
