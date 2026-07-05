import type { SourceLang } from "./translate";

export interface EvalItem {
  id: string;
  sourceLang: SourceLang;
  source: string;
  /** Reference Ukrainian translation. */
  reference: string;
}

/**
 * Built-in translation eval set: everyday spoken sentences,
 * German → Ukrainian and English → Ukrainian, with reference translations.
 */
export const TRANSLATION_EVAL_SET: EvalItem[] = [
  {
    id: "de-01",
    sourceLang: "de",
    source: "Guten Morgen, wie geht es dir heute?",
    reference: "Доброго ранку, як у тебе сьогодні справи?",
  },
  {
    id: "de-02",
    sourceLang: "de",
    source: "Ich hätte gerne einen Kaffee mit Milch, bitte.",
    reference: "Я хотів би каву з молоком, будь ласка.",
  },
  {
    id: "de-03",
    sourceLang: "de",
    source: "Wo ist der nächste Bahnhof?",
    reference: "Де найближчий вокзал?",
  },
  {
    id: "de-04",
    sourceLang: "de",
    source: "Können Sie das bitte wiederholen? Ich habe Sie nicht verstanden.",
    reference: "Можете, будь ласка, повторити? Я вас не зрозумів.",
  },
  {
    id: "de-05",
    sourceLang: "de",
    source: "Die Besprechung wurde auf nächste Woche verschoben.",
    reference: "Нараду перенесли на наступний тиждень.",
  },
  {
    id: "de-06",
    sourceLang: "de",
    source: "Das Wetter ist heute wirklich schön, wir sollten spazieren gehen.",
    reference: "Сьогодні справді гарна погода, нам варто піти на прогулянку.",
  },
  {
    id: "en-01",
    sourceLang: "en",
    source: "Good evening, my name is Anna and I am from Berlin.",
    reference: "Добрий вечір, мене звати Анна, і я з Берліна.",
  },
  {
    id: "en-02",
    sourceLang: "en",
    source: "Could you please send me the report by tomorrow morning?",
    reference: "Чи не могли б ви надіслати мені звіт до завтрашнього ранку?",
  },
  {
    id: "en-03",
    sourceLang: "en",
    source: "The train to Kyiv leaves from platform three.",
    reference: "Потяг до Києва відправляється з третьої платформи.",
  },
  {
    id: "en-04",
    sourceLang: "en",
    source: "I don't understand this sentence, can you explain it to me?",
    reference: "Я не розумію це речення, можеш мені його пояснити?",
  },
  {
    id: "en-05",
    sourceLang: "en",
    source: "Our team is working on a new real-time translation feature.",
    reference: "Наша команда працює над новою функцією перекладу в реальному часі.",
  },
  {
    id: "en-06",
    sourceLang: "en",
    source: "How much does a ticket to the city center cost?",
    reference: "Скільки коштує квиток до центру міста?",
  },
];

/** Read-aloud phrases for validating speech recognition (WER against these). */
export const STT_EVAL_SET: { id: string; lang: SourceLang; text: string }[] = [
  { id: "stt-de-01", lang: "de", text: "Ich möchte morgen früh nach München fahren." },
  { id: "stt-de-02", lang: "de", text: "Das Restaurant an der Ecke hat heute leider geschlossen." },
  { id: "stt-de-03", lang: "de", text: "Bitte schicken Sie mir die Unterlagen bis Freitag." },
  { id: "stt-en-01", lang: "en", text: "The quick brown fox jumps over the lazy dog." },
  { id: "stt-en-02", lang: "en", text: "Please schedule the meeting for three o'clock on Thursday." },
  { id: "stt-en-03", lang: "en", text: "Machine translation quality has improved significantly this year." },
];
