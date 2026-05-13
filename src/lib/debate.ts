import { generateText, streamText } from "./llm";
import type { Agent, DebateTurn } from "./types";

const roundLabels = {
  opening: "1차 주장",
  rebuttal: "상호 반박",
  final: "최종 입장"
} as const;

export async function runDebate(question: string, agents: Agent[]) {
  if (process.env.DEBATE_MODE === "multi") {
    return runMultiCallDebate(question, agents);
  }

  return runSingleCallDebate(question, agents);
}

export async function streamDebate(
  question: string,
  agents: Agent[],
  onToken: (token: string) => void | Promise<void>,
  mode: string = "Feasibility"
) {
  const isCreative = mode === "Creative Idea";

  const moderator = isCreative
    ? {
        provider: agents[0]?.provider ?? "gemini",
        model: agents[0]?.model ?? "gemini-2.5-flash-lite",
        temperature: 0.85,
        agentType: "moderator_agent" as const,
        systemPrompt:
          "당신은 세 AI 페르소나의 창의적 아이디어 발전 세션을 이끄는 촉진자입니다. 비판보다 확장을 우선하세요. 각 페르소나가 서로의 아이디어를 발전시키고 융합해 처음보다 훨씬 대담하고 새로운 아이디어에 도달하도록 이끄세요. 최종 결론은 가장 흥미롭고 잠재력 있는 아이디어를 구체화하는 방향으로 정리하세요.",
        description: "Creative Idea 세션의 아이디어 촉진자입니다.",
        tone: "상상력 자극, 열린 탐색, 시너지 강조",
        debateStyle: "협력형 아이디어 확장",
        knowledge: "출력은 사용자가 실시간으로 읽는 Markdown 창의 세션 기록입니다.",
        judgmentCriteria: "아이디어의 독창성, 고객 욕구와의 공명, 기술·사업의 융합 가능성을 기준으로 합니다.",
        debateBehavior: "각 페르소나의 아이디어가 서로를 자극하고 발전하도록 연결합니다.",
        responseTemplate: "Idea Spark, Build & Amplify, Synergy Synthesis 순서로 정리합니다.",
        challengeRules: "비판 금지. 아이디어에 질문하고 확장하세요.",
        evidenceRules: "현실 근거보다 상상력과 가능성을 우선합니다.",
        scorecard: "독창성, 고객 공명도, 융합 가능성, 실현 잠재력을 평가합니다."
      }
    : {
        provider: agents[0]?.provider ?? "gemini",
        model: agents[0]?.model ?? "gemini-2.5-flash-lite",
        temperature: 0.45,
        agentType: "moderator_agent" as const,
        systemPrompt:
          "당신은 세 AI 페르소나의 토론을 진행하고 종합하는 중립 진행자입니다. 각 페르소나의 관점을 분리해서 충실히 시뮬레이션하되, 최종 결론은 실행 가능하게 정리하세요.",
        description: "Trinity Debate의 중립 진행자입니다.",
        tone: "명확하고 실행 중심",
        debateStyle: "균형형",
        knowledge: "출력은 사용자가 실시간으로 읽는 Markdown 토론문입니다.",
        judgmentCriteria: "기술 가능성, 고객 가치, 사업 실행성을 균형 있게 종합합니다.",
        debateBehavior: "각 페르소나의 충돌 지점을 드러내고 Szg Synthesis로 정렬합니다.",
        responseTemplate: "Question Framing, Evidence Scan, Opening Views, Cross Challenge, Refine Positions, Score & Trade-off, Consensus Map, Szg Synthesis 순서로 정리합니다.",
        challengeRules: "근거 수준이 낮은 주장은 가설로 표시하고, 검증 전제를 분리합니다.",
        evidenceRules: "각 핵심 판단에 Evidence Level과 Missing Evidence를 표시합니다.",
        scorecard: "기술 가능성, 고객 가치, 사업 실행성, 리스크, MVP 가능성을 비교합니다."
      };

  const prompt = isCreative
    ? buildCreativeDebatePrompt(question, agents)
    : buildStreamingDebatePrompt(question, agents);

  const markdown = await streamText({
    agent: moderator,
    messages: [{ role: "user", content: prompt }],
    onToken
  });

  return parseMarkdownDebate(markdown, agents);
}

function buildCreativeDebatePrompt(question: string, agents: Agent[]) {
  const [a, b, c] = agents;
  const nameA = a?.name ?? "Agent 1";
  const nameB = b?.name ?? "Agent 2";
  const nameC = c?.name ?? "Agent 3";

  return `주제: ${question}

아래 3개의 AI 페르소나가 창의적 아이디어 발전 세션을 진행합니다.
이 세션은 실현 가능성 검토가 아닙니다. 목표는 서로의 아이디어를 자극하고 확장해 처음보다 훨씬 대담하고 새로운 아이디어를 만드는 것입니다.

[각 에이전트의 역할 재정의]

${nameA} (기술 상상가):
현재 기술의 한계를 넘어 가능한 미래 기술 또는 융합 기술을 상상하세요.
현실의 제약은 잠시 잊고, 기술이 무엇을 가능하게 할 수 있는지 대담하게 탐색하세요.
"만약 이 기술이 완성된다면..." "이 두 기술이 결합하면..." 같은 방식으로 사고하세요.

${nameB} (미래 고객 공감가):
미래 고객의 욕구, 가치, 생활 방식을 깊이 상상하세요.
고객이 아직 말하지 못한 욕구, 진정으로 원하는 삶의 변화를 그려보세요.
인간적이고 감성적인 관점을 강조하세요. 고객이 이 변화를 경험할 때 느끼는 감정을 묘사하세요.

${nameC} (사업 혁신가):
새로운 비즈니스 모델, 파괴적 혁신을 통해 고객과 기술이 맞물리는 지점을 찾으세요.
기존 사업 방식의 제약을 넘어, 전혀 새로운 가치 창출 방식을 상상하세요.
"이 아이디어가 어떤 새로운 시장을 만들 수 있을까?" 관점으로 탐색하세요.

[협력 규칙]
- 비판 금지. 아이디어의 약점을 지적하는 대신 "이 아이디어에서 더 나아가면..."으로 확장하세요.
- 다른 에이전트의 아이디어에서 가능성을 발견하고 질문을 던지세요.
- 세 에이전트의 아이디어가 융합해 처음보다 훨씬 큰 아이디어가 탄생하도록 시너지를 만드세요.

Markdown만 출력하세요. JSON이나 코드블록은 쓰지 마세요.
반드시 아래 형식을 그대로 사용하세요. AI 이름은 위 페르소나 이름을 그대로 사용하세요.

## Idea Spark — 씨앗 아이디어
### ${nameA} · 기술 상상
현재 기술의 한계를 넘는 대담한 기술 가능성을 3~5문장으로 상상하세요.

### ${nameB} · 고객 공감
미래 고객이 진정으로 원하는 삶의 변화를 3~5문장으로 감성적으로 그려보세요.

### ${nameC} · 사업 혁신
완전히 새로운 비즈니스 모델이나 시장 창출 가능성을 3~5문장으로 상상하세요.

## Build & Amplify — 확장과 융합
### ${nameA} · 기술로 확장
${nameB}와 ${nameC}의 아이디어에서 가능성을 발견하고, 기술적으로 더 대담하게 확장하세요. "이 욕구를 충족하려면 어떤 기술이 필요할까?" 질문에서 출발하세요.

### ${nameB} · 고객으로 확장
${nameA}와 ${nameC}의 아이디어가 고객의 삶을 어떻게 근본적으로 바꿀지 상상하세요. "이 기술과 사업이 실현된다면 고객의 하루는 어떻게 달라질까?"

### ${nameC} · 사업으로 확장
${nameA}와 ${nameB}의 아이디어에서 전혀 새로운 사업 기회를 발견하세요. "이 기술과 고객 욕구가 만나는 지점에서 어떤 새로운 시장이 탄생할 수 있을까?"

## Synergy Synthesis — 융합 아이디어
세 에이전트의 아이디어가 하나로 융합된 가장 대담하고 새로운 아이디어를 제시하세요.

### 융합 아이디어
세 관점이 합쳐진 하나의 구체적이고 흥미로운 아이디어를 이름과 함께 제안하세요.

### 이 아이디어가 특별한 이유
왜 이 아이디어가 기존과 다른지, 어떤 새로운 가능성을 열어주는지 설명하세요.

### 다음 상상을 위한 질문
이 아이디어를 더 발전시키기 위해 세 에이전트가 함께 탐색해야 할 질문 3가지를 제시하세요.`;
}

function buildStreamingDebatePrompt(question: string, agents: Agent[]) {
  const [a, b, c] = agents;
  const nameA = a?.name ?? "Agent 1";
  const nameB = b?.name ?? "Agent 2";
  const nameC = c?.name ?? "Agent 3";

  return `질문: ${question}

아래 3개의 AI 페르소나가 토론한다고 가정하세요.
${agents.map(formatAgentForPrompt).join("\n")}

Markdown만 출력하세요. JSON이나 코드블록은 쓰지 마세요.
반드시 아래 형식을 그대로 사용하세요. AI 이름은 위 페르소나 이름을 그대로 사용하세요.

## Question Framing
- 분석 대상:
- 판단해야 할 쟁점:
- 토론 모드와 산출물 형식에 맞춘 기준:

## Evidence Scan
- 사용 가능한 근거:
- 근거 수준이 낮은 가정:
- 추가로 확인해야 할 자료:

## Opening Views
### ${nameA} · 1차 주장
직접 말하는 자연스러운 발언 3~6문장. 해당 Agent의 Response Template과 Evidence Rules를 반영하세요.

### ${nameB} · 1차 주장
직접 말하는 자연스러운 발언 3~6문장. 해당 Agent의 Response Template과 Evidence Rules를 반영하세요.

### ${nameC} · 1차 주장
직접 말하는 자연스러운 발언 3~6문장. 해당 Agent의 Response Template과 Evidence Rules를 반영하세요.

## Cross Challenge
### ${nameA} · 상호 반박
이전 발언을 지칭하며 동의, 반박, 보완하는 발언 3~6문장.

### ${nameB} · 상호 반박
이전 발언을 지칭하며 동의, 반박, 보완하는 발언 3~6문장.

### ${nameC} · 상호 반박
이전 발언을 지칭하며 동의, 반박, 보완하는 발언 3~6문장.

## Refine Positions
### ${nameA} · 최종 입장
최종 입장 3~5문장. Evidence Level과 검증 필요사항을 포함하세요.

### ${nameB} · 최종 입장
최종 입장 3~5문장. Evidence Level과 검증 필요사항을 포함하세요.

### ${nameC} · 최종 입장
최종 입장 3~5문장. Evidence Level과 검증 필요사항을 포함하세요.

## Score & Trade-off
- ${nameA} scorecard:
- ${nameB} scorecard:
- ${nameC} scorecard:
- 점수 차이가 큰 핵심 이견:

## Consensus Map
- 합의된 내용:
- 이견이 남은 내용:
- 핵심 리스크:
- 실행 조건:
- 추가로 필요한 정보:

## 최종 결론
중립 진행자로서 토론을 종합한 결론.

### 판단 근거
- 핵심 근거
- 합의점
- 남은 리스크

### 다음 실행안
1. 첫 번째 실행안
2. 두 번째 실행안
3. 세 번째 실행안

### 하지 말아야 할 것
- 피해야 할 선택

### MVP 범위와 핵심 KPI
- MVP 범위:
- 핵심 KPI:`;
}

function formatAgentForPrompt(agent: Agent) {
  const sources = (agent.knowledgeSources ?? [])
    .slice()
    .sort((a, b) => a.priority - b.priority || a.title.localeCompare(b.title))
    .slice(0, 6)
    .map(
      (source) => {
        const chunks =
          source.chunks && source.chunks.length > 0
            ? `\n      matchedChunks:\n${source.chunks
                .map((chunk) => `      - Chunk ${chunk.chunkIndex + 1}: ${chunk.content.slice(0, 500)}`)
                .join("\n")}`
            : "";
        return `    - [${source.reliability} / P${source.priority}] ${source.title}: ${source.summary} (${source.url})${chunks}`;
      }
    )
    .join("\n");

  return `- id: ${agent.id}
  name: ${agent.name}
  role: ${agent.role}
  personaType: ${agent.personaType}
  description: ${agent.description}
  tone: ${agent.tone}
  debateStyle: ${agent.debateStyle}
  systemPrompt: ${agent.systemPrompt}
  knowledgePack: ${agent.knowledge}
  judgmentCriteria: ${agent.judgmentCriteria}
  debateBehavior: ${agent.debateBehavior}
  responseTemplate: ${agent.responseTemplate}
  challengeRules: ${agent.challengeRules}
  evidenceRules: ${agent.evidenceRules}
  scorecard: ${agent.scorecard}
  curatedKnowledgeSources:
${sources || "    - No curated source summaries linked."}`;
}

async function runSingleCallDebate(question: string, agents: Agent[]) {
  const moderator = {
    provider: agents[0]?.provider ?? "gemini",
    model: agents[0]?.model ?? "gemini-2.5-flash-lite",
    temperature: 0.45,
    systemPrompt:
      "당신은 세 AI 페르소나의 토론을 진행하고 종합하는 중립 진행자입니다. 각 페르소나의 관점을 분리해서 충실히 시뮬레이션하되, 최종 결론은 실행 가능하게 정리하세요.",
    agentType: "moderator_agent",
    description: "Trinity Debate의 중립 진행자입니다.",
    tone: "명확하고 실행 중심",
    debateStyle: "균형형",
    knowledge: "무료 LLM API quota를 아끼기 위해 전체 토론을 한 번의 응답 안에서 생성합니다.",
    judgmentCriteria: "기술 가능성, 고객 가치, 사업 실행성을 균형 있게 종합합니다.",
    debateBehavior: "각 페르소나의 충돌 지점을 드러내고 Szg Synthesis로 정렬합니다.",
    responseTemplate: "Evidence Scan, Opening Views, Cross Challenge, Refine Positions, Score & Trade-off, Consensus Map, Szg Synthesis를 모두 포함합니다.",
    challengeRules: "각 페르소나의 반박 규칙을 적용하고 약한 근거를 명시합니다.",
    evidenceRules: "Evidence Level, Missing Evidence, Next Validation을 표시합니다.",
    scorecard: "각 페르소나의 scorecard를 활용해 trade-off를 정리합니다."
  } satisfies Parameters<typeof generateText>[0]["agent"];

  const response = await generateText({
    agent: moderator,
    messages: [
      {
        role: "user",
        content: `질문: ${question}

아래 3개의 AI 페르소나가 토론한다고 가정하세요.
${agents.map(formatAgentForPrompt).join("\n")}

토론 과정은 보고서 요약이 아니라 실제 회의 대화처럼 작성하세요.
- 각 content는 해당 AI가 직접 말하는 자연스러운 발언이어야 합니다.
- "핵심 주장:", "근거:" 같은 문서형 소제목은 content 안에 넣지 마세요.
- 서로의 이전 발언을 짧게 인용하거나 지칭하면서 동의, 반박, 보완하세요.
- 각 발언은 3~6문장으로 제한하세요.
- 각 Agent의 challengeRules와 evidenceRules를 반영하세요.
- content 안에는 Evidence Level과 Missing Evidence를 짧게 포함하세요.

다음 JSON만 출력하세요. markdown 코드블록을 쓰지 마세요.
{
  "turns": [
    { "agentId": "tech", "agentName": "기술중심 AI", "round": "opening", "content": "..." },
    { "agentId": "customer", "agentName": "고객중심 AI", "round": "opening", "content": "..." },
    { "agentId": "business", "agentName": "현실적 사업가 AI", "round": "opening", "content": "..." },
    { "agentId": "tech", "agentName": "기술중심 AI", "round": "rebuttal", "content": "..." },
    { "agentId": "customer", "agentName": "고객중심 AI", "round": "rebuttal", "content": "..." },
    { "agentId": "business", "agentName": "현실적 사업가 AI", "round": "rebuttal", "content": "..." },
    { "agentId": "tech", "agentName": "기술중심 AI", "round": "final", "content": "..." },
    { "agentId": "customer", "agentName": "고객중심 AI", "round": "final", "content": "..." },
    { "agentId": "business", "agentName": "현실적 사업가 AI", "round": "final", "content": "..." }
  ],
  "conclusion": "## Evidence Scan\\n...\\n## Score & Trade-off\\n...\\n## Consensus Map\\n...\\n## 최종 결론\\n...\\n## 판단 근거\\n...\\n## 다음 실행안\\n..."
}

round 값은 반드시 opening, rebuttal, final 중 하나여야 합니다. content와 conclusion은 한국어로 작성하세요. conclusion은 토론을 종합한 중립 진행자의 최종 발언처럼 작성하세요.`
      }
    ]
  });

  return parseSingleCallDebate(response, agents);
}

function parseSingleCallDebate(response: string, agents: Agent[]) {
  const jsonText = extractJson(response);
  const parsed = JSON.parse(jsonText) as { turns?: DebateTurn[]; conclusion?: string };
  const validAgentIds = new Set(agents.map((agent) => agent.id));
  const validRounds = new Set(["opening", "rebuttal", "final"]);
  const turns = (parsed.turns ?? []).filter(
    (turn) => validAgentIds.has(turn.agentId) && validRounds.has(turn.round) && turn.content?.trim()
  );

  if (turns.length === 0 || !parsed.conclusion?.trim()) {
    throw new Error("토론 응답을 파싱하지 못했습니다. 다시 시도하세요.");
  }

  return { turns, conclusion: parsed.conclusion };
}

function extractJson(response: string) {
  const trimmed = response.trim();
  if (trimmed.startsWith("{")) return trimmed;

  const fenced = trimmed.match(/```(?:json)?\s*([\s\S]*?)```/);
  if (fenced?.[1]) return fenced[1].trim();

  const start = trimmed.indexOf("{");
  const end = trimmed.lastIndexOf("}");
  if (start >= 0 && end > start) return trimmed.slice(start, end + 1);

  return trimmed;
}

function parseMarkdownDebate(markdown: string, agents: Agent[]) {
  const conclusionMarker = markdown.match(/^##\s+최종 결론\s*$/m);
  const debateText = conclusionMarker ? markdown.slice(0, conclusionMarker.index).trim() : markdown.trim();
  const conclusion = conclusionMarker ? markdown.slice(conclusionMarker.index).trim() : "## 최종 결론\n결론을 파싱하지 못했습니다.";
  const turns: DebateTurn[] = [];
  const headingPattern = /^###\s+(.+?)\s+·\s+(1차 주장|상호 반박|최종 입장)\s*$/gm;
  const headings = [...debateText.matchAll(headingPattern)];

  for (let index = 0; index < headings.length; index += 1) {
    const heading = headings[index];
    const nextHeading = headings[index + 1];
    const agentName = heading[1].trim();
    const roundLabel = heading[2].trim();
    const agent = agents.find((item) => item.name === agentName);
    const contentStart = (heading.index ?? 0) + heading[0].length;
    const contentEnd = nextHeading?.index ?? debateText.length;
    const content = debateText.slice(contentStart, contentEnd).trim();

    if (!agent || !content) continue;
    turns.push({
      agentId: agent.id,
      agentName: agent.name,
      round: labelToRound(roundLabel),
      content
    });
  }

  if (turns.length === 0) {
    throw new Error("스트리밍 토론 응답을 파싱하지 못했습니다.");
  }

  return { turns, conclusion };
}

function labelToRound(label: string): DebateTurn["round"] {
  if (label === "상호 반박") return "rebuttal";
  if (label === "최종 입장") return "final";
  return "opening";
}

async function runMultiCallDebate(question: string, agents: Agent[]) {
  const turns: DebateTurn[] = [];

  for (const agent of agents) {
    const content = await generateText({
      agent,
      messages: [
        {
          role: "user",
          content: `질문: ${question}\n\n${agent.name}의 관점에서 핵심 주장, 근거, 우려점, 권장 행동을 간결하게 제시하세요.`
        }
      ]
    });
    turns.push({ agentId: agent.id, agentName: agent.name, round: "opening", content });
  }

  const openingSummary = formatTurns(turns);
  for (const agent of agents) {
    const content = await generateText({
      agent,
      messages: [
        {
          role: "user",
          content: `질문: ${question}\n\n다른 AI들의 1차 주장:\n${openingSummary}\n\n${agent.name}의 관점에서 동의할 점, 반박할 점, 보완할 점을 제시하세요.`
        }
      ]
    });
    turns.push({ agentId: agent.id, agentName: agent.name, round: "rebuttal", content });
  }

  const rebuttalSummary = formatTurns(turns);
  for (const agent of agents) {
    const content = await generateText({
      agent,
      messages: [
        {
          role: "user",
          content: `질문: ${question}\n\n지금까지의 토론:\n${rebuttalSummary}\n\n${agent.name}의 최종 입장을 5문장 이내로 정리하세요.`
        }
      ]
    });
    turns.push({ agentId: agent.id, agentName: agent.name, round: "final", content });
  }

  const moderator = {
    provider: agents[0]?.provider ?? "gemini",
    model: agents[0]?.model ?? "gemini-2.5-flash-lite",
    temperature: 0.35,
    systemPrompt:
      "당신은 세 AI의 토론을 종합하는 중립 진행자입니다. 어느 한 관점에 치우치지 말고 실행 가능한 결론을 구조화하세요.",
    agentType: "moderator_agent",
    description: "Szg Synthesis를 작성하는 중립 진행자입니다.",
    tone: "간결하고 실무적인 보고형",
    debateStyle: "균형형",
    knowledge: "결론은 개인용 MVP 의사결정에 바로 쓸 수 있어야 합니다.",
    judgmentCriteria: "기술 가능성, 고객 가치, 사업 실행성",
    debateBehavior: "합의점, 이견, 실행 조건을 분리합니다.",
    responseTemplate: "Evidence Scan, Score & Trade-off, Consensus Map, 핵심 결론, 다음 실행안을 포함합니다.",
    challengeRules: "근거가 약한 주장은 가설로 표시하고 검증 조건을 붙입니다.",
    evidenceRules: "Evidence Level과 Missing Evidence를 표시합니다.",
    scorecard: "기술 가능성, 고객 가치, 사업 실행성을 점수화합니다."
  } satisfies Parameters<typeof generateText>[0]["agent"];

  const conclusion = await generateText({
    agent: moderator,
    messages: [
      {
        role: "user",
        content: `질문: ${question}\n\n토론 전체:\n${formatTurns(turns)}\n\n다음 형식으로 최종 결론을 작성하세요.\n\n## Evidence Scan\n## Score & Trade-off\n## Consensus Map\n## 핵심 결론\n## 관점별 요약\n## 합의점\n## 남은 이견과 리스크\n## 다음 실행안`
      }
    ]
  });

  return { turns, conclusion };
}

function formatTurns(turns: DebateTurn[]): string {
  return turns
    .map((turn) => `[${roundLabels[turn.round]} / ${turn.agentName}]\n${turn.content}`)
    .join("\n\n");
}
