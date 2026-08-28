import { loadEnvConfig } from "@next/env";
import { serveStdio } from "@modelcontextprotocol/server/stdio";
import { createLoquiMcpServer } from "./server";

// Reuse Loqui's existing server-side provider configuration without ever printing it.
loadEnvConfig(process.cwd(), process.env.NODE_ENV !== "production", { info: () => undefined, error: () => undefined });

void serveStdio(() => createLoquiMcpServer(), {
  onerror: () => {
    // stderr is reserved for generic operational status only. Never include submitted text,
    // provider responses, prompts, request objects, or credential-bearing error details.
    console.error("Loqui MCP transport error.");
  },
});
