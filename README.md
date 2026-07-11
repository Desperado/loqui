# 🎙️ Loqui

Loqui includes a **Humanize** writing workspace at `/humanize`: a streaming, meaning-preserving rewrite tool with conversational, crisp, warm, and polished voices. It reuses the existing Groq and Cerebras model routing; configure either provider key as usual.

[![License: MIT](https://img.shields.io/badge/License-MIT-blue.svg)](LICENSE)
[![Next.js](https://img.shields.io/badge/Next.js-15-black)](https://nextjs.org/)
[![Deploy on Railway](https://img.shields.io/badge/Deploy-Railway-8b5cf6)](https://railway.app/)

Instant **streaming voice translation** across **9 languages** — German, English, Ukrainian,
French, Polish, Spanish, Latin, Italian, and Swedish — speak in any of them, get a live
translation in another, routed through ultra-fast LLMs
(Cerebras, Groq, Google Gemini, OpenAI). Optional server-side speech recognition (Whisper) and
voice dubbing (OpenAI TTS) make it work in any browser.

See [plan.md](plan.md) for the architecture write-up.

## Features

- **Any-direction translation** among 🇩🇪 German, 🇬🇧 English, 🇺🇦 Ukrainian, 🇫🇷 French, 🇵🇱 Polish,
  🇪🇸 Spanish, 🏛️ Latin, 🇮🇹 Italian, and 🇸🇪 Swedish, with an **Auto**
  source mode that detects the spoken language for you.
- **Live streaming** — finalized speech streams token-by-token; interim speech gets a debounced
  preview. Per-segment time-to-first-token is shown (typically ~150–300 ms).
- **Two voice-input engines** — **⚡ Live** (browser Web Speech API, lowest latency, Chrome/Edge)
  and **☁️ Whisper** (server-side speech-to-text, works in any browser). Typed input works too.
- **Voice playback / dubbing** — 🔊 speaks any translation, and an auto-play toggle dubs each
  segment as it finishes. Uses server-side OpenAI TTS when configured, with a browser voice fallback.
- **Multi-model routing** — every provider is driven through one OpenAI-compatible streaming
  client; adding a model is a one-entry change to the registry. Models auto-enable per API key.
- **External displays** — a **📺 Send to display** toggle broadcasts each translation over SSE
  (`/api/display/stream`) to any connected display client: the fullscreen `/display` subtitle
  page (tablet or kiosk browser parked at the TV), or a Raspberry Pi–driven LED matrix ticker
  (hardware guide + client in [`display-client/`](display-client/)).
- **Chat history** — sign in with GitHub and sessions are saved; browse/delete on `/history`.
- **Evals** — `/evals` scores translation quality across models (chrF + optional LLM-as-judge)
  and validates speech recognition with a read-aloud word-error-rate test.
- **Light / dark / system** theme switcher.

## Tech stack

Next.js 15 (App Router) · React 19 · TypeScript · Tailwind CSS · Auth.js (NextAuth v5) ·
SQLite (better-sqlite3).

## Quick start

```bash
npm install
cp .env.example .env    # add at least one provider key (see below)
npm run dev             # http://localhost:3000
```

Voice input works best in Chrome or Edge; the ☁️ Whisper engine works anywhere (needs `OPENAI_API_KEY`).

### Environment

| Variable | Purpose |
|---|---|
| `AUTH_SECRET` | Auth.js secret — generate with `npx auth secret` |
| `AUTH_GITHUB_ID` / `AUTH_GITHUB_SECRET` | GitHub OAuth app (callback: `<origin>/api/auth/callback/github`) |
| `CEREBRAS_API_KEY` | Cerebras — Gemma 4 31B, GPT-OSS 120B (ultra-fast) |
| `GROQ_API_KEY` | Groq — Llama 3.1 8B Instant, Llama 3.3 70B |
| `GOOGLE_AI_API_KEY` | Google — Gemini 3.1 Flash Lite, Gemini 2.5 Flash |
| `OPENAI_API_KEY` | OpenAI — GPT-4o mini translation, **Whisper STT** and **TTS dubbing** |
| `LOQUI_DB_PATH` | Optional — SQLite path (default `./data/loqui.db`) |
| `LOQUI_DISPLAY_TOKEN` | Optional — shared secret for the external-display feed (`/api/display/stream`) |

Set at least one provider key — models auto-enable based on which keys are present.
Server-side speech-to-text and text-to-speech require `OPENAI_API_KEY`. The demo works without
signing in; GitHub login is only needed to save history.

## Deployment (Railway)

Loqui ships with `railway.json` (Nixpacks). To deploy:

1. Create a project and service, and attach a **volume mounted at `/data`** so the SQLite
   database persists across redeploys.
2. Set `LOQUI_DB_PATH=/data/loqui.db`, `AUTH_SECRET`, and your provider keys.
3. Deploy (`railway up`, or connect the GitHub repo). `next start` binds to Railway's `$PORT`.

Any Node host works; on ephemeral/serverless platforms, swap `src/lib/db.ts` for Postgres or Turso
(the storage interface is intentionally small).

## Scripts

```bash
npm run dev      # dev server
npm run build    # production build
npm start        # run the production build
npm run lint     # lint
```

## Contributing

Contributions are welcome — see [CONTRIBUTING.md](CONTRIBUTING.md) and our
[Code of Conduct](CODE_OF_CONDUCT.md).

## License

[MIT](LICENSE) © Ruslan Strazhnyk
