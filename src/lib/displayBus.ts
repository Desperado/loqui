/**
 * In-memory pub/sub bus for external subtitle displays.
 *
 * The translator UI POSTs finished (and interim) translations to
 * /api/display/send; any number of display clients (LED matrix tickers,
 * kiosk browsers, …) subscribe via the SSE endpoint /api/display/stream.
 *
 * Stored on globalThis so dev-server hot reloads and multiple route modules
 * share one subscriber set. Single-instance only — same constraint as the
 * SQLite store, and fine for the "one server, one living room" deployment.
 */

export type DisplayEventKind = "final" | "interim" | "clear";

export interface DisplayEvent {
  kind: DisplayEventKind;
  /** Translated text (empty for "clear"). */
  text: string;
  /** BCP-47-ish language code of the text, e.g. "uk". */
  lang: string;
  /** Server timestamp, ms since epoch. */
  ts: number;
}

type Subscriber = (event: DisplayEvent) => void;

const globalStore = globalThis as typeof globalThis & {
  __loquiDisplaySubscribers?: Set<Subscriber>;
};

function subscribers(): Set<Subscriber> {
  return (globalStore.__loquiDisplaySubscribers ??= new Set());
}

export function subscribeDisplay(fn: Subscriber): () => void {
  subscribers().add(fn);
  return () => subscribers().delete(fn);
}

export function publishDisplay(event: DisplayEvent): number {
  const subs = subscribers();
  for (const fn of subs) {
    try {
      fn(event);
    } catch {
      subs.delete(fn); // dead subscriber (closed stream)
    }
  }
  return subs.size;
}

export function displaySubscriberCount(): number {
  return subscribers().size;
}
