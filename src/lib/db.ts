import { existsSync, mkdirSync, readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { randomUUID } from "node:crypto";
import { DatabaseSync } from "node:sqlite";
import { defaultAgents } from "./default-agents";
import type {
  Agent,
  AgentOpinion,
  AgentType,
  ChatMessage,
  ConversationResult,
  ConversationSummary,
  DebateInsight,
  DebateInsightStatus,
  DebateResult,
  DebateSummary,
  DebateTurn,
  DomainCategory,
  KnowledgeChunk,
  KnowledgeSource,
  NewAgentOpinion,
  NewDebateInsight,
  NewSuperAgentAnswer,
  RecentItem,
  SuperAgentAnswer
} from "./types";

const dbPath = join(process.cwd(), "data", "db-data", "app.db");
mkdirSync(dirname(dbPath), { recursive: true });

let database: DatabaseSync | null = null;

function getDb() {
  if (database) return database;

  const db = new DatabaseSync(dbPath);
  db.exec("PRAGMA busy_timeout = 5000;");
  const tables = [
    `CREATE TABLE IF NOT EXISTS agents (
      id TEXT PRIMARY KEY, name TEXT NOT NULL, role TEXT NOT NULL,
      persona_type TEXT NOT NULL DEFAULT '', description TEXT NOT NULL DEFAULT '',
      tone TEXT NOT NULL DEFAULT '', debate_style TEXT NOT NULL DEFAULT '',
      provider TEXT NOT NULL, model TEXT NOT NULL, temperature REAL NOT NULL,
      system_prompt TEXT NOT NULL, knowledge TEXT NOT NULL,
      judgment_criteria TEXT NOT NULL DEFAULT '', debate_behavior TEXT NOT NULL DEFAULT '',
      response_template TEXT NOT NULL DEFAULT '', challenge_rules TEXT NOT NULL DEFAULT '',
      evidence_rules TEXT NOT NULL DEFAULT '', scorecard TEXT NOT NULL DEFAULT '',
      updated_at TEXT NOT NULL
    )`,
    `CREATE TABLE IF NOT EXISTS conversations (
      id INTEGER PRIMARY KEY AUTOINCREMENT, agent_id TEXT NOT NULL,
      title TEXT NOT NULL, created_at TEXT NOT NULL
    )`,
    `CREATE TABLE IF NOT EXISTS messages (
      id INTEGER PRIMARY KEY AUTOINCREMENT, conversation_id INTEGER NOT NULL,
      role TEXT NOT NULL, content TEXT NOT NULL, created_at TEXT NOT NULL
    )`,
    `CREATE TABLE IF NOT EXISTS debates (
      id INTEGER PRIMARY KEY AUTOINCREMENT, question TEXT NOT NULL,
      conclusion TEXT NOT NULL, created_at TEXT NOT NULL
    )`,
    `CREATE TABLE IF NOT EXISTS debate_turns (
      id INTEGER PRIMARY KEY AUTOINCREMENT, debate_id INTEGER NOT NULL,
      agent_id TEXT NOT NULL, agent_name TEXT NOT NULL, round TEXT NOT NULL,
      content TEXT NOT NULL, created_at TEXT NOT NULL
    )`,
    `CREATE TABLE IF NOT EXISTS knowledge_sources (
      id INTEGER PRIMARY KEY AUTOINCREMENT, agent_id TEXT NOT NULL,
      title TEXT NOT NULL, url TEXT NOT NULL, source_type TEXT NOT NULL,
      reliability TEXT NOT NULL, priority INTEGER NOT NULL, summary TEXT NOT NULL,
      tags TEXT NOT NULL DEFAULT '[]', content_status TEXT NOT NULL DEFAULT 'summary_only',
      content_error TEXT NOT NULL DEFAULT '', last_ingested_at TEXT NOT NULL DEFAULT '',
      created_at TEXT NOT NULL, updated_at TEXT NOT NULL, UNIQUE(agent_id, url)
    )`,
    `CREATE TABLE IF NOT EXISTS knowledge_chunks (
      id INTEGER PRIMARY KEY AUTOINCREMENT, source_id INTEGER NOT NULL,
      chunk_index INTEGER NOT NULL, content TEXT NOT NULL,
      created_at TEXT NOT NULL, updated_at TEXT NOT NULL, UNIQUE(source_id, chunk_index)
    )`,
    `CREATE TABLE IF NOT EXISTS domain_categories (
      id TEXT PRIMARY KEY, name TEXT NOT NULL, sub TEXT NOT NULL DEFAULT '',
      type TEXT NOT NULL DEFAULT '', insight TEXT NOT NULL DEFAULT '',
      created_at TEXT DEFAULT CURRENT_TIMESTAMP
    )`,
    `CREATE TABLE IF NOT EXISTS debate_insights (
      id TEXT PRIMARY KEY, debate_id TEXT NOT NULL, domain_id TEXT,
      insight_type TEXT NOT NULL, agent_id TEXT, title TEXT NOT NULL, content TEXT NOT NULL,
      confidence TEXT DEFAULT 'medium', evidence_level TEXT DEFAULT 'medium',
      tags TEXT DEFAULT '[]', status TEXT DEFAULT 'draft',
      valid_until TEXT, reviewed_at TEXT,
      created_at TEXT DEFAULT CURRENT_TIMESTAMP, updated_at TEXT DEFAULT CURRENT_TIMESTAMP
    )`,
    `CREATE TABLE IF NOT EXISTS agent_opinions (
      id TEXT PRIMARY KEY, conversation_id TEXT, message_id TEXT,
      agent_id TEXT NOT NULL, domain_id TEXT, question TEXT NOT NULL,
      claim TEXT NOT NULL, rationale TEXT, evidence_refs TEXT DEFAULT '[]',
      confidence TEXT DEFAULT 'medium', score_json TEXT, tags TEXT DEFAULT '[]',
      status TEXT DEFAULT 'draft',
      created_at TEXT DEFAULT CURRENT_TIMESTAMP, updated_at TEXT DEFAULT CURRENT_TIMESTAMP
    )`,
    `CREATE TABLE IF NOT EXISTS super_agent_answers (
      id TEXT PRIMARY KEY, question TEXT NOT NULL, domain_id TEXT,
      answer_markdown TEXT NOT NULL,
      referenced_archive_ids TEXT DEFAULT '[]', referenced_evidence_ids TEXT DEFAULT '[]',
      referenced_debate_ids TEXT DEFAULT '[]', referenced_insight_ids TEXT DEFAULT '[]',
      referenced_opinion_ids TEXT DEFAULT '[]', answer_type TEXT DEFAULT 'future_life_answer',
      created_at TEXT DEFAULT CURRENT_TIMESTAMP, updated_at TEXT DEFAULT CURRENT_TIMESTAMP
    )`
  ];

  for (const sql of tables) {
    db.exec(sql);
  }

  ensureColumn(db, "agents", "persona_type", "TEXT NOT NULL DEFAULT ''");
  ensureColumn(db, "agents", "description", "TEXT NOT NULL DEFAULT ''");
  ensureColumn(db, "agents", "tone", "TEXT NOT NULL DEFAULT ''");
  ensureColumn(db, "agents", "debate_style", "TEXT NOT NULL DEFAULT ''");
  ensureColumn(db, "agents", "judgment_criteria", "TEXT NOT NULL DEFAULT ''");
  ensureColumn(db, "agents", "debate_behavior", "TEXT NOT NULL DEFAULT ''");
  ensureColumn(db, "agents", "response_template", "TEXT NOT NULL DEFAULT ''");
  ensureColumn(db, "agents", "challenge_rules", "TEXT NOT NULL DEFAULT ''");
  ensureColumn(db, "agents", "evidence_rules", "TEXT NOT NULL DEFAULT ''");
  ensureColumn(db, "agents", "scorecard", "TEXT NOT NULL DEFAULT ''");
  ensureColumn(db, "knowledge_sources", "content_status", "TEXT NOT NULL DEFAULT 'summary_only'");
  ensureColumn(db, "knowledge_sources", "content_error", "TEXT NOT NULL DEFAULT ''");
  ensureColumn(db, "knowledge_sources", "last_ingested_at", "TEXT NOT NULL DEFAULT ''");
  ensureColumn(db, "agents", "agent_type", "TEXT DEFAULT 'specialist_agent'");
  ensureColumn(db, "knowledge_sources", "external_source_id", "TEXT");
  ensureColumn(db, "knowledge_sources", "external_project_id", "TEXT");
  ensureColumn(db, "knowledge_sources", "domain_id", "TEXT");
  ensureColumn(db, "knowledge_sources", "content_hash", "TEXT");
  ensureColumn(db, "knowledge_sources", "last_synced_at", "TEXT");

  const count = db.prepare("SELECT COUNT(*) AS count FROM agents").get() as { count: number };
  if (count.count === 0) {
    const insert = db.prepare(`
      INSERT INTO agents (
        id, name, role, persona_type, description, tone, debate_style,
        provider, model, temperature, system_prompt, knowledge, judgment_criteria, debate_behavior,
        response_template, challenge_rules, evidence_rules, scorecard, updated_at
      )
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `);

    for (const agent of defaultAgents) {
      insert.run(
        agent.id,
        agent.name,
        agent.role,
        agent.personaType,
        agent.description,
        agent.tone,
        agent.debateStyle,
        agent.provider,
        agent.model,
        agent.temperature,
        agent.systemPrompt,
        agent.knowledge,
        agent.judgmentCriteria,
        agent.debateBehavior,
        agent.responseTemplate,
        agent.challengeRules,
        agent.evidenceRules,
        agent.scorecard,
        agent.updatedAt
      );
    }
  } else {
    seedMissingAgentFields(db);
    seedMissingAgents(db);
  }

  seedKnowledgeSources(db);
  seedMigrationData(db);

  database = db;
  return database;
}

function seedMissingAgents(db: DatabaseSync) {
  const existing = new Set(
    (db.prepare("SELECT id FROM agents").all() as { id: string }[]).map((r) => String(r.id))
  );
  const missing = defaultAgents.filter((a) => !existing.has(a.id));
  if (missing.length === 0) return;

  const insert = db.prepare(`
    INSERT INTO agents (
      id, name, role, agent_type, persona_type, description, tone, debate_style,
      provider, model, temperature, system_prompt, knowledge, judgment_criteria, debate_behavior,
      response_template, challenge_rules, evidence_rules, scorecard, updated_at
    )
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `);
  for (const agent of missing) {
    insert.run(
      agent.id, agent.name, agent.role, agent.agentType, agent.personaType,
      agent.description, agent.tone, agent.debateStyle,
      agent.provider, agent.model, agent.temperature, agent.systemPrompt,
      agent.knowledge, agent.judgmentCriteria, agent.debateBehavior,
      agent.responseTemplate, agent.challengeRules, agent.evidenceRules,
      agent.scorecard, agent.updatedAt
    );
  }
}

function ensureColumn(db: DatabaseSync, table: string, column: string, definition: string) {
  const columns = db.prepare(`PRAGMA table_info(${table})`).all() as Array<Record<string, unknown>>;
  if (columns.some((item) => item.name === column)) return;
  db.exec(`ALTER TABLE ${table} ADD COLUMN ${column} ${definition}`);
}

function seedMissingAgentFields(db: DatabaseSync) {
  // Force-update all core prompt/knowledge fields for specialist agents.
  // name is preserved so users who renamed agents in Persona Studio keep their changes.
  const forceUpdate = db.prepare(`
    UPDATE agents SET
      role = ?,
      description = ?,
      tone = ?,
      debate_style = ?,
      system_prompt = ?,
      knowledge = ?,
      judgment_criteria = ?,
      debate_behavior = ?,
      response_template = ?,
      challenge_rules = ?,
      evidence_rules = ?,
      scorecard = ?
    WHERE id = ? AND agent_type = 'specialist_agent'
  `);

  // Soft-update for super_agent and other types: only fill empty fields
  const softUpdate = db.prepare(`
    UPDATE agents SET
      role = ?,
      persona_type = CASE WHEN persona_type = '' THEN ? ELSE persona_type END,
      description = CASE WHEN description = '' THEN ? ELSE description END,
      tone = CASE WHEN tone = '' THEN ? ELSE tone END,
      debate_style = CASE WHEN debate_style = '' THEN ? ELSE debate_style END,
      system_prompt = CASE WHEN system_prompt = '' THEN ? ELSE system_prompt END,
      knowledge = CASE WHEN knowledge = '' THEN ? ELSE knowledge END,
      judgment_criteria = CASE WHEN judgment_criteria = '' THEN ? ELSE judgment_criteria END,
      debate_behavior = CASE WHEN debate_behavior = '' THEN ? ELSE debate_behavior END,
      response_template = CASE WHEN response_template = '' THEN ? ELSE response_template END,
      challenge_rules = CASE WHEN challenge_rules = '' THEN ? ELSE challenge_rules END,
      evidence_rules = CASE WHEN evidence_rules = '' THEN ? ELSE evidence_rules END,
      scorecard = CASE WHEN scorecard = '' THEN ? ELSE scorecard END
    WHERE id = ? AND agent_type != 'specialist_agent'
  `);

  for (const agent of defaultAgents) {
    if (agent.agentType === "specialist_agent") {
      forceUpdate.run(
        agent.role, agent.description, agent.tone, agent.debateStyle,
        agent.systemPrompt, agent.knowledge, agent.judgmentCriteria,
        agent.debateBehavior, agent.responseTemplate, agent.challengeRules,
        agent.evidenceRules, agent.scorecard, agent.id
      );
    } else {
      softUpdate.run(
        agent.role, agent.personaType, agent.description, agent.tone,
        agent.debateStyle, agent.systemPrompt, agent.knowledge,
        agent.judgmentCriteria, agent.debateBehavior, agent.responseTemplate,
        agent.challengeRules, agent.evidenceRules, agent.scorecard, agent.id
      );
    }
  }
}

function mapAgent(row: Record<string, unknown>): Agent {
  const rawAgentType = String(row.agent_type ?? "specialist_agent");
  const agentType: AgentType =
    rawAgentType === "super_agent" || rawAgentType === "moderator_agent"
      ? rawAgentType
      : "specialist_agent";
  return {
    id: String(row.id),
    name: String(row.name),
    role: String(row.role),
    agentType,
    personaType: String(row.persona_type ?? ""),
    description: String(row.description ?? ""),
    tone: String(row.tone ?? ""),
    debateStyle: String(row.debate_style ?? ""),
    provider: row.provider === "github" ? "github" : "gemini",
    model: String(row.model),
    temperature: Number(row.temperature),
    systemPrompt: String(row.system_prompt),
    knowledge: String(row.knowledge),
    judgmentCriteria: String(row.judgment_criteria ?? ""),
    debateBehavior: String(row.debate_behavior ?? ""),
    responseTemplate: String(row.response_template ?? ""),
    challengeRules: String(row.challenge_rules ?? ""),
    evidenceRules: String(row.evidence_rules ?? ""),
    scorecard: String(row.scorecard ?? ""),
    updatedAt: String(row.updated_at)
  };
}

function mapAgentId(agentId: string) {
  if (agentId === "tech_strategist") return "tech";
  if (agentId === "customer_advocate") return "customer";
  if (agentId === "pragmatic_builder") return "business";
  return agentId;
}

function seedKnowledgeSources(db: DatabaseSync) {
  const count = db.prepare("SELECT COUNT(*) AS count FROM knowledge_sources").get() as { count: number };
  if (count.count > 0) return;

  const seedPath = join(process.cwd(), "data", "knowledge_sources.json");
  if (!existsSync(seedPath)) return;

  const raw = readFileSync(seedPath, "utf8");
  const sources = JSON.parse(raw) as Array<{
    agentId?: string;
    title?: string;
    url?: string;
    sourceType?: string;
    reliability?: string;
    priority?: number;
    summary?: string;
    tags?: string[];
  }>;
  const insert = db.prepare(`
    INSERT OR IGNORE INTO knowledge_sources (
      agent_id, title, url, source_type, reliability, priority, summary, tags, created_at, updated_at
    )
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `);
  const now = new Date().toISOString();

  for (const source of sources) {
    if (!source.agentId || !source.title || !source.url || !source.summary) continue;
    insert.run(
      mapAgentId(source.agentId),
      source.title,
      source.url,
      source.sourceType ?? "external_source",
      source.reliability ?? "medium",
      source.priority ?? 3,
      source.summary,
      JSON.stringify(source.tags ?? []),
      now,
      now
    );
  }
}

function mapKnowledgeSource(row: Record<string, unknown>): KnowledgeSource {
  let tags: string[] = [];
  try {
    const parsed = JSON.parse(String(row.tags ?? "[]")) as unknown;
    if (Array.isArray(parsed)) tags = parsed.map(String);
  } catch {
    tags = [];
  }

  const reliability = String(row.reliability);
  return {
    id: Number(row.id),
    agentId: String(row.agent_id),
    title: String(row.title),
    url: String(row.url),
    sourceType: String(row.source_type),
    reliability:
      reliability === "very_high" || reliability === "high" || reliability === "medium" || reliability === "low"
        ? reliability
        : "medium",
    priority: Number(row.priority),
    summary: String(row.summary),
    tags,
    contentStatus:
      row.content_status === "indexed" || row.content_status === "failed" || row.content_status === "summary_only"
        ? row.content_status
        : "summary_only",
    contentError: String(row.content_error ?? ""),
    lastIngestedAt: String(row.last_ingested_at ?? ""),
    chunkCount: Number(row.chunk_count ?? 0),
    externalSourceId: row.external_source_id ? String(row.external_source_id) : undefined,
    externalProjectId: row.external_project_id ? String(row.external_project_id) : undefined,
    domainId: row.domain_id ? String(row.domain_id) : undefined,
    contentHash: row.content_hash ? String(row.content_hash) : undefined,
    lastSyncedAt: row.last_synced_at ? String(row.last_synced_at) : undefined,
    createdAt: String(row.created_at),
    updatedAt: String(row.updated_at)
  };
}

function mapKnowledgeChunk(row: Record<string, unknown>): KnowledgeChunk {
  const reliability = String(row.source_reliability ?? row.reliability ?? "medium");
  return {
    id: Number(row.id),
    sourceId: Number(row.source_id),
    sourceTitle: String(row.source_title ?? row.title ?? ""),
    sourceUrl: String(row.source_url ?? row.url ?? ""),
    sourceReliability:
      reliability === "very_high" || reliability === "high" || reliability === "medium" || reliability === "low"
        ? reliability
        : "medium",
    sourcePriority: Number(row.source_priority ?? row.priority ?? 3),
    chunkIndex: Number(row.chunk_index),
    content: String(row.content),
    createdAt: String(row.created_at),
    updatedAt: String(row.updated_at)
  };
}

export function getAgents(): Agent[] {
  const db = getDb();
  return db
    .prepare("SELECT * FROM agents ORDER BY rowid")
    .all()
    .map((row) => enrichAgentWithKnowledgeSources(mapAgent(row as Record<string, unknown>)));
}

export function getAgent(id: string): Agent | null {
  const db = getDb();
  const row = db.prepare("SELECT * FROM agents WHERE id = ?").get(id);
  return row ? enrichAgentWithKnowledgeSources(mapAgent(row as Record<string, unknown>)) : null;
}

function enrichAgentWithKnowledgeSources(agent: Agent): Agent {
  return { ...agent, knowledgeSources: listKnowledgeSources(agent.id) };
}

export function updateAgents(agents: Agent[]): Agent[] {
  const db = getDb();
  const update = db.prepare(`
    UPDATE agents
    SET
      name = ?,
      role = ?,
      persona_type = ?,
      description = ?,
      tone = ?,
      debate_style = ?,
      provider = ?,
      model = ?,
      temperature = ?,
      system_prompt = ?,
      knowledge = ?,
      judgment_criteria = ?,
      debate_behavior = ?,
      response_template = ?,
      challenge_rules = ?,
      evidence_rules = ?,
      scorecard = ?,
      updated_at = ?
    WHERE id = ?
  `);
  const now = new Date().toISOString();

  for (const agent of agents) {
    update.run(
      agent.name,
      agent.role,
      agent.personaType,
      agent.description,
      agent.tone,
      agent.debateStyle,
      agent.provider,
      agent.model,
      agent.temperature,
      agent.systemPrompt,
      agent.knowledge,
      agent.judgmentCriteria,
      agent.debateBehavior,
      agent.responseTemplate,
      agent.challengeRules,
      agent.evidenceRules,
      agent.scorecard,
      now,
      agent.id
    );
  }

  return getAgents();
}

export function createConversation(agentId: string, title: string): number {
  const db = getDb();
  const result = db
    .prepare("INSERT INTO conversations (agent_id, title, created_at) VALUES (?, ?, ?)")
    .run(agentId, title, new Date().toISOString());
  return Number(result.lastInsertRowid);
}

export function addMessage(conversationId: number, role: ChatMessage["role"], content: string): void {
  const db = getDb();
  db.prepare("INSERT INTO messages (conversation_id, role, content, created_at) VALUES (?, ?, ?, ?)").run(
    conversationId,
    role,
    content,
    new Date().toISOString()
  );
}

export function listConversations(limit = 30): ConversationSummary[] {
  const db = getDb();
  return db
    .prepare(
      `
      SELECT
        conversations.id,
        conversations.agent_id,
        conversations.title,
        conversations.created_at,
        agents.name AS agent_name,
        COUNT(messages.id) AS message_count
      FROM conversations
      LEFT JOIN agents ON agents.id = conversations.agent_id
      LEFT JOIN messages ON messages.conversation_id = conversations.id
      GROUP BY conversations.id
      ORDER BY conversations.created_at DESC
      LIMIT ?
    `
    )
    .all(limit)
    .map((row) => {
      const record = row as Record<string, unknown>;
      return {
        id: Number(record.id),
        agentId: String(record.agent_id),
        agentName: String(record.agent_name ?? record.agent_id),
        title: String(record.title),
        createdAt: String(record.created_at),
        messageCount: Number(record.message_count)
      };
    });
}

export function getConversation(id: number): ConversationResult | null {
  const db = getDb();
  const conversation = db.prepare("SELECT * FROM conversations WHERE id = ?").get(id) as
    | Record<string, unknown>
    | undefined;
  if (!conversation) return null;

  const messages = db
    .prepare("SELECT role, content FROM messages WHERE conversation_id = ? ORDER BY id")
    .all(id)
    .map((row) => {
      const record = row as Record<string, unknown>;
      return {
        role: record.role === "assistant" ? "assistant" : record.role === "system" ? "system" : "user",
        content: String(record.content)
      } satisfies ChatMessage;
    });

  return {
    id: Number(conversation.id),
    agentId: String(conversation.agent_id),
    title: String(conversation.title),
    createdAt: String(conversation.created_at),
    messages
  };
}

export function createDebate(question: string, turns: DebateTurn[], conclusion: string): DebateResult {
  const db = getDb();
  const createdAt = new Date().toISOString();
  const result = db
    .prepare("INSERT INTO debates (question, conclusion, created_at) VALUES (?, ?, ?)")
    .run(question, conclusion, createdAt);
  const debateId = Number(result.lastInsertRowid);
  const insertTurn = db.prepare(`
    INSERT INTO debate_turns (debate_id, agent_id, agent_name, round, content, created_at)
    VALUES (?, ?, ?, ?, ?, ?)
  `);

  for (const turn of turns) {
    insertTurn.run(debateId, turn.agentId, turn.agentName, turn.round, turn.content, createdAt);
  }

  return { id: debateId, question, turns, conclusion, createdAt };
}

export function listDebates(limit = 30): DebateSummary[] {
  const db = getDb();
  return db
    .prepare(
      `
      SELECT
        debates.id,
        debates.question,
        debates.created_at,
        COUNT(debate_turns.id) AS turn_count
      FROM debates
      LEFT JOIN debate_turns ON debate_turns.debate_id = debates.id
      GROUP BY debates.id
      ORDER BY debates.created_at DESC
      LIMIT ?
    `
    )
    .all(limit)
    .map((row) => {
      const record = row as Record<string, unknown>;
      return {
        id: Number(record.id),
        question: String(record.question),
        createdAt: String(record.created_at),
        turnCount: Number(record.turn_count)
      };
    });
}

export function getDebate(id: number): DebateResult | null {
  const db = getDb();
  const debate = db.prepare("SELECT * FROM debates WHERE id = ?").get(id) as Record<string, unknown> | undefined;
  if (!debate) return null;

  const turns = db
    .prepare("SELECT * FROM debate_turns WHERE debate_id = ? ORDER BY id")
    .all(id)
    .map((row) => {
      const record = row as Record<string, unknown>;
      return {
        agentId: String(record.agent_id),
        agentName: String(record.agent_name),
        round: record.round === "rebuttal" ? "rebuttal" : record.round === "final" ? "final" : "opening",
        content: String(record.content)
      } satisfies DebateTurn;
    });

  return {
    id: Number(debate.id),
    question: String(debate.question),
    conclusion: String(debate.conclusion),
    createdAt: String(debate.created_at),
    turns
  };
}

export function listRecents(limit = 30): RecentItem[] {
  const discussions: RecentItem[] = listDebates(limit).map((item) => ({ ...item, kind: "discussion" as const }));
  const chats: RecentItem[] = listConversations(limit).map((item) => ({ ...item, kind: "chat" as const }));
  let answers: RecentItem[] = [];
  try {
    answers = listSuperAgentAnswers(limit).map((item) => ({
      kind: "answer" as const,
      id: item.id,
      question: item.question,
      answerType: item.answerType,
      createdAt: item.createdAt
    }));
  } catch {
    // super_agent_answers may not exist on older deployments; skip gracefully
  }
  return [...discussions, ...chats, ...answers]
    .sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime())
    .slice(0, limit);
}

export function listKnowledgeSources(agentId?: string): KnowledgeSource[] {
  const db = getDb();
  const rows = agentId
    ? db
        .prepare(
          `
          SELECT knowledge_sources.*, COUNT(knowledge_chunks.id) AS chunk_count
          FROM knowledge_sources
          LEFT JOIN knowledge_chunks ON knowledge_chunks.source_id = knowledge_sources.id
          WHERE agent_id = ?
          GROUP BY knowledge_sources.id
          ORDER BY priority ASC, title ASC
        `
        )
        .all(mapAgentId(agentId))
    : db
        .prepare(
          `
          SELECT knowledge_sources.*, COUNT(knowledge_chunks.id) AS chunk_count
          FROM knowledge_sources
          LEFT JOIN knowledge_chunks ON knowledge_chunks.source_id = knowledge_sources.id
          GROUP BY knowledge_sources.id
          ORDER BY agent_id ASC, priority ASC, title ASC
        `
        )
        .all();
  return rows.map((row) => mapKnowledgeSource(row as Record<string, unknown>));
}

export function searchKnowledgeSources(query: string, agentId?: string, limit = 6): KnowledgeSource[] {
  const terms = tokenizeQuery(query);
  const sources = listKnowledgeSources(agentId);
  if (terms.length === 0) return sources.slice(0, limit);
  const chunksBySource = groupChunksBySource(searchKnowledgeChunks(query, agentId, limit * 3));

  return sources
    .map((source) => {
      const matchedChunks = chunksBySource.get(source.id) ?? [];
      const haystack = [
        source.title,
        source.sourceType,
        source.reliability,
        source.summary,
        source.tags.join(" "),
        matchedChunks.map((chunk) => chunk.content).join(" ")
      ]
        .join(" ")
        .toLowerCase();
      const title = source.title.toLowerCase();
      const tags = source.tags.join(" ").toLowerCase();
      const score = terms.reduce((total, term) => {
        if (!haystack.includes(term)) return total;
        const titleBoost = title.includes(term) ? 4 : 0;
        const tagBoost = tags.includes(term) ? 3 : 0;
        const reliabilityBoost = source.reliability === "very_high" ? 2 : source.reliability === "high" ? 1 : 0;
        const priorityBoost = Math.max(0, 4 - source.priority);
        const chunkBoost = matchedChunks.length > 0 ? 3 : 0;
        return total + 1 + titleBoost + tagBoost + reliabilityBoost + priorityBoost + chunkBoost;
      }, 0);
      return { source: { ...source, chunks: matchedChunks.slice(0, 2) }, score };
    })
    .filter((item) => item.score > 0)
    .sort((a, b) => b.score - a.score || a.source.priority - b.source.priority || a.source.title.localeCompare(b.source.title))
    .slice(0, limit)
    .map((item) => item.source);
}

export function getKnowledgeSource(id: number): KnowledgeSource | null {
  const db = getDb();
  const row = db
    .prepare(
      `
      SELECT knowledge_sources.*, COUNT(knowledge_chunks.id) AS chunk_count
      FROM knowledge_sources
      LEFT JOIN knowledge_chunks ON knowledge_chunks.source_id = knowledge_sources.id
      WHERE knowledge_sources.id = ?
      GROUP BY knowledge_sources.id
    `
    )
    .get(id);
  return row ? mapKnowledgeSource(row as Record<string, unknown>) : null;
}

export function listKnowledgeChunks(sourceId: number): KnowledgeChunk[] {
  const db = getDb();
  return db
    .prepare(
      `
      SELECT
        knowledge_chunks.*,
        knowledge_sources.title AS source_title,
        knowledge_sources.url AS source_url,
        knowledge_sources.reliability AS source_reliability,
        knowledge_sources.priority AS source_priority
      FROM knowledge_chunks
      JOIN knowledge_sources ON knowledge_sources.id = knowledge_chunks.source_id
      WHERE source_id = ?
      ORDER BY chunk_index ASC
    `
    )
    .all(sourceId)
    .map((row) => mapKnowledgeChunk(row as Record<string, unknown>));
}

export function searchKnowledgeChunks(query: string, agentId?: string, limit = 8): KnowledgeChunk[] {
  const db = getDb();
  const terms = tokenizeQuery(query);
  if (terms.length === 0) return [];
  const rows = agentId
    ? db
        .prepare(
          `
          SELECT
            knowledge_chunks.*,
            knowledge_sources.title AS source_title,
            knowledge_sources.url AS source_url,
            knowledge_sources.reliability AS source_reliability,
            knowledge_sources.priority AS source_priority,
            knowledge_sources.tags AS source_tags,
            knowledge_sources.summary AS source_summary
          FROM knowledge_chunks
          JOIN knowledge_sources ON knowledge_sources.id = knowledge_chunks.source_id
          WHERE knowledge_sources.agent_id = ?
        `
        )
        .all(mapAgentId(agentId))
    : db
        .prepare(
          `
          SELECT
            knowledge_chunks.*,
            knowledge_sources.title AS source_title,
            knowledge_sources.url AS source_url,
            knowledge_sources.reliability AS source_reliability,
            knowledge_sources.priority AS source_priority,
            knowledge_sources.tags AS source_tags,
            knowledge_sources.summary AS source_summary
          FROM knowledge_chunks
          JOIN knowledge_sources ON knowledge_sources.id = knowledge_chunks.source_id
        `
        )
        .all();

  return rows
    .map((row) => {
      const record = row as Record<string, unknown>;
      const text = [
        record.content,
        record.source_title,
        record.source_summary,
        record.source_tags
      ]
        .join(" ")
        .toLowerCase();
      const score = terms.reduce((total, term) => {
        if (!text.includes(term)) return total;
        const titleBoost = String(record.source_title ?? "").toLowerCase().includes(term) ? 4 : 0;
        const priorityBoost = Math.max(0, 4 - Number(record.source_priority ?? 3));
        return total + 1 + titleBoost + priorityBoost;
      }, 0);
      return { chunk: mapKnowledgeChunk(record), score };
    })
    .filter((item) => item.score > 0)
    .sort(
      (a, b) =>
        b.score - a.score ||
        a.chunk.sourcePriority - b.chunk.sourcePriority ||
        a.chunk.sourceTitle.localeCompare(b.chunk.sourceTitle) ||
        a.chunk.chunkIndex - b.chunk.chunkIndex
    )
    .slice(0, limit)
    .map((item) => item.chunk);
}

function groupChunksBySource(chunks: KnowledgeChunk[]) {
  const grouped = new Map<number, KnowledgeChunk[]>();
  for (const chunk of chunks) {
    const current = grouped.get(chunk.sourceId) ?? [];
    current.push(chunk);
    grouped.set(chunk.sourceId, current);
  }
  return grouped;
}

export function replaceKnowledgeSourceChunks(sourceId: number, content: string): KnowledgeSource {
  const db = getDb();
  const source = getKnowledgeSource(sourceId);
  if (!source) throw new Error("Knowledge Source를 찾을 수 없습니다.");

  const chunks = chunkKnowledgeText(content);
  const now = new Date().toISOString();
  db.prepare("DELETE FROM knowledge_chunks WHERE source_id = ?").run(sourceId);

  if (chunks.length === 0) {
    db.prepare(
      "UPDATE knowledge_sources SET content_status = ?, content_error = ?, last_ingested_at = ?, updated_at = ? WHERE id = ?"
    ).run("failed", "추출 가능한 텍스트가 없습니다.", now, now, sourceId);
    const updated = getKnowledgeSource(sourceId);
    if (!updated) throw new Error("Knowledge Source를 갱신하지 못했습니다.");
    return updated;
  }

  const insert = db.prepare(
    "INSERT INTO knowledge_chunks (source_id, chunk_index, content, created_at, updated_at) VALUES (?, ?, ?, ?, ?)"
  );
  chunks.forEach((chunk, index) => insert.run(sourceId, index, chunk, now, now));
  db.prepare(
    "UPDATE knowledge_sources SET content_status = ?, content_error = '', last_ingested_at = ?, updated_at = ? WHERE id = ?"
  ).run("indexed", now, now, sourceId);

  const updated = getKnowledgeSource(sourceId);
  if (!updated) throw new Error("Knowledge Source를 갱신하지 못했습니다.");
  return updated;
}

export function markKnowledgeSourceIngestFailed(sourceId: number, error: string): KnowledgeSource {
  const db = getDb();
  const now = new Date().toISOString();
  db.prepare(
    "UPDATE knowledge_sources SET content_status = ?, content_error = ?, last_ingested_at = ?, updated_at = ? WHERE id = ?"
  ).run("failed", error, now, now, sourceId);
  const updated = getKnowledgeSource(sourceId);
  if (!updated) throw new Error("Knowledge Source를 갱신하지 못했습니다.");
  return updated;
}

function chunkKnowledgeText(content: string) {
  const normalized = content
    .replace(/\r\n/g, "\n")
    .replace(/[ \t]+/g, " ")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
  if (!normalized) return [];

  const paragraphs = normalized.split(/\n{2,}/).map((paragraph) => paragraph.trim()).filter(Boolean);
  const chunks: string[] = [];
  let current = "";
  const maxLength = 1400;
  const overlapLength = 180;

  for (const paragraph of paragraphs) {
    if (paragraph.length > maxLength) {
      if (current) {
        chunks.push(current.trim());
        current = "";
      }
      for (let start = 0; start < paragraph.length; start += maxLength - overlapLength) {
        chunks.push(paragraph.slice(start, start + maxLength).trim());
      }
      continue;
    }

    if ((current + "\n\n" + paragraph).trim().length > maxLength) {
      chunks.push(current.trim());
      const overlap = current.slice(-overlapLength).trim();
      current = overlap ? `${overlap}\n\n${paragraph}` : paragraph;
    } else {
      current = current ? `${current}\n\n${paragraph}` : paragraph;
    }
  }

  if (current.trim()) chunks.push(current.trim());
  return chunks.filter((chunk) => chunk.length >= 80).slice(0, 80);
}

function tokenizeQuery(query: string) {
  const normalized = query.toLowerCase().replace(/[^\p{L}\p{N}\s-]/gu, " ");
  const rawTerms = normalized.split(/\s+/).filter(Boolean);
  const expanded = rawTerms.flatMap((term) => {
    const parts = [term];
    if (term.includes("-")) parts.push(...term.split("-"));
    return parts;
  });
  return [...new Set(expanded.filter((term) => term.length >= 2))].slice(0, 24);
}

export function createKnowledgeSource(
  input: Pick<
    KnowledgeSource,
    "agentId" | "title" | "url" | "sourceType" | "reliability" | "priority" | "summary" | "tags"
  >
): KnowledgeSource {
  const db = getDb();
  const now = new Date().toISOString();
  const result = db
    .prepare(
      `
      INSERT INTO knowledge_sources (
        agent_id, title, url, source_type, reliability, priority, summary, tags, created_at, updated_at
      )
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      ON CONFLICT(agent_id, url) DO UPDATE SET
        title = excluded.title,
        source_type = excluded.source_type,
        reliability = excluded.reliability,
        priority = excluded.priority,
        summary = excluded.summary,
        tags = excluded.tags,
        updated_at = excluded.updated_at
    `
    )
    .run(
      mapAgentId(input.agentId),
      input.title,
      input.url,
      input.sourceType,
      input.reliability,
      input.priority,
      input.summary,
      JSON.stringify(input.tags),
      now,
      now
    );
  const id =
    Number(result.lastInsertRowid) ||
    Number(
      (db
        .prepare("SELECT id FROM knowledge_sources WHERE agent_id = ? AND url = ?")
        .get(mapAgentId(input.agentId), input.url) as { id: number }).id
    );
  const source = db.prepare("SELECT * FROM knowledge_sources WHERE id = ?").get(id);
  return mapKnowledgeSource(source as Record<string, unknown>);
}

export function deleteKnowledgeSource(id: number): void {
  const db = getDb();
  db.prepare("DELETE FROM knowledge_chunks WHERE source_id = ?").run(id);
  db.prepare("DELETE FROM knowledge_sources WHERE id = ?").run(id);
}

export function updateKnowledgeSourceMeta(
  id: number,
  data: Partial<Pick<KnowledgeSource, "title" | "summary" | "reliability" | "priority" | "sourceType" | "tags" | "domainId">>
): KnowledgeSource {
  const db = getDb();
  const now = new Date().toISOString();
  const fields: string[] = [];
  const values: unknown[] = [];
  if (data.title !== undefined) { fields.push("title = ?"); values.push(data.title); }
  if (data.summary !== undefined) { fields.push("summary = ?"); values.push(data.summary); }
  if (data.reliability !== undefined) { fields.push("reliability = ?"); values.push(data.reliability); }
  if (data.priority !== undefined) { fields.push("priority = ?"); values.push(data.priority); }
  if (data.sourceType !== undefined) { fields.push("source_type = ?"); values.push(data.sourceType); }
  if (data.tags !== undefined) { fields.push("tags = ?"); values.push(JSON.stringify(data.tags)); }
  if (data.domainId !== undefined) { fields.push("domain_id = ?"); values.push(data.domainId); }
  if (fields.length === 0) { const src = getKnowledgeSource(id); if (!src) throw new Error("Not found"); return src; }
  fields.push("updated_at = ?");
  values.push(now, id);
  db.prepare(`UPDATE knowledge_sources SET ${fields.join(", ")} WHERE id = ?`).run(...(values as Parameters<ReturnType<typeof db.prepare>["run"]>));
  const updated = getKnowledgeSource(id);
  if (!updated) throw new Error("Knowledge Source를 찾을 수 없습니다.");
  return updated;
}

// ── Debate Insights ──────────────────────────────────────────────────────────

function mapDebateInsight(row: Record<string, unknown>): DebateInsight {
  let tags: string[] = [];
  try {
    const parsed = JSON.parse(String(row.tags ?? "[]")) as unknown;
    if (Array.isArray(parsed)) tags = parsed.map(String);
  } catch { tags = []; }
  const confidence = String(row.confidence ?? "medium");
  const evidenceLevel = String(row.evidence_level ?? "medium");
  const status = String(row.status ?? "draft");
  return {
    id: String(row.id),
    debateId: String(row.debate_id),
    domainId: row.domain_id ? String(row.domain_id) : undefined,
    insightType: String(row.insight_type) as DebateInsight["insightType"],
    agentId: row.agent_id ? String(row.agent_id) : undefined,
    title: String(row.title),
    content: String(row.content),
    confidence: confidence === "high" || confidence === "low" ? confidence : "medium",
    evidenceLevel: evidenceLevel === "high" || evidenceLevel === "low" ? evidenceLevel : "medium",
    tags,
    status: status === "approved" || status === "deprecated" || status === "rejected" ? status : "draft",
    validUntil: row.valid_until ? String(row.valid_until) : undefined,
    reviewedAt: row.reviewed_at ? String(row.reviewed_at) : undefined,
    createdAt: String(row.created_at),
    updatedAt: String(row.updated_at)
  };
}

export function createDebateInsights(items: NewDebateInsight[]): DebateInsight[] {
  const db = getDb();
  const now = new Date().toISOString();
  const insert = db.prepare(`
    INSERT INTO debate_insights (
      id, debate_id, domain_id, insight_type, agent_id, title, content,
      confidence, evidence_level, tags, status, valid_until, reviewed_at, created_at, updated_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `);
  const ids: string[] = [];
  for (const item of items) {
    const id = randomUUID();
    insert.run(
      id, item.debateId, item.domainId ?? null, item.insightType, item.agentId ?? null,
      item.title, item.content, item.confidence, item.evidenceLevel,
      JSON.stringify(item.tags), item.status,
      item.validUntil ?? null, item.reviewedAt ?? null, now, now
    );
    ids.push(id);
  }
  return ids.map((id) => mapDebateInsight(db.prepare("SELECT * FROM debate_insights WHERE id = ?").get(id) as Record<string, unknown>));
}

export function listDebateInsights(params: {
  debateId?: string;
  domainId?: string;
  query?: string;
  status?: string;
  limit?: number;
} = {}): DebateInsight[] {
  const db = getDb();
  const rows = db.prepare("SELECT * FROM debate_insights ORDER BY created_at DESC").all() as Record<string, unknown>[];
  const insights = rows.map(mapDebateInsight);

  const terms = params.query ? tokenizeQuery(params.query) : [];
  return insights
    .filter((item) => {
      if (params.debateId && item.debateId !== params.debateId) return false;
      if (params.domainId && item.domainId !== params.domainId) return false;
      if (params.status && item.status !== params.status) return false;
      if (terms.length === 0) return true;
      const haystack = [item.title, item.content, item.tags.join(" ")].join(" ").toLowerCase();
      return terms.some((term) => haystack.includes(term));
    })
    .map((item) => {
      if (terms.length === 0) return { item, score: 0 };
      const title = item.title.toLowerCase();
      const tags = item.tags.join(" ").toLowerCase();
      const content = item.content.toLowerCase();
      const score = terms.reduce((total, term) => {
        if (!([title, tags, content].join(" ")).includes(term)) return total;
        const titleBoost = title.includes(term) ? 4 : 0;
        const tagBoost = tags.includes(term) ? 3 : 0;
        const contentBoost = content.includes(term) ? 1 : 0;
        const statusBoost = item.status === "approved" ? 5 : item.status === "draft" ? 1 : 0;
        const confidenceBoost = item.confidence === "high" ? 3 : 0;
        const evidenceBoost = item.evidenceLevel === "high" ? 3 : 0;
        return total + titleBoost + tagBoost + contentBoost + statusBoost + confidenceBoost + evidenceBoost;
      }, 0);
      return { item, score };
    })
    .sort((a, b) => b.score - a.score)
    .map(({ item }) => item)
    .slice(0, params.limit ?? 50);
}

export function updateDebateInsightStatus(id: string, status: DebateInsightStatus): DebateInsight {
  const db = getDb();
  const now = new Date().toISOString();
  db.prepare("UPDATE debate_insights SET status = ?, reviewed_at = ?, updated_at = ? WHERE id = ?")
    .run(status, now, now, id);
  const row = db.prepare("SELECT * FROM debate_insights WHERE id = ?").get(id);
  if (!row) throw new Error("Debate Insight를 찾을 수 없습니다.");
  return mapDebateInsight(row as Record<string, unknown>);
}

// ── Agent Opinions ───────────────────────────────────────────────────────────

function mapAgentOpinion(row: Record<string, unknown>): AgentOpinion {
  let tags: string[] = [];
  let evidenceRefs: string[] = [];
  let scoreJson: Record<string, unknown> | undefined;
  try { const p = JSON.parse(String(row.tags ?? "[]")) as unknown; if (Array.isArray(p)) tags = p.map(String); } catch { tags = []; }
  try { const p = JSON.parse(String(row.evidence_refs ?? "[]")) as unknown; if (Array.isArray(p)) evidenceRefs = p.map(String); } catch { evidenceRefs = []; }
  try { if (row.score_json) scoreJson = JSON.parse(String(row.score_json)) as Record<string, unknown>; } catch { scoreJson = undefined; }
  const confidence = String(row.confidence ?? "medium");
  const status = String(row.status ?? "draft");
  return {
    id: String(row.id),
    conversationId: row.conversation_id ? String(row.conversation_id) : undefined,
    messageId: row.message_id ? String(row.message_id) : undefined,
    agentId: String(row.agent_id),
    domainId: row.domain_id ? String(row.domain_id) : undefined,
    question: String(row.question),
    claim: String(row.claim),
    rationale: row.rationale ? String(row.rationale) : undefined,
    evidenceRefs,
    confidence: confidence === "high" || confidence === "low" ? confidence : "medium",
    scoreJson,
    tags,
    status: status === "approved" || status === "deprecated" || status === "rejected" ? status : "draft",
    createdAt: String(row.created_at),
    updatedAt: String(row.updated_at)
  };
}

export function createAgentOpinion(input: NewAgentOpinion): AgentOpinion {
  const db = getDb();
  const now = new Date().toISOString();
  const id = randomUUID();
  db.prepare(`
    INSERT INTO agent_opinions (
      id, conversation_id, message_id, agent_id, domain_id, question, claim,
      rationale, evidence_refs, confidence, score_json, tags, status, created_at, updated_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `).run(
    id, input.conversationId ?? null, input.messageId ?? null, input.agentId,
    input.domainId ?? null, input.question, input.claim,
    input.rationale ?? null, JSON.stringify(input.evidenceRefs),
    input.confidence, input.scoreJson ? JSON.stringify(input.scoreJson) : null,
    JSON.stringify(input.tags), input.status, now, now
  );
  const row = db.prepare("SELECT * FROM agent_opinions WHERE id = ?").get(id);
  return mapAgentOpinion(row as Record<string, unknown>);
}

export function listAgentOpinions(params: {
  agentId?: string;
  domainId?: string;
  query?: string;
  status?: string;
  limit?: number;
} = {}): AgentOpinion[] {
  const db = getDb();
  const rows = db.prepare("SELECT * FROM agent_opinions ORDER BY created_at DESC").all() as Record<string, unknown>[];
  const opinions = rows.map(mapAgentOpinion);
  const terms = params.query ? tokenizeQuery(params.query) : [];

  return opinions
    .filter((item) => {
      if (params.agentId && item.agentId !== params.agentId) return false;
      if (params.domainId && item.domainId !== params.domainId) return false;
      if (params.status && item.status !== params.status) return false;
      if (terms.length === 0) return true;
      const haystack = [item.claim, item.rationale ?? "", item.tags.join(" ")].join(" ").toLowerCase();
      return terms.some((term) => haystack.includes(term));
    })
    .map((item) => {
      if (terms.length === 0) return { item, score: 0 };
      const claim = item.claim.toLowerCase();
      const rationale = (item.rationale ?? "").toLowerCase();
      const tags = item.tags.join(" ").toLowerCase();
      const score = terms.reduce((total, term) => {
        const claimBoost = claim.includes(term) ? 4 : 0;
        const rationaleBoost = rationale.includes(term) ? 2 : 0;
        const tagBoost = tags.includes(term) ? 3 : 0;
        const agentBoost = params.agentId && item.agentId === params.agentId ? 2 : 0;
        const confidenceBoost = item.confidence === "high" ? 3 : 0;
        return total + claimBoost + rationaleBoost + tagBoost + agentBoost + confidenceBoost;
      }, 0);
      return { item, score };
    })
    .sort((a, b) => b.score - a.score)
    .map(({ item }) => item)
    .slice(0, params.limit ?? 50);
}

// ── Super Agent Answers ──────────────────────────────────────────────────────

function parseJsonArray(raw: unknown): string[] {
  try {
    const parsed = JSON.parse(String(raw ?? "[]")) as unknown;
    return Array.isArray(parsed) ? parsed.map(String) : [];
  } catch { return []; }
}

function mapSuperAgentAnswer(row: Record<string, unknown>): SuperAgentAnswer {
  return {
    id: String(row.id),
    question: String(row.question),
    domainId: row.domain_id ? String(row.domain_id) : undefined,
    answerMarkdown: String(row.answer_markdown),
    referencedArchiveIds: parseJsonArray(row.referenced_archive_ids),
    referencedEvidenceIds: parseJsonArray(row.referenced_evidence_ids),
    referencedDebateIds: parseJsonArray(row.referenced_debate_ids),
    referencedInsightIds: parseJsonArray(row.referenced_insight_ids),
    referencedOpinionIds: parseJsonArray(row.referenced_opinion_ids),
    answerType: String(row.answer_type ?? "future_life_answer"),
    createdAt: String(row.created_at),
    updatedAt: String(row.updated_at)
  };
}

export function createSuperAgentAnswer(input: NewSuperAgentAnswer): SuperAgentAnswer {
  const db = getDb();
  const now = new Date().toISOString();
  const id = randomUUID();
  db.prepare(`
    INSERT INTO super_agent_answers (
      id, question, domain_id, answer_markdown,
      referenced_archive_ids, referenced_evidence_ids, referenced_debate_ids,
      referenced_insight_ids, referenced_opinion_ids, answer_type, created_at, updated_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `).run(
    id, input.question, input.domainId ?? null, input.answerMarkdown,
    JSON.stringify(input.referencedArchiveIds),
    JSON.stringify(input.referencedEvidenceIds),
    JSON.stringify(input.referencedDebateIds),
    JSON.stringify(input.referencedInsightIds),
    JSON.stringify(input.referencedOpinionIds),
    input.answerType, now, now
  );
  const row = db.prepare("SELECT * FROM super_agent_answers WHERE id = ?").get(id);
  return mapSuperAgentAnswer(row as Record<string, unknown>);
}

export function getSuperAgentAnswer(id: string): SuperAgentAnswer | null {
  const db = getDb();
  const row = db.prepare("SELECT * FROM super_agent_answers WHERE id = ?").get(id);
  return row ? mapSuperAgentAnswer(row as Record<string, unknown>) : null;
}

export function listSuperAgentAnswers(limit = 30): SuperAgentAnswer[] {
  const db = getDb();
  return (db.prepare("SELECT * FROM super_agent_answers ORDER BY created_at DESC LIMIT ?").all(limit) as Record<string, unknown>[])
    .map(mapSuperAgentAnswer);
}

// ── Domain Categories ────────────────────────────────────────────────────────

type MigrationData = {
  categories: Record<string, { name: string; sub: string; type: string; insight: string }>;
  cases: Array<{
    id: string;
    category: string;
    company: string;
    title: string;
    description: string;
    body: string;
    metrics: Array<{ value: string; label: string; trend: string }>;
    tags: string[];
    source: string;
    url: string;
    kpi_value: string;
  }>;
};

function resolveAgentIdForCategory(categoryType: string): string {
  if (categoryType === "living_space") return "tech";
  if (categoryType === "consumption") return "business";
  return "customer";
}

function resolveReliability(source: string): KnowledgeSource["reliability"] {
  const s = source.toLowerCase();
  const veryHigh = ["mckinsey", "deloitte", "bain", "gallup", "oecd", "microsoft", "google", "zuora"];
  const high = ["grand view", "reuters", "the verge", "techradar", "mdpi", "kaist", "unesco", "scientific", "nature", "asia economy", "lg "];
  if (veryHigh.some((k) => s.includes(k))) return "very_high";
  if (high.some((k) => s.includes(k))) return "high";
  return "medium";
}

function resolveSourceType(source: string): string {
  const s = source.toLowerCase();
  if (["mckinsey", "deloitte", "bain", "zuora", "grand view"].some((k) => s.includes(k))) return "industry_report";
  if (["oecd", "unesco", "kaist", "mdpi", "scientific", "nature", "gallup", "behavioral"].some((k) => s.includes(k))) return "research";
  if (["reuters", "verge", "techradar", "sun", "asia economy", "techradar"].some((k) => s.includes(k))) return "news";
  return "external_source";
}

function resolvePriority(kpiValue: string): number {
  if (!kpiValue || kpiValue === "N/A") return 3;
  if (/^\d|^\$|^£|^€/.test(kpiValue)) return 1;
  return 2;
}

function buildSummary(description: string, body: string, metrics: Array<{ value: string; label: string }>): string {
  const keyMetrics = metrics
    .filter((m) => m.value && m.value !== "N/A")
    .slice(0, 3)
    .map((m) => `${m.value}: ${m.label}`)
    .join(" / ");
  const parts = [description, keyMetrics ? `[Key metrics] ${keyMetrics}` : null, body].filter(Boolean);
  return parts.join("\n\n").slice(0, 1200);
}

function seedMigrationData(db: DatabaseSync) {
  const migrationPath = join(process.cwd(), "data", "migraion_data.json");
  if (!existsSync(migrationPath)) return;

  const raw = readFileSync(migrationPath, "utf8");
  const data = JSON.parse(raw) as MigrationData;
  const now = new Date().toISOString();

  // Seed domain_categories
  const insertCategory = db.prepare(`
    INSERT OR IGNORE INTO domain_categories (id, name, sub, type, insight, created_at)
    VALUES (?, ?, ?, ?, ?, ?)
  `);
  for (const [id, cat] of Object.entries(data.categories)) {
    insertCategory.run(id, cat.name, cat.sub, cat.type, cat.insight, now);
  }

  // Seed cases as knowledge_sources
  const insertSource = db.prepare(`
    INSERT OR IGNORE INTO knowledge_sources (
      agent_id, title, url, source_type, reliability, priority,
      summary, tags, domain_id, created_at, updated_at
    )
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `);

  for (const c of data.cases) {
    const catEntry = data.categories[c.category];
    if (!catEntry) continue;
    const agentId = resolveAgentIdForCategory(catEntry.type);
    const summary = buildSummary(c.description, c.body, c.metrics);
    const reliability = resolveReliability(c.source);
    const sourceType = resolveSourceType(c.source);
    const priority = resolvePriority(c.kpi_value);
    insertSource.run(
      agentId,
      c.title,
      c.url,
      sourceType,
      reliability,
      priority,
      summary,
      JSON.stringify(c.tags),
      c.category,
      now,
      now
    );
  }
}

export function listDomainCategories(): DomainCategory[] {
  const db = getDb();
  return (db.prepare("SELECT * FROM domain_categories ORDER BY id").all() as Record<string, unknown>[]).map((row) => ({
    id: String(row.id),
    name: String(row.name),
    sub: String(row.sub ?? ""),
    type: String(row.type ?? ""),
    insight: String(row.insight ?? ""),
    createdAt: String(row.created_at)
  }));
}

export function getDomainCategory(id: string): DomainCategory | null {
  const db = getDb();
  const row = db.prepare("SELECT * FROM domain_categories WHERE id = ?").get(id);
  if (!row) return null;
  const r = row as Record<string, unknown>;
  return {
    id: String(r.id),
    name: String(r.name),
    sub: String(r.sub ?? ""),
    type: String(r.type ?? ""),
    insight: String(r.insight ?? ""),
    createdAt: String(r.created_at)
  };
}
