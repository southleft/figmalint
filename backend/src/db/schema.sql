CREATE TABLE IF NOT EXISTS sessions (
  id TEXT PRIMARY KEY,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  file_key TEXT,
  node_id TEXT,
  node_name TEXT,
  page_type TEXT,

  score_initial INTEGER,
  score_current INTEGER,

  lint_result JSON,
  ai_review JSON,

  issues_found INTEGER DEFAULT 0,
  issues_fixed INTEGER DEFAULT 0,
  issues_skipped INTEGER DEFAULT 0,

  conversation JSON DEFAULT '[]',

  duration_seconds INTEGER
);
