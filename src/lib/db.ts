import Database from "better-sqlite3";
import fs from "node:fs";
import path from "node:path";
import crypto from "node:crypto";

const DB_PATH = process.env.LOQUI_DB_PATH ?? path.join(process.cwd(), "data", "loqui.db");

declare global {
  // eslint-disable-next-line no-var
  var __loquiDb: Database.Database | undefined;
}

function open(): Database.Database {
  fs.mkdirSync(path.dirname(DB_PATH), { recursive: true });
  const db = new Database(DB_PATH);
  db.pragma("journal_mode = WAL");
  db.exec(`
    CREATE TABLE IF NOT EXISTS conversations (
      id TEXT PRIMARY KEY,
      user_id TEXT NOT NULL,
      title TEXT NOT NULL,
      source_lang TEXT NOT NULL,
      model TEXT NOT NULL,
      created_at INTEGER NOT NULL
    );
    CREATE TABLE IF NOT EXISTS messages (
      id TEXT PRIMARY KEY,
      conversation_id TEXT NOT NULL REFERENCES conversations(id) ON DELETE CASCADE,
      source_text TEXT NOT NULL,
      translated_text TEXT NOT NULL,
      source_lang TEXT NOT NULL,
      model TEXT NOT NULL,
      latency_ms INTEGER,
      created_at INTEGER NOT NULL
    );
    CREATE INDEX IF NOT EXISTS idx_messages_conversation ON messages(conversation_id);
    CREATE TABLE IF NOT EXISTS eval_runs (
      id TEXT PRIMARY KEY,
      user_id TEXT,
      kind TEXT NOT NULL,
      models TEXT NOT NULL,
      summary TEXT NOT NULL,
      created_at INTEGER NOT NULL
    );
    CREATE TABLE IF NOT EXISTS eval_results (
      id TEXT PRIMARY KEY,
      run_id TEXT NOT NULL REFERENCES eval_runs(id) ON DELETE CASCADE,
      model TEXT NOT NULL,
      item_id TEXT NOT NULL,
      source_lang TEXT NOT NULL,
      source TEXT NOT NULL,
      reference TEXT NOT NULL,
      output TEXT NOT NULL,
      chrf REAL,
      judge_score REAL,
      latency_ms INTEGER,
      error TEXT
    );
    CREATE INDEX IF NOT EXISTS idx_eval_results_run ON eval_results(run_id);
  `);
  return db;
}

export function getDb(): Database.Database {
  if (!globalThis.__loquiDb) globalThis.__loquiDb = open();
  return globalThis.__loquiDb;
}

export const newId = () => crypto.randomUUID();

// ---- Conversations ----

export interface ConversationRow {
  id: string;
  user_id: string;
  title: string;
  source_lang: string;
  model: string;
  created_at: number;
  message_count?: number;
}

export interface MessageRow {
  id: string;
  conversation_id: string;
  source_text: string;
  translated_text: string;
  source_lang: string;
  model: string;
  latency_ms: number | null;
  created_at: number;
}

export function createConversation(
  userId: string,
  title: string,
  sourceLang: string,
  model: string
): ConversationRow {
  const row: ConversationRow = {
    id: newId(),
    user_id: userId,
    title,
    source_lang: sourceLang,
    model,
    created_at: Date.now(),
  };
  getDb()
    .prepare(
      "INSERT INTO conversations (id, user_id, title, source_lang, model, created_at) VALUES (?, ?, ?, ?, ?, ?)"
    )
    .run(row.id, row.user_id, row.title, row.source_lang, row.model, row.created_at);
  return row;
}

export function listConversations(userId: string): ConversationRow[] {
  return getDb()
    .prepare(
      `SELECT c.*, (SELECT COUNT(*) FROM messages m WHERE m.conversation_id = c.id) AS message_count
       FROM conversations c WHERE c.user_id = ? ORDER BY c.created_at DESC LIMIT 100`
    )
    .all(userId) as ConversationRow[];
}

export function getConversation(id: string, userId: string): ConversationRow | undefined {
  return getDb()
    .prepare("SELECT * FROM conversations WHERE id = ? AND user_id = ?")
    .get(id, userId) as ConversationRow | undefined;
}

export function deleteConversation(id: string, userId: string): void {
  const db = getDb();
  const owned = db.prepare("SELECT 1 FROM conversations WHERE id = ? AND user_id = ?").get(id, userId);
  if (!owned) return;
  db.prepare("DELETE FROM messages WHERE conversation_id = ?").run(id);
  db.prepare("DELETE FROM conversations WHERE id = ?").run(id);
}

export function listMessages(conversationId: string): MessageRow[] {
  return getDb()
    .prepare("SELECT * FROM messages WHERE conversation_id = ? ORDER BY created_at ASC")
    .all(conversationId) as MessageRow[];
}

export function addMessage(
  conversationId: string,
  data: Pick<MessageRow, "source_text" | "translated_text" | "source_lang" | "model" | "latency_ms">
): MessageRow {
  const row: MessageRow = {
    id: newId(),
    conversation_id: conversationId,
    created_at: Date.now(),
    ...data,
  };
  getDb()
    .prepare(
      `INSERT INTO messages (id, conversation_id, source_text, translated_text, source_lang, model, latency_ms, created_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?)`
    )
    .run(
      row.id,
      row.conversation_id,
      row.source_text,
      row.translated_text,
      row.source_lang,
      row.model,
      row.latency_ms,
      row.created_at
    );
  return row;
}

// ---- Evals ----

export interface EvalRunRow {
  id: string;
  user_id: string | null;
  kind: string;
  models: string;
  summary: string;
  created_at: number;
}

export interface EvalResultRow {
  id: string;
  run_id: string;
  model: string;
  item_id: string;
  source_lang: string;
  source: string;
  reference: string;
  output: string;
  chrf: number | null;
  judge_score: number | null;
  latency_ms: number | null;
  error: string | null;
}

export function createEvalRun(
  userId: string | null,
  kind: string,
  models: string[],
  summary: object
): string {
  const id = newId();
  getDb()
    .prepare("INSERT INTO eval_runs (id, user_id, kind, models, summary, created_at) VALUES (?, ?, ?, ?, ?, ?)")
    .run(id, userId, kind, JSON.stringify(models), JSON.stringify(summary), Date.now());
  return id;
}

export function updateEvalSummary(runId: string, summary: object): void {
  getDb().prepare("UPDATE eval_runs SET summary = ? WHERE id = ?").run(JSON.stringify(summary), runId);
}

export function addEvalResult(result: Omit<EvalResultRow, "id">): void {
  getDb()
    .prepare(
      `INSERT INTO eval_results (id, run_id, model, item_id, source_lang, source, reference, output, chrf, judge_score, latency_ms, error)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
    )
    .run(
      newId(),
      result.run_id,
      result.model,
      result.item_id,
      result.source_lang,
      result.source,
      result.reference,
      result.output,
      result.chrf,
      result.judge_score,
      result.latency_ms,
      result.error
    );
}

export function listEvalRuns(limit = 20): EvalRunRow[] {
  return getDb()
    .prepare("SELECT * FROM eval_runs ORDER BY created_at DESC LIMIT ?")
    .all(limit) as EvalRunRow[];
}

export function listEvalResults(runId: string): EvalResultRow[] {
  return getDb()
    .prepare("SELECT * FROM eval_results WHERE run_id = ? ORDER BY model, item_id")
    .all(runId) as EvalResultRow[];
}
