import { createDebateInsights, getDebate, listDebateInsights } from "./db";
import { generateText } from "./llm";
import type { DebateInsight, DebateTurn, NewDebateInsight } from "./types";

const extractor = {
  provider: "gemini" as const,
  model: "gemini-2.5-flash-lite",
  temperature: 0.3,
  agentType: "moderator_agent" as const,
  systemPrompt: "You extract structured knowledge from multi-agent debates. Return valid JSON only. No markdown, no explanation.",
  description: "Debate insight extractor",
  tone: "structured",
  debateStyle: "analytical",
  knowledge: "",
  judgmentCriteria: "",
  debateBehavior: "",
  responseTemplate: "",
  challengeRules: "",
  evidenceRules: "",
  scorecard: ""
};

export function buildInsightExtractionPrompt(input: {
  question: string;
  turns: DebateTurn[];
  conclusion?: string;
}): string {
  const transcript = input.turns
    .map((turn) => `[${turn.agentName} / ${turn.round}]\n${turn.content}`)
    .join("\n\n");

  return `You are extracting reusable knowledge from a multi-agent debate.

The debate was performed by three specialist agents:
- Tech Strategist
- Customer Advocate
- Business Realist (Pragmatic Builder)

Debate question: ${input.question}

Debate transcript:
${transcript}
${input.conclusion ? `\nDebate conclusion:\n${input.conclusion}` : ""}

Extract reusable insights that can help a separate Super Agent answer future questions.

Return only a JSON array. No markdown, no explanation.

Each item must have:
- insightType: one of tech_feasibility | customer_behavior | business_opportunity | risk | counterargument | consensus | disagreement | scenario_seed | kpi | assumption
- agentId: "tech" | "customer" | "business" | null (null if multi-agent or conclusion)
- title: short reusable title
- content: concise but meaningful insight, 2-4 sentences
- confidence: "high" | "medium" | "low"
- evidenceLevel: "high" | "medium" | "low"
- tags: string[]

Rules:
- Do not invent facts.
- Extract only insights present in the debate.
- Prefer reusable insight over one-off wording.
- If agents disagreed, use insightType=disagreement.
- If all agents aligned, use insightType=consensus.
- Extract 5-12 insights. Quality over quantity.

Example output:
[
  {
    "insightType": "consensus",
    "agentId": null,
    "title": "AI 쇼핑 어시스턴트 도입 전 데이터 기반 검증 필요",
    "content": "세 Agent 모두 실제 고객 데이터 없이 AI 쇼핑 어시스턴트를 전면 도입하면 실패 위험이 높다는 점에 동의했다.",
    "confidence": "high",
    "evidenceLevel": "medium",
    "tags": ["AI", "쇼핑", "검증"]
  }
]`;
}

function extractJsonArray(response: string): unknown[] {
  const trimmed = response.trim();
  if (trimmed.startsWith("[")) {
    try { return JSON.parse(trimmed) as unknown[]; } catch { /* fall through */ }
  }
  const fenced = trimmed.match(/```(?:json)?\s*(\[[\s\S]*?\])\s*```/);
  if (fenced?.[1]) {
    try { return JSON.parse(fenced[1]) as unknown[]; } catch { /* fall through */ }
  }
  const start = trimmed.indexOf("[");
  const end = trimmed.lastIndexOf("]");
  if (start >= 0 && end > start) {
    try { return JSON.parse(trimmed.slice(start, end + 1)) as unknown[]; } catch { /* fall through */ }
  }
  return [];
}

const validInsightTypes = new Set([
  "tech_feasibility", "customer_behavior", "business_opportunity",
  "risk", "counterargument", "consensus", "disagreement",
  "scenario_seed", "kpi", "assumption"
]);

function toLevel(value: unknown): "high" | "medium" | "low" {
  if (value === "high" || value === "low") return value;
  return "medium";
}

function parseRawInsights(
  raw: unknown[],
  debateId: string,
  domainId?: string,
  autoApprove?: boolean
): NewDebateInsight[] {
  const results: NewDebateInsight[] = [];
  for (const item of raw) {
    if (!item || typeof item !== "object") continue;
    const r = item as Record<string, unknown>;
    const insightType = String(r.insightType ?? "");
    if (!validInsightTypes.has(insightType)) continue;
    const title = String(r.title ?? "").trim();
    const content = String(r.content ?? "").trim();
    if (!title || !content) continue;
    const rawTags = Array.isArray(r.tags) ? (r.tags as unknown[]).map(String) : [];
    results.push({
      debateId,
      domainId,
      insightType: insightType as NewDebateInsight["insightType"],
      agentId: r.agentId && r.agentId !== "null" ? String(r.agentId) : undefined,
      title,
      content,
      confidence: toLevel(r.confidence),
      evidenceLevel: toLevel(r.evidenceLevel),
      tags: rawTags,
      status: autoApprove ? "approved" : "draft"
    });
  }
  return results;
}

export async function extractDebateInsights(
  debateId: string,
  options: { domainId?: string; autoApprove?: boolean } = {}
): Promise<DebateInsight[]> {
  const debate = getDebate(Number(debateId));
  if (!debate) throw new Error("토론을 찾을 수 없습니다.");

  const prompt = buildInsightExtractionPrompt({
    question: debate.question,
    turns: debate.turns,
    conclusion: debate.conclusion
  });

  const response = await generateText({
    agent: extractor,
    messages: [{ role: "user", content: prompt }]
  });

  const raw = extractJsonArray(response);
  const items = parseRawInsights(raw, String(debate.id), options.domainId, options.autoApprove);

  if (items.length === 0) throw new Error("Insight를 추출하지 못했습니다. 토론 내용을 확인하세요.");

  return createDebateInsights(items);
}

export function searchDebateInsights(params: {
  question: string;
  domainId?: string;
  limit?: number;
  includeDraft?: boolean;
}): DebateInsight[] {
  const candidates = listDebateInsights({
    domainId: params.domainId,
    query: params.question,
    limit: (params.limit ?? 8) * 4
  });

  return candidates
    .filter((item) =>
      item.status === "approved" || (params.includeDraft === true && item.status === "draft")
    )
    .slice(0, params.limit ?? 8);
}
