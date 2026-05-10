export type Provider = "gemini" | "github";

export type Agent = {
  id: string;
  name: string;
  role: string;
  personaType: string;
  description: string;
  tone: string;
  debateStyle: string;
  provider: Provider;
  model: string;
  temperature: number;
  systemPrompt: string;
  knowledge: string;
  judgmentCriteria: string;
  debateBehavior: string;
  responseTemplate: string;
  challengeRules: string;
  evidenceRules: string;
  scorecard: string;
  knowledgeSources?: KnowledgeSource[];
  knowledgeChunks?: KnowledgeChunk[];
  updatedAt: string;
};

export type KnowledgeSource = {
  id: number;
  agentId: string;
  title: string;
  url: string;
  sourceType: string;
  reliability: "low" | "medium" | "high" | "very_high";
  priority: number;
  summary: string;
  tags: string[];
  contentStatus: "summary_only" | "indexed" | "failed";
  contentError: string;
  lastIngestedAt: string;
  chunkCount: number;
  chunks?: KnowledgeChunk[];
  createdAt: string;
  updatedAt: string;
};

export type KnowledgeChunk = {
  id: number;
  sourceId: number;
  sourceTitle: string;
  sourceUrl: string;
  sourceReliability: KnowledgeSource["reliability"];
  sourcePriority: number;
  chunkIndex: number;
  content: string;
  createdAt: string;
  updatedAt: string;
};

export type ChatMessage = {
  role: "user" | "assistant" | "system";
  content: string;
};

export type DebateTurn = {
  agentId: string;
  agentName: string;
  round: "opening" | "rebuttal" | "final";
  content: string;
};

export type DebateResult = {
  id: number;
  question: string;
  turns: DebateTurn[];
  conclusion: string;
  createdAt: string;
};

export type DebateSummary = {
  id: number;
  question: string;
  createdAt: string;
  turnCount: number;
};

export type ConversationSummary = {
  id: number;
  agentId: string;
  agentName: string;
  title: string;
  createdAt: string;
  messageCount: number;
};

export type ConversationResult = {
  id: number;
  agentId: string;
  title: string;
  messages: ChatMessage[];
  createdAt: string;
};

export type RecentItem =
  | ({ kind: "discussion" } & DebateSummary)
  | ({ kind: "chat" } & ConversationSummary);
