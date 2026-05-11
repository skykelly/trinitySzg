import { createSuperAgentAnswer, getAgent, getSuperAgentAnswer, listAgentOpinions, listSuperAgentAnswers, searchKnowledgeSources } from "./db";
import { searchDebateInsights } from "./debate-knowledge";
import { generateText } from "./llm";
import type { AgentOpinion, DebateInsight, KnowledgeSource } from "./types";

export interface SuperAgentAnswerRequest {
  question: string;
  domainId?: string;
  timeHorizon?: "1y" | "3y" | "5y" | "10y";
  customerSegment?: string;
  outputType?: "future_life_answer" | "scenario" | "business_opportunity" | "executive_brief";
  includeDebateKnowledge?: boolean;
  includeAgentOpinions?: boolean;
  selectedSourceIds?: number[];
  context?: Record<string, unknown>;
}

export interface SuperAgentAnswerResponse {
  answerId: string;
  answerMarkdown: string;
  references: {
    knowledgeSources: Array<{ id: string; title: string; url: string }>;
    debateInsights: Array<{ id: string; title: string; insightType: string }>;
    agentOpinions: Array<{ id: string; claim: string; agentId: string }>;
  };
}

export function buildSuperAgentPrompt(params: {
  input: SuperAgentAnswerRequest;
  sources: KnowledgeSource[];
  insights: DebateInsight[];
  opinions: AgentOpinion[];
}): string {
  const { input, sources, insights, opinions } = params;

  const contextBlock = [
    input.domainId ? `- domainId: ${input.domainId}` : null,
    input.timeHorizon ? `- timeHorizon: ${input.timeHorizon}` : null,
    input.customerSegment ? `- customerSegment: ${input.customerSegment}` : null,
    input.outputType ? `- outputType: ${input.outputType}` : null
  ]
    .filter(Boolean)
    .join("\n");

  const sourcesBlock =
    sources.length > 0
      ? sources
          .map((source, i) => {
            const chunks =
              source.chunks && source.chunks.length > 0
                ? `\n  Relevant chunks:\n${source.chunks
                    .map((chunk) => `  - ${chunk.content.slice(0, 600)}`)
                    .join("\n")}`
                : "";
            return `Source ${i + 1}:\n  title: ${source.title}\n  url: ${source.url}\n  reliability: ${source.reliability}\n  summary: ${source.summary}${chunks}`;
          })
          .join("\n\n")
      : "No archive sources available for this question.";

  const insightsBlock =
    insights.length > 0
      ? insights
          .map((insight, i) => {
            const statusNote = insight.status === "draft" ? " [미검수 인사이트]" : "";
            return `Insight ${i + 1}${statusNote}:\n  type: ${insight.insightType}\n  title: ${insight.title}\n  content: ${insight.content}\n  confidence: ${insight.confidence}\n  evidenceLevel: ${insight.evidenceLevel}`;
          })
          .join("\n\n")
      : "No prior debate insights available.";

  const opinionsBlock =
    opinions.length > 0
      ? opinions
          .map((opinion, i) => {
            return `Opinion ${i + 1}:\n  agent: ${opinion.agentId}\n  claim: ${opinion.claim}\n  rationale: ${opinion.rationale ?? "—"}\n  confidence: ${opinion.confidence}`;
          })
          .join("\n\n")
      : "No saved agent opinions available.";

  return `[USER QUESTION]
${input.question}

${contextBlock ? `[REQUEST CONTEXT]\n${contextBlock}\n\n` : ""}[ARCHIVE / KNOWLEDGE CONTEXT]
${sourcesBlock}

[DEBATE KNOWLEDGE]
${insightsBlock}

[AGENT OPINIONS]
${opinionsBlock}

[INSTRUCTIONS]
You are Future Life Intelligence Agent. Answer the user's question using the context above.
Follow your response template exactly.
Do not invent numbers.
If quantitative evidence is not provided in the context, say that quantitative evidence is insufficient.
You may provide directional qualitative judgment, but label it as assumption.
If debate insights have [미검수 인사이트] label, treat them as preliminary reference, not confirmed facts.`;
}

export async function answerWithSuperAgent(
  input: SuperAgentAnswerRequest
): Promise<SuperAgentAnswerResponse> {
  const agent = getAgent("future_life_super");
  if (!agent) throw new Error("Future Life Intelligence Agent를 찾을 수 없습니다. DB를 초기화하세요.");

  const allSources = searchKnowledgeSources(input.question, undefined, 10);
  const sources = input.selectedSourceIds && input.selectedSourceIds.length > 0
    ? allSources.filter((s) => input.selectedSourceIds!.includes(s.id))
    : allSources.slice(0, 8);

  const insights =
    input.includeDebateKnowledge !== false
      ? searchDebateInsights({ question: input.question, domainId: input.domainId, limit: 8, includeDraft: true })
      : [];

  const opinions =
    input.includeAgentOpinions === true
      ? listAgentOpinions({ query: input.question, domainId: input.domainId, limit: 5 })
      : [];

  const prompt = buildSuperAgentPrompt({ input, sources, insights, opinions });

  const answerMarkdown = await generateText({
    agent: { ...agent, knowledgeSources: sources },
    messages: [{ role: "user", content: prompt }]
  });

  const saved = createSuperAgentAnswer({
    question: input.question,
    domainId: input.domainId,
    answerMarkdown,
    referencedArchiveIds: sources.map((s) => String(s.id)),
    referencedEvidenceIds: [],
    referencedDebateIds: [...new Set(insights.map((i) => i.debateId))],
    referencedInsightIds: insights.map((i) => i.id),
    referencedOpinionIds: opinions.map((o) => o.id),
    answerType: input.outputType ?? "future_life_answer"
  });

  return {
    answerId: saved.id,
    answerMarkdown,
    references: {
      knowledgeSources: sources.map((s) => ({ id: String(s.id), title: s.title, url: s.url })),
      debateInsights: insights.map((i) => ({ id: i.id, title: i.title, insightType: i.insightType })),
      agentOpinions: opinions.map((o) => ({ id: o.id, claim: o.claim, agentId: o.agentId }))
    }
  };
}

export function getSuperAgentAnswerWithRefs(id: string) {
  return getSuperAgentAnswer(id);
}

export function listSuperAgentAnswerSummaries(limit = 50) {
  return listSuperAgentAnswers(limit);
}
