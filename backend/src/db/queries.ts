import Database from 'better-sqlite3';
import { readFileSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));

let db: Database.Database | null = null;

export function getDb(): Database.Database {
  if (!db) {
    const dbPath = process.env.DATABASE_PATH || './data/sessions.db';
    db = new Database(dbPath);
    db.pragma('journal_mode = WAL');

    // Initialize schema
    const schema = readFileSync(join(__dirname, 'schema.sql'), 'utf-8');
    db.exec(schema);
  }
  return db;
}

export interface SessionRow {
  id: string;
  created_at: string;
  updated_at: string;
  node_id: string | null;
  node_name: string | null;
  page_type: string | null;
  score_initial: number | null;
  score_current: number | null;
  lint_result: string | null;
  ai_review: string | null;
  refero_data: string | null;
  issues_found: number;
  issues_fixed: number;
  issues_skipped: number;
  conversation: string;
  duration_seconds: number | null;
}

export function createSession(id: string, nodeId?: string, nodeName?: string): void {
  const db = getDb();
  db.prepare(
    'INSERT INTO sessions (id, node_id, node_name) VALUES (?, ?, ?)'
  ).run(id, nodeId || null, nodeName || null);
}

export function getSession(id: string): SessionRow | undefined {
  const db = getDb();
  return db.prepare('SELECT * FROM sessions WHERE id = ?').get(id) as SessionRow | undefined;
}

const ALLOWED_COLUMNS = new Set([
  'page_type', 'score_initial', 'score_current', 'lint_result',
  'ai_review', 'refero_data', 'issues_found', 'issues_fixed', 'issues_skipped',
  'conversation', 'duration_seconds', 'node_id', 'node_name',
]);

export function updateSession(id: string, updates: Partial<Record<string, unknown>>): void {
  const db = getDb();
  const keys = Object.keys(updates).filter(k => ALLOWED_COLUMNS.has(k));
  if (keys.length === 0) return;

  const sets = keys.map(k => `${k} = ?`).join(', ');
  const values = keys.map(k => {
    const v = updates[k];
    if (v === null || v === undefined) return null;
    return typeof v === 'object' ? JSON.stringify(v) : v;
  });
  db.prepare(`UPDATE sessions SET ${sets}, updated_at = CURRENT_TIMESTAMP WHERE id = ?`).run(...values, id);
}

export function appendConversation(id: string, role: string, content: string): void {
  const db = getDb();
  const session = getSession(id);
  if (!session) return;

  let conversation: Array<{ role: string; content: string; timestamp: number }> = [];
  try {
    const parsed = JSON.parse(session.conversation || '[]');
    conversation = Array.isArray(parsed) ? parsed : [];
  } catch {
    conversation = [];
  }
  conversation.push({ role, content, timestamp: Date.now() });
  db.prepare('UPDATE sessions SET conversation = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?')
    .run(JSON.stringify(conversation), id);
}
