export type Provider = "gemini" | "github";

export interface DomainCategory {
  id: string;
  name: string;
  sub: string;
  type: string;
  insight: string;
  createdAt: string;
}

export type AgentType = "specialist_agent" | "super_agent" | "moderator_agent";

export type DebateInsightStatus = "draft" | "approved" | "deprecated" | "rejected";

export type DebateInsightType =
  | "tech_feasibility"
  | "customer_behavior"
  | "business_opportunity"
  | "risk"
  | "counterargument"
  | "consensus"
  | "disagreement"
  | "scenario_seed"
  | "kpi"
  | "assumption";

export type Agent = {
  id: string;
  name: string;
  role: string;
  agentType: AgentType;
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
  externalSourceId?: string;
  externalProjectId?: string;
  domainId?: string;
  contentHash?: string;
  lastSyncedAt?: string;
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

export type SuperAgentAnswerSummary = {
  id: string;
  question: string;
  answerType: string;
  createdAt: string;
};

export type RecentItem =
  | ({ kind: "discussion" } & DebateSummary)
  | ({ kind: "chat" } & ConversationSummary)
  | ({ kind: "answer" } & SuperAgentAnswerSummary);

export interface DebateInsight {
  id: string;
  debateId: string;
  domainId?: string;
  insightType: DebateInsightType;
  agentId?: string;
  title: string;
  content: string;
  confidence: "high" | "medium" | "low";
  evidenceLevel: "high" | "medium" | "low";
  tags: string[];
  status: DebateInsightStatus;
  validUntil?: string;
  reviewedAt?: string;
  createdAt: string;
  updatedAt: string;
}

export type NewDebateInsight = Omit<DebateInsight, "id" | "createdAt" | "updatedAt">;

export interface AgentOpinion {
  id: string;
  conversationId?: string;
  messageId?: string;
  agentId: string;
  domainId?: string;
  question: string;
  claim: string;
  rationale?: string;
  evidenceRefs: string[];
  confidence: "high" | "medium" | "low";
  scoreJson?: Record<string, unknown>;
  tags: string[];
  status: DebateInsightStatus;
  createdAt: string;
  updatedAt: string;
}

export type NewAgentOpinion = Omit<AgentOpinion, "id" | "createdAt" | "updatedAt">;

export interface SuperAgentAnswer {
  id: string;
  question: string;
  domainId?: string;
  answerMarkdown: string;
  referencedArchiveIds: string[];
  referencedEvidenceIds: string[];
  referencedDebateIds: string[];
  referencedInsightIds: string[];
  referencedOpinionIds: string[];
  answerType: string;
  createdAt: string;
  updatedAt: string;
}

export type NewSuperAgentAnswer = Omit<SuperAgentAnswer, "id" | "createdAt" | "updatedAt">;
