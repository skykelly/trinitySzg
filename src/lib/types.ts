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
