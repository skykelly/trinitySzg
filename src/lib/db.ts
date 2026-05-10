import { mkdirSync } from "node:fs";
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
  `);

  ensureColumn(db, "agents", "persona_type", "TEXT NOT NULL DEFAULT ''");
  ensureColumn(db, "agents", "description", "TEXT NOT NULL DEFAULT ''");
  ensureColumn(db, "agents", "tone", "TEXT NOT NULL DEFAULT ''");
  ensureColumn(db, "agents", "debate_style", "TEXT NOT NULL DEFAULT ''");
  ensureColumn(db, "agents", "judgment_criteria", "TEXT NOT NULL DEFAULT ''");
  ensureColumn(db, "agents", "debate_behavior", "TEXT NOT NULL DEFAULT ''");

  const count = db.prepare("SELECT COUNT(*) AS count FROM agents").get() as { count: number };
  if (count.count === 0) {
    const insert = db.prepare(`
      INSERT INTO agents (
        id, name, role, persona_type, description, tone, debate_style,
        provider, model, temperature, system_prompt, knowledge, judgment_criteria, debate_behavior, updated_at
      )
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
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
        agent.updatedAt
      );
    }
  } else {
    seedMissingAgentFields(db);
  }

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
      debate_behavior = CASE WHEN debate_behavior = '' THEN ? ELSE debate_behavior END
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
    updatedAt: String(row.updated_at)
  };
}

export function getAgents(): Agent[] {
  const db = getDb();
  return db.prepare("SELECT * FROM agents ORDER BY rowid").all().map((row) => mapAgent(row as Record<string, unknown>));
}

export function getAgent(id: string): Agent | null {
  const db = getDb();
  const row = db.prepare("SELECT * FROM agents WHERE id = ?").get(id);
  return row ? mapAgent(row as Record<string, unknown>) : null;
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
