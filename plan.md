# Loqui — architecture plan

Loqui is an instant **streaming voice translation** app: spoken German or English in, streaming
Ukrainian out, routed through fast LLM providers. Dubbing (spoken output) is on the roadmap;
a browser-TTS preview already exists.

## 1. Product goals

| Goal | Status |
|---|---|
| Instant streaming translation DE/EN voice → UK text | ✅ shipped (demo page) |
| Route across many LLMs, incl. Cerebras and Gemma | ✅ shipped (model registry) |
| Simple, intuitive UI | ✅ single-screen demo: mic, language toggle, model picker |
| Save chat history | ✅ per-user, GitHub-login gated |
| Validate voice recognition + translation quality (evals) | ✅ evals page (chrF, LLM judge, WER) |
| Login via GitHub | ✅ Auth.js (NextAuth v5) |
| Dubbing (voice output) | 🔜 roadmap; browser `speechSynthesis` preview shipped |

## 2. High-level architecture

```
┌────────────────────────── Browser ──────────────────────────┐
│  Web Speech API (STT, de-DE / en-US, interim results)       │
│  TranslatorDemo (React) ── fetch stream ──► /api/translate  │
│  speechSynthesis (uk-UA)  ← dubbing preview                 │
└──────────────────────────────────────────────────────────────┘
                              │
┌────────────────────── Next.js server ────────────────────────┐
│  /api/translate   – streams UK translation (plain-text body) │
│  /api/models      – model registry + enabled flags           │
│  /api/conversations[...] – history CRUD (auth required)      │
│  /api/evals/run   – NDJSON-streaming eval harness            │
│  /api/auth/[...nextauth] – GitHub OAuth (Auth.js, JWT)       │
│                                                              │
│  lib/models.ts    – provider/model registry                  │
│  lib/translate.ts – OpenAI-compatible streaming client       │
│  lib/metrics.ts   – chrF + WER implementations               │
│  lib/db.ts        – SQLite (better-sqlite3, WAL)             │
└──────────────────────────────────────────────────────────────┘
                              │
        ┌─────────────┬──────┴──────┬─────────────┐
        ▼             ▼             ▼             ▼
     Cerebras       Groq        Google AI      OpenAI
   (Llama, Qwen) (Gemma 2 9B) (Gemma 3 27B,  (gpt-4o-mini)
    ultra-fast                  Gemini Flash)
```

### Why these pieces

- **Speech-to-text in the browser (Web Speech API).** Zero-latency interim results, no audio
  upload, no STT bill — ideal for an instant demo. The trade-off (Chrome/Edge only, quality
  varies) is mitigated by the typed-input fallback and measured by the WER validator.
- **One wire protocol for every LLM.** Cerebras, Groq, Google AI and OpenAI all expose
  OpenAI-compatible `/chat/completions`, so routing = base URL + key + model name
  (`src/lib/models.ts`). Adding a model is a one-entry change; models auto-enable when their
  provider key is present.
- **Cerebras first.** Time-to-first-token dominates perceived latency in live translation;
  Cerebras serves Llama 3.3 70B at ultra speed. Gemma is available two ways: Gemma 2 9B on
  Groq and Gemma 3 27B on Google AI.
- **SQLite via better-sqlite3.** Zero-ops persistence for a demo. The data layer is a thin
  module (`src/lib/db.ts`) so swapping to Postgres/Turso for serverless deploys is contained.
- **Auth.js JWT sessions, no DB adapter.** GitHub OAuth issues a JWT; the GitHub user id keys
  conversations. The demo page works logged-out; history requires login.

## 3. Streaming translation flow

1. Mic on → `SpeechRecognition` (lang `de-DE`/`en-US`, `continuous`, `interimResults`).
2. **Interim** transcript: debounced 350 ms → `/api/translate` (previous request aborted) →
   live italic Ukrainian preview.
3. **Final** segment: immediately streamed through `/api/translate`; tokens render as they
   arrive; time-to-first-token is recorded and shown per segment.
4. Server relays the provider's SSE stream as a plain-text chunked response (no buffering,
   `X-Accel-Buffering: no`).
5. If signed in with "Save to history" on, each finished segment is POSTed to the current
   conversation (created lazily on the first segment).

## 4. Evals

Two harnesses on `/evals`:

- **Translation quality** (`POST /api/evals/run`, NDJSON progress stream):
  built-in eval set of DE→UK and EN→UK sentences with reference translations
  (`src/lib/evalset.ts`). Each selected model translates every item; scored with
  **chrF** (character n-gram F-score, implemented in `src/lib/metrics.ts`) plus optional
  **LLM-as-judge** (1–5 adequacy/fluency). Per-model averages (chrF, judge, latency, errors)
  are streamed live, and runs/results are persisted for comparison over time.
- **Voice recognition validation** (client-side): read-aloud phrases; recognized text is
  scored with **WER** (Levenshtein over words) against the reference, with a running average.

## 5. Data model (SQLite)

```
conversations(id, user_id, title, source_lang, model, created_at)
messages(id, conversation_id, source_text, translated_text, source_lang, model, latency_ms, created_at)
eval_runs(id, user_id, kind, models(json), summary(json), created_at)
eval_results(id, run_id, model, item_id, source_lang, source, reference, output, chrf, judge_score, latency_ms, error)
```

## 6. Roadmap

1. **Dubbing (v2 headline).** Replace the `speechSynthesis` preview with a server TTS pipeline
   (e.g. ElevenLabs / Azure / OpenAI TTS): stream translated sentence chunks → TTS → chained
   audio playback. The segment pipeline already yields sentence-sized units, which is the right
   granularity for TTS.
2. **Server-side STT option** (Whisper via Groq/OpenAI) for browsers without Web Speech and to
   eval STT engines against each other with the same WER harness.
3. **More routing smarts**: automatic fallback on provider errors, latency-based routing,
   per-segment model comparison view.
4. **Serverless-ready storage**: Turso/Postgres behind the same `db.ts` interface.
5. **Bigger eval sets**: import FLORES-200 DE/EN→UK slices; regression tracking across runs.
6. **More languages** beyond DE/EN → UK (registry and prompts are already parameterized).

## 7. Repository layout

```
src/
  app/                 # Next.js App Router
    page.tsx           # demo (translate)
    history/page.tsx   # saved sessions (GitHub login)
    evals/page.tsx     # quality evals
    api/               # translate, models, conversations, evals, auth
  components/          # TranslatorDemo, HistoryBrowser, EvalRunner, SttValidator, Header
  lib/                 # models (registry), translate (LLM client), db, metrics, evalset
  auth.ts              # Auth.js config (GitHub)
  types/speech.d.ts    # Web Speech API typings
```
