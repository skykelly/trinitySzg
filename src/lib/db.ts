import { existsSync, mkdirSync, readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { DatabaseSync } from "node:sqlite";
import { defaultAgents } from "./default-agents";
import type {
  Agent,
  ChatMessage,
  ConversationResult,
  ConversationSummary,
  DebateResult,
  DebateSummary,
  DebateTurn,
  KnowledgeChunk,
  KnowledgeSource,
  RecentItem
} from "./types";

const dbPath = join(process.cwd(), "data", "app.db");
mkdirSync(dirname(dbPath), { recursive: true });

let database: DatabaseSync | null = null;

function getDb() {
  if (database) return database;

  const db = new DatabaseSync(dbPath);
  db.exec("PRAGMA busy_timeout = 5000;");
  db.exec(`
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
      temperature REAL NOT NULL,
      system_prompt TEXT NOT NULL,
      knowledge TEXT NOT NULL,
      judgment_criteria TEXT NOT NULL DEFAULT '',
      debate_behavior TEXT NOT NULL DEFAULT '',
      response_template TEXT NOT NULL DEFAULT '',
      challenge_rules TEXT NOT NULL DEFAULT '',
      evidence_rules TEXT NOT NULL DEFAULT '',
      scorecard TEXT NOT NULL DEFAULT '',
      updated_at TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS conversations (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      agent_id TEXT NOT NULL,
      title TEXT NOT NULL,
      created_at TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS messages (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      conversation_id INTEGER NOT NULL,
      role TEXT NOT NULL,
      content TEXT NOT NULL,
      created_at TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS debates (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      question TEXT NOT NULL,
      conclusion TEXT NOT NULL,
      created_at TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS debate_turns (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      debate_id INTEGER NOT NULL,
      agent_id TEXT NOT NULL,
      agent_name TEXT NOT NULL,
      round TEXT NOT NULL,
      content TEXT NOT NULL,
      created_at TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS knowledge_sources (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
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
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL,
      UNIQUE(agent_id, url)
    );

    CREATE TABLE IF NOT EXISTS knowledge_chunks (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      source_id INTEGER NOT NULL,
      chunk_index INTEGER NOT NULL,
      content TEXT NOT NULL,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL,
      UNIQUE(source_id, chunk_index)
    );
  `);

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
  }

  seedKnowledgeSources(db);

  database = db;
  return database;
}

function ensureColumn(db: DatabaseSync, table: string, column: string, definition: string) {
  const columns = db.prepare(`PRAGMA table_info(${table})`).all() as Array<Record<string, unknown>>;
  if (columns.some((item) => item.name === column)) return;
  db.exec(`ALTER TABLE ${table} ADD COLUMN ${column} ${definition}`);
}

function seedMissingAgentFields(db: DatabaseSync) {
  const update = db.prepare(`
    UPDATE agents
    SET
      name = ?,
      role = ?,
      persona_type = CASE WHEN persona_type = '' THEN ? ELSE persona_type END,
      description = CASE WHEN description = '' THEN ? ELSE description END,
      tone = CASE WHEN tone = '' THEN ? ELSE tone END,
      debate_style = CASE WHEN debate_style = '' THEN ? ELSE debate_style END,
      system_prompt = CASE
        WHEN system_prompt = '' OR system_prompt LIKE '당신은 % AI입니다.%' THEN ?
        ELSE system_prompt
      END,
      knowledge = CASE
        WHEN knowledge = '' OR knowledge LIKE '서비스는 3개의 AI 페르소나%' OR knowledge LIKE '서비스의 핵심 사용자%' OR knowledge LIKE '초기 목표는 과도한 기능%'
        THEN ?
        ELSE knowledge
      END,
      judgment_criteria = CASE WHEN judgment_criteria = '' THEN ? ELSE judgment_criteria END,
      debate_behavior = CASE WHEN debate_behavior = '' THEN ? ELSE debate_behavior END,
      response_template = CASE WHEN response_template = '' THEN ? ELSE response_template END,
      challenge_rules = CASE WHEN challenge_rules = '' THEN ? ELSE challenge_rules END,
      evidence_rules = CASE WHEN evidence_rules = '' THEN ? ELSE evidence_rules END,
      scorecard = CASE WHEN scorecard = '' THEN ? ELSE scorecard END
    WHERE id = ?
  `);

  for (const agent of defaultAgents) {
    update.run(
      agent.name,
      agent.role,
      agent.personaType,
      agent.description,
      agent.tone,
      agent.debateStyle,
      agent.systemPrompt,
      agent.knowledge,
      agent.judgmentCriteria,
      agent.debateBehavior,
      agent.responseTemplate,
      agent.challengeRules,
      agent.evidenceRules,
      agent.scorecard,
      agent.id
    );
  }
}

function mapAgent(row: Record<string, unknown>): Agent {
  return {
    id: String(row.id),
    name: String(row.name),
    role: String(row.role),
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
  const discussions: RecentItem[] = listDebates(limit).map((item) => ({ ...item, kind: "discussion" }));
  const chats: RecentItem[] = listConversations(limit).map((item) => ({ ...item, kind: "chat" }));
  return [...discussions, ...chats]
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
