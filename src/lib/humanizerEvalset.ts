/**
 * Small, reference-based fixtures for comparing humanization quality and
 * latency across models. References are examples, not the only valid output.
 */
export interface HumanizerEvalItem {
  id: string;
  category: "staging" | "rhythm" | "inflation" | "formatting" | "residue";
  language: "en" | "de" | "uk";
  source: string;
  reference: string;
}

export const HUMANIZER_EVAL_SET: HumanizerEvalItem[] = [
  {
    id: "staging-en-01",
    category: "staging",
    language: "en",
    source: "The export is not just fast, but reliable. That is the real win.",
    reference: "The export is fast and reliable.",
  },
  {
    id: "staging-en-02",
    category: "staging",
    language: "en",
    source: "Let's dive into the cache. The cache stores responses for five minutes.",
    reference: "The cache stores responses for five minutes.",
  },
  {
    id: "rhythm-en-01",
    category: "rhythm",
    language: "en",
    source: "Exports finish in two seconds—reports open instantly—filters respond without delay.",
    reference: "Exports finish in two seconds. Reports open instantly, and filters respond without delay.",
  },
  {
    id: "rhythm-de-01",
    category: "rhythm",
    language: "de",
    source: "Das Update ist schnell — die Bedienung ist einfach — die Ergebnisse sind stabil.",
    reference: "Das Update ist schnell, einfach zu bedienen und liefert stabile Ergebnisse.",
  },
  {
    id: "inflation-en-01",
    category: "inflation",
    language: "en",
    source: "The pivotal release showcases a robust platform and adds dark mode.",
    reference: "The release adds dark mode.",
  },
  {
    id: "inflation-uk-01",
    category: "inflation",
    language: "uk",
    source: "Цей знаковий випуск відкриває неймовірне майбутнє продукту та додає темну тему.",
    reference: "Цей випуск додає темну тему.",
  },
  {
    id: "formatting-en-01",
    category: "formatting",
    language: "en",
    source: "- **Speed:** Pages load faster.\n- **Security:** Sessions expire after one hour.",
    reference: "Pages load faster, and sessions expire after one hour.",
  },
  {
    id: "formatting-de-01",
    category: "formatting",
    language: "de",
    source: "## Schnelle Leistung\n\nLeistung ist wichtig. Die Seite lädt in zwei Sekunden.",
    reference: "## Leistung\n\nDie Seite lädt in zwei Sekunden.",
  },
  {
    id: "residue-en-01",
    category: "residue",
    language: "en",
    source: "Great question! The meeting starts at 10:00. I hope this helps!",
    reference: "The meeting starts at 10:00.",
  },
  {
    id: "residue-uk-01",
    category: "residue",
    language: "uk",
    source: "Звісно! Зустріч починається о 10:00. Сподіваюся, це допоможе!",
    reference: "Зустріч починається о 10:00.",
  },
];
