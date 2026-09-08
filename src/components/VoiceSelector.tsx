"use client";

import { VOICE_PERSONAS } from "@/lib/voices";
import { useBrowserProfile } from "@/components/BrowserProfileProvider";

interface VoiceSelectorProps {
  value: string;
  onChange: (personaId: string) => void;
  className?: string;
}

export function VoiceSelector({ value, onChange, className = "" }: VoiceSelectorProps) {
  const { t } = useBrowserProfile();
  return (
    <label className={`flex min-h-11 items-center gap-2 text-sm text-slate-600 dark:text-slate-300 ${className}`}>
      {t("voice")}
      <select
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className="min-h-11 rounded-lg border border-slate-300 bg-white px-3 py-2 text-base dark:border-slate-700 dark:bg-slate-800 sm:text-sm"
        aria-label={t("voicePersona")}
      >
        {VOICE_PERSONAS.map((p) => (
          <option key={p.id} value={p.id}>
            {t(p.labelKey)}
          </option>
        ))}
      </select>
    </label>
  );
}
