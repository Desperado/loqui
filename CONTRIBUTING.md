# Contributing to Loqui

Thanks for your interest in improving Loqui! This project is open source under the
[MIT License](LICENSE), and contributions of all kinds are welcome — bug reports, features,
docs, and models.

## Getting set up

```bash
npm install
cp .env.example .env   # add at least one provider key
npm run dev
```

See the [README](README.md) for the full environment reference.

## Development workflow

1. **Fork** the repo and create a branch from `main` (e.g. `feature/uk-tts-voice`).
2. Make your change. Keep it focused — one logical change per pull request.
3. Before pushing, make sure the app builds and lints cleanly:
   ```bash
   npm run build
   npm run lint
   ```
4. **Open a pull request** against `main` with a clear description of what changed and why.
   Screenshots or a short clip help for UI changes.

## Guidelines

- **Match the surrounding style** — TypeScript, Tailwind utility classes, small focused modules.
- **Adding a model?** It's usually a single entry in `src/lib/models.ts`. Verify the model id
  is currently valid with the provider before submitting (provider model catalogs change).
- **Keep the storage interface small** — `src/lib/db.ts` is deliberately minimal so it can be
  swapped for Postgres/Turso; don't spread raw SQL across the codebase.
- **Don't commit secrets.** `.env` is gitignored; use `.env.example` for new variables.

## Reporting bugs

Open an issue with steps to reproduce, what you expected, what happened, and your browser/OS.
For voice issues, note which input engine (⚡ Live or ☁️ Whisper) and which browser.

By contributing, you agree that your contributions will be licensed under the MIT License.
