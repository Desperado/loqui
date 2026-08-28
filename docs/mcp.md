# Loqui MCP server

Loqui exposes its application humanization engine as a local Model Context Protocol (MCP)
server. It is a stdio server intended to be launched by an MCP client; it does not automate the
web UI and it uses the same Groq/Cerebras model registry and provider client as the Next.js app.

## Local setup

1. Install dependencies with `npm install`.
2. Configure `GROQ_API_KEY`, `CEREBRAS_API_KEY`, or both using Loqui's existing server-side
   environment setup. The MCP process loads the same untracked Next.js environment files as the
   app when its working directory is the repository root.
3. Optionally set `LOQUI_HUMANIZE_MODEL` to a supported Groq or Cerebras model ID. If it is not
   available, Loqui falls back through its configured cross-provider model order.
4. Run `npm run mcp`. A client normally owns this process, so a healthy server waits silently for
   protocol messages.

Do not put provider credentials in MCP JSON/TOML, source control, `NEXT_PUBLIC_*` variables, or
client-side code. Prefer the existing untracked server environment or a local secret manager.

## MCP client configuration

Replace `/absolute/path/to/loqui` with the repository path. The working directory is important
because it is where Loqui resolves its server-side environment configuration.

For Codex, add this to a trusted project's `.codex/config.toml` or the user-level
`~/.codex/config.toml`:

```toml
[mcp_servers.loqui]
command = "npm"
args = ["run", "--silent", "mcp"]
cwd = "/absolute/path/to/loqui"
startup_timeout_sec = 20
tool_timeout_sec = 90
```

For Claude Code, use `.mcp.json`; for Cursor Composer, use `.cursor/mcp.json`:

```json
{
  "mcpServers": {
    "loqui": {
      "command": "npm",
      "args": ["run", "--silent", "mcp"],
      "cwd": "/absolute/path/to/loqui"
    }
  }
}
```

In Conductor, project-level Claude configuration is discovered from `.mcp.json`, project-level
Codex configuration from `.codex/config.toml`, and project-level Cursor configuration from
`.cursor/mcp.json`. Refresh the MCP status after editing configuration. Configuration scope and
status behavior are documented in the [Conductor MCP reference](https://www.conductor.build/docs/reference/mcp).

## Tools

### `humanize_text`

Input:

```json
{
  "text": "Hi Maya, Acme Corp will send 12 files by Friday. Details: https://example.com/docs",
  "tone": "warm",
  "max_characters": 160,
  "recipient_name": "Maya",
  "recipient_context": "Project lead",
  "preserve_terms": ["Acme Corp", "Friday"],
  "avoid": ["em_dash", "double_dash", "cliches", "salesy_language"],
  "language": "en"
}
```

Illustrative response:

```json
{
  "humanized_text": "Hi Maya, Acme Corp will send 12 files by Friday. You can find the details at https://example.com/docs.",
  "character_count": 102,
  "within_limit": true,
  "preserved_terms": ["Acme Corp", "Friday"],
  "warnings": []
}
```

`tone` is one of `conversational`, `crisp`, `warm`, or `polished`. `max_characters` counts Unicode
code points and must be between 1 and 12,000. `language` accepts a BCP 47-style language code.
Every `preserve_terms` value must already occur exactly in `text`. If a protected term conflicts
with a punctuation restriction, Loqui returns `RESTRICTION_CONFLICT` instead of altering it.

### `humanize_batch`

Input contains 1–50 requests using the `humanize_text` schema:

```json
{
  "requests": [
    { "text": "Please review this today.", "tone": "crisp", "max_characters": 80 },
    { "text": "", "tone": "warm", "max_characters": 80 },
    { "text": "Thanks for the update.", "tone": "warm", "max_characters": 80 }
  ]
}
```

Results remain in input order. An invalid or failed item does not discard successful siblings:

```json
{
  "results": [
    {
      "index": 0,
      "success": true,
      "result": {
        "humanized_text": "Please review this today.",
        "character_count": 25,
        "within_limit": true,
        "preserved_terms": [],
        "warnings": []
      }
    },
    {
      "index": 1,
      "success": false,
      "error": { "code": "INVALID_INPUT", "message": "Text must not be empty.", "retryable": false }
    },
    {
      "index": 2,
      "success": true,
      "result": {
        "humanized_text": "Thanks for the update.",
        "character_count": 22,
        "within_limit": true,
        "preserved_terms": [],
        "warnings": []
      }
    }
  ]
}
```

### `validate_humanization`

Input:

```json
{
  "original_text": "Acme Corp will send 12 files to https://example.com.",
  "rewritten_text": "Acme Corp will send the files.",
  "preserve_terms": ["Acme Corp"]
}
```

The structured response has a top-level `valid` flag and separate checks for `names`,
`companies`, `numbers`, `links`, `claims`, `intent`, and `required_terms`. Exact-value checks list
their original, missing, and added values. Claims conservatively compare protected entities,
polarity, uncertainty, commitments, and prohibited invented-claim patterns. The response includes
a warning that nuanced semantic equivalence can still require human review.

## Reliability and privacy

- Each provider attempt has a 15-second deadline and one bounded retry for transient network,
  throttling, and server failures.
- Configured Groq and Cerebras models provide graceful cross-provider fallback.
- If a first rewrite is too long, Loqui automatically requests a shorter complete rewrite. It
  never truncates words or sentences.
- Loqui validates exact terms, names, companies, URLs, numbers, claim markers, intent, and style
  before returning a rewrite. Unsafe candidates are corrected or rejected.
- Provider messages use a low temperature for repeatable automation.
- Tool errors contain only `code`, a safe public `message`, and `retryable`; provider bodies,
  credentials, prompts, and submitted text are excluded.
- The MCP server has no persistence path and does not log submitted text. Text is sent only to the
  configured model provider to perform the requested rewrite.

MCP clients may have their own logging or transcript retention. Review the client and provider's
privacy settings before submitting sensitive text.
