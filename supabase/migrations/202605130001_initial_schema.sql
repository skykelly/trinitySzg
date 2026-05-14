CREATE TABLE IF NOT EXISTS agents (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  role TEXT NOT NULL,
  persona_type TEXT NOT NULL DEFAULT '',
  description TEXT NOT NULL DEFAULT '',
  tone TEXT NOT NULL DEFAULT '',
  debate_style TEXT NOT NULL DEFAULT '',
  provider TEXT NOT NULL,
  model TEXT NOT NULL,
  temperature DOUBLE PRECISION NOT NULL,
  system_prompt TEXT NOT NULL,
  knowledge TEXT NOT NULL,
  judgment_criteria TEXT NOT NULL DEFAULT '',
  debate_behavior TEXT NOT NULL DEFAULT '',
  response_template TEXT NOT NULL DEFAULT '',
  challenge_rules TEXT NOT NULL DEFAULT '',
  evidence_rules TEXT NOT NULL DEFAULT '',
  scorecard TEXT NOT NULL DEFAULT '',
  agent_type TEXT DEFAULT 'specialist_agent',
  updated_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS conversations (
  id BIGSERIAL PRIMARY KEY,
  agent_id TEXT NOT NULL,
  title TEXT NOT NULL,
  created_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS messages (
  id BIGSERIAL PRIMARY KEY,
  conversation_id BIGINT NOT NULL,
  role TEXT NOT NULL,
  content TEXT NOT NULL,
  created_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS debates (
  id BIGSERIAL PRIMARY KEY,
  question TEXT NOT NULL,
  conclusion TEXT NOT NULL,
  created_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS debate_turns (
  id BIGSERIAL PRIMARY KEY,
  debate_id BIGINT NOT NULL,
  agent_id TEXT NOT NULL,
  agent_name TEXT NOT NULL,
  round TEXT NOT NULL,
  content TEXT NOT NULL,
  created_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS knowledge_sources (
  id BIGSERIAL PRIMARY KEY,
  agent_id TEXT NOT NULL,
  title TEXT NOT NULL,
  url TEXT NOT NULL,
  source_type TEXT NOT NULL,
  reliability TEXT NOT NULL,
  priority INTEGER NOT NULL,
  summary TEXT NOT NULL,
  tags TEXT NOT NULL DEFAULT '[]',
  content_status TEXT NOT NULL DEFAULT 'summary_only',
  content_error TEXT NOT NULL DEFAULT '',
  last_ingested_at TEXT NOT NULL DEFAULT '',
  external_source_id TEXT,
  external_project_id TEXT,
  domain_id TEXT,
  content_hash TEXT,
  last_synced_at TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  UNIQUE(agent_id, url)
);

CREATE TABLE IF NOT EXISTS knowledge_chunks (
  id BIGSERIAL PRIMARY KEY,
  source_id BIGINT NOT NULL,
  chunk_index INTEGER NOT NULL,
  content TEXT NOT NULL,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  UNIQUE(source_id, chunk_index)
);

CREATE TABLE IF NOT EXISTS debate_insights (
  id TEXT PRIMARY KEY,
  debate_id TEXT NOT NULL,
  domain_id TEXT,
  insight_type TEXT NOT NULL,
  agent_id TEXT,
  title TEXT NOT NULL,
  content TEXT NOT NULL,
  confidence TEXT DEFAULT 'medium',
  evidence_level TEXT DEFAULT 'medium',
  tags TEXT DEFAULT '[]',
  status TEXT DEFAULT 'draft',
  valid_until TEXT,
  reviewed_at TEXT,
  created_at TEXT DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS super_agent_answers (
  id TEXT PRIMARY KEY,
  question TEXT NOT NULL,
  scenario_markdown TEXT NOT NULL DEFAULT '',
  business_markdown TEXT NOT NULL DEFAULT '',
  executive_markdown TEXT NOT NULL DEFAULT '',
  created_at TEXT DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT DEFAULT CURRENT_TIMESTAMP
);
