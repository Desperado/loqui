# 🎙️ Loqui

Instant **streaming voice translation**: speak German or English, get Ukrainian in real time —
routed through ultra-fast LLMs (Cerebras Llama/Qwen, Gemma via Groq & Google AI, OpenAI).
Dubbing is on the roadmap (a browser text-to-speech preview is built in).

See [plan.md](plan.md) for the full architecture plan.

## Features

- **Live demo page** — tap the mic, speak, watch the Ukrainian translation stream in as you talk
  (interim speech gets a live preview; finalized sentences stream token-by-token). Typed input
  works too for browsers without speech recognition.
- **Multi-model routing** — pick any configured model; all providers are driven through one
  OpenAI-compatible streaming client. Per-segment time-to-first-token is displayed.
- **Chat history** — sign in with GitHub and every session is saved; browse and delete on `/history`.
- **Evals** — `/evals` runs the built-in DE→UK / EN→UK eval set through selected models and scores
  with chrF + optional LLM-as-judge, and validates voice recognition with a read-aloud WER test.
- **Dubbing preview** — 🔊 on any translation speaks it with the browser's Ukrainian voice.

## Getting started

```bash
npm install
cp .env.example .env   # fill in keys (see below)
npm run dev            # http://localhost:3000
```

### Environment

| Variable | Purpose |
|---|---|
| `AUTH_SECRET` | Auth.js secret (`npx auth secret`) |
| `AUTH_GITHUB_ID` / `AUTH_GITHUB_SECRET` | GitHub OAuth app (callback: `<origin>/api/auth/callback/github`) |
| `CEREBRAS_API_KEY` | Enables Llama 3.3 70B, Llama 3.1 8B, Qwen 3 32B (ultra-fast) |
| `GROQ_API_KEY` | Enables Gemma 2 9B |
| `GOOGLE_AI_API_KEY` | Enables Gemma 3 27B, Gemini 2.0 Flash |
| `OPENAI_API_KEY` | Enables GPT-4o mini |

Models auto-enable based on which keys are present — set at least one provider key.
The demo works without signing in; GitHub login is only needed to save history.

Speech recognition uses the browser's Web Speech API — best in Chrome or Edge.

## Notes

- Storage is SQLite (`./data/loqui.db`) — perfect for local/demo use. For serverless deploys,
  swap `src/lib/db.ts` for Postgres/Turso (the interface is small on purpose).
- `npm run build && npm start` for production mode.
