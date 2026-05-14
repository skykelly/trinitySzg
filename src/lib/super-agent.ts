import { createSuperAgentAnswer, getAgent, getSuperAgentAnswer, listSuperAgentAnswers, searchKnowledgeSources } from "./db";
import { randomUUID } from "node:crypto";
import { searchDebateInsights } from "./debate-knowledge";
import { generateText, streamText } from "./llm";
import type { DebateInsight, KnowledgeSource } from "./types";

export interface SuperAgentAnswerRequest {
  question: string;
  timeHorizon?: "1y" | "3y" | "5y" | "10y";
  outputType?: "future_life_answer" | "scenario" | "business_opportunity" | "executive_brief";
  includeDebateKnowledge?: boolean;
}

export interface SuperAgentAnswerResponse {
  answerId: string;
  answerMarkdown: string;
  references: {
    knowledgeSources: Array<{ id: string; title: string; url: string }>;
    debateInsights: Array<{ id: string; title: string; insightType: string }>;
  };
}

export interface SaveAnswersInput {
  question: string;
  scenarioMarkdown: string;
  businessMarkdown: string;
  executiveMarkdown: string;
}

export function buildSuperAgentPrompt(params: {
  input: SuperAgentAnswerRequest;
  sources: KnowledgeSource[];
  insights: DebateInsight[];
}): string {
  const { input, sources, insights } = params;

  const contextBlock = input.timeHorizon ? `[REQUEST CONTEXT]\n- timeHorizon: ${input.timeHorizon}\n\n` : "";

  const outputInstruction: Record<string, string> = {
    future_life_answer:
      "고객의 미래 생활 변화를 종합 분석하고 response template 전체 섹션을 채워라.",
    scenario: `아래 구조로 3개 시나리오만 작성해라. 다른 섹션은 작성하지 마라.

## 1. Most Likely Scenario
### 고객 하루 생활 장면
특정 고객(이름·나이·직업·가족 구성 포함)의 하루를 아침부터 저녁까지 시간 순서로 10~15문장으로 구체적으로 묘사해라.
구체적인 시각, 장소, 행동, 감정, AI와의 대화나 인터랙션을 생생하게 포함해라.
단순 나열이 아니라 서사 형식으로 흐름이 이어지도록 써라.

### AI의 역할
이 시나리오에서 AI가 수행하는 역할

### 필요한 기술 조건
이 시나리오 실현에 필요한 기술 전제 조건

### 필요한 사업 조건
이 시나리오 실현에 필요한 사업·조직 조건

### 핵심 가정
이 시나리오가 성립하는 핵심 가정 2~3가지

## 2. High Upside Scenario
### 고객 하루 생활 장면
특정 고객(이름·나이·직업·가족 구성 포함)의 하루를 아침부터 저녁까지 시간 순서로 10~15문장으로 구체적으로 묘사해라.
구체적인 시각, 장소, 행동, 감정, AI와의 대화나 인터랙션을 생생하게 포함해라.
단순 나열이 아니라 서사 형식으로 흐름이 이어지도록 써라.
### AI의 역할
### 필요한 기술 조건
### 필요한 사업 조건
### 핵심 가정

## 3. Overhyped Scenario
### 고객 하루 생활 장면
특정 고객(이름·나이·직업·가족 구성 포함)의 하루를 아침부터 저녁까지 시간 순서로 10~15문장으로 구체적으로 묘사해라.
과장되거나 실현 어려운 장면임을 드러내면서도, 구체적인 시각·장소·행동·AI 인터랙션을 생생하게 포함해 서사 형식으로 써라.
### AI의 역할
### 왜 과장인가
### 현실적 대안`,
    business_opportunity: `아래 두 섹션만 작성해라. 다른 섹션은 작성하지 마라.

# 사업 기회
## 제품
제품 판매 관련 사업 기회와 아이디어

## 서비스
구독·케어·유지보수 관련 서비스 사업 기회

## B2B
기업 대상 B2B 사업 기회

# 실행 우선순위
## Now
지금 즉시 실행 가능한 것

## Next
6~12개월 내 준비·실행할 것

## Later
장기적으로 검토할 것`,
    executive_brief: `아래 섹션만 작성해라. 다른 섹션은 작성하지 마라.

# 핵심 결론
2~3문장으로 핵심 판단을 요약해라.

# 도메인 해석
- 관련 도메인:
- 고객 세그먼트:
- 시간축:

# 근거 기반 현재 신호
## 정량 Evidence
제공된 Archive나 Evidence에서 확인된 수치만 사용. 없으면 "정량 근거 부족"이라고 표시.
## Archive Signal
Archive에서 확인된 현재 시장 신호
## 기존 Agent Debate Insight
Debate Insight가 있으면 요약. 없으면 생략.

# 최종 추천
실행 가능한 추천 2~3가지를 번호 목록으로.

# 스코어카드
| 항목 | 점수 (/5) | 근거 |
|---|---|---|
| Evidence Grounding | |  |
| Future Life Relevance | | |
| Business Realism | | |
| Actionability | | |`
  };

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

  return `[USER QUESTION]
${input.question}

${contextBlock}[ARCHIVE / KNOWLEDGE CONTEXT]
${sourcesBlock}

[DEBATE KNOWLEDGE]
${insightsBlock}

[INSTRUCTIONS]
You are Future Life Intelligence Agent. Answer the user's question using the context above.
${outputInstruction[input.outputType ?? "future_life_answer"] ?? outputInstruction["future_life_answer"]}
Do not invent numbers.
If quantitative evidence is not provided in the context, say that quantitative evidence is insufficient.
You may provide directional qualitative judgment, but label it as assumption.
If debate insights have [미검수 인사이트] label, treat them as preliminary reference, not confirmed facts.`;
}

function buildContext(input: SuperAgentAnswerRequest) {
  const agent = getAgent("future_life_super");
  if (!agent) throw new Error("Future Life Intelligence Agent를 찾을 수 없습니다. DB를 초기화하세요.");

  const sources = searchKnowledgeSources(input.question, undefined, 8);

  const insights = input.includeDebateKnowledge !== false
    ? searchDebateInsights({ question: input.question, limit: 8, includeDraft: true })
    : [];

  const prompt = buildSuperAgentPrompt({ input, sources, insights });
  const references: SuperAgentAnswerResponse["references"] = {
    knowledgeSources: sources.map((s) => ({ id: String(s.id), title: s.title, url: s.url })),
    debateInsights: insights.map((i) => ({ id: i.id, title: i.title, insightType: i.insightType }))
  };

  return { agent, sources, prompt, references };
}

// 스트리밍 전용 — DB 저장 없음
export async function streamAnswerWithSuperAgent(
  input: SuperAgentAnswerRequest,
  onToken: (token: string) => void | Promise<void>
): Promise<SuperAgentAnswerResponse> {
  const { agent, sources, prompt, references } = buildContext(input);
  const answerId = randomUUID();

  const answerMarkdown = await streamText({
    agent: { ...agent, knowledgeSources: sources },
    messages: [{ role: "user", content: prompt }],
    onToken
  });

  return { answerId, answerMarkdown, references };
}

// 3개 탭 내용을 하나의 레코드로 저장
export function saveAllAnswers(input: SaveAnswersInput): string {
  const id = randomUUID();
  createSuperAgentAnswer({
    id,
    question: input.question,
    scenarioMarkdown: input.scenarioMarkdown,
    businessMarkdown: input.businessMarkdown,
    executiveMarkdown: input.executiveMarkdown
  });
  return id;
}

export async function answerWithSuperAgent(
  input: SuperAgentAnswerRequest
): Promise<SuperAgentAnswerResponse> {
  const { agent, sources, prompt, references } = buildContext(input);

  const answerMarkdown = await generateText({
    agent: { ...agent, knowledgeSources: sources },
    messages: [{ role: "user", content: prompt }]
  });

  const saved = createSuperAgentAnswer({
    question: input.question,
    scenarioMarkdown: answerMarkdown,
    businessMarkdown: "",
    executiveMarkdown: ""
  });

  return { answerId: saved.id, answerMarkdown, references };
}

export function getSuperAgentAnswerWithRefs(id: string) {
  return getSuperAgentAnswer(id);
}

export function listSuperAgentAnswerSummaries(limit = 50) {
  return listSuperAgentAnswers(limit);
}
