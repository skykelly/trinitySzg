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
          "당신은 세 AI 페르소나의 창의적 아이디어 발전 세션을 이끄는 촉진자입니다. 비판보다 발전을 우선하세요. 단, 공상과학 수준의 기술 낙관론은 경계하고, 5년 내 실제로 시작 가능한 수준에서 가장 창의적인 조합을 이끌어내세요. 각 페르소나가 서로의 아이디어를 현실감 있게 발전시키고 융합해 구체적이고 새로운 아이디어에 도달하도록 이끄세요.",
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
시간 범위: 지금부터 5년 이내 실제로 시작할 수 있는 아이디어. 공상과학이 아니라 "지금 존재하는 기술·고객·사업의 조합을 새롭게 연결하는 것"이 목표입니다.

[각 에이전트의 역할]

${nameA} (기술 탐색가):
현재 이미 존재하거나 2~3년 내 상용화될 기술에서 출발하세요.
아직 연결되지 않은 기술들의 조합, 지금은 비싸지만 곧 저렴해질 기술, 다른 산업에서 검증됐지만 이 분야엔 적용 안 된 기술을 탐색하세요.
"현재 기술로 가능한 최선"과 "3~5년 내 가능한 것"을 명확히 구분해서 제안하세요.
기술 낙관론은 경계하세요: 실현 전제 조건이 불분명하면 가정으로 표시하세요.

${nameB} (고객 공감가):
지금 고객이 실제로 느끼는 불편, 반복되는 스트레스, 아직 해결 안 된 욕구에서 출발하세요.
미래 고객의 욕구를 상상할 때도 현재 행동 패턴의 연장선에서 그려야 합니다.
고객이 기꺼이 돈을 낼 만큼 체감 가치가 있는지, 실제로 행동을 바꿀 만큼 강력한 동기인지를 함께 판단하세요.
인간적이고 감성적인 관점으로 고객의 하루가 어떻게 달라지는지 구체적으로 묘사하세요.

${nameC} (사업 설계가):
기존 사업 방식을 조금 비틀거나 수익 구조를 재설계하는 것으로 충분히 새로울 수 있습니다.
완전한 파괴보다는 "기존 것 + 새로운 연결 + 다른 수익 구조"로 접근하세요.
5년 내 실제로 시작할 수 있는 MVP 형태를 기준으로, 누가 돈을 내고 왜 사업이 지속 가능한지를 설명하세요.

[협력 규칙]
- 비판보다 발전: 약점을 지적하기보다 "이 아이디어를 더 현실적으로 만들려면..."으로 보완하세요.
- 근거 없는 기술 낙관론 금지: "언젠가 가능할 것"이 아니라 "5년 내 어떤 조건에서 가능한지"를 명시하세요.
- 세 에이전트의 관점이 융합해 현실감 있고 새로운 아이디어가 탄생하도록 시너지를 만드세요.

Markdown만 출력하세요. JSON이나 코드블록은 쓰지 마세요.
반드시 아래 형식을 그대로 사용하세요. AI 이름은 위 페르소나 이름을 그대로 사용하세요.

## Idea Spark — 씨앗 아이디어
### ${nameA} · 기술 탐색
지금 또는 3년 내 가능한 기술 조합으로 어떤 새로운 경험을 만들 수 있는지 3~5문장으로 제안하세요. 전제 조건을 명시하세요.

### ${nameB} · 고객 공감
지금 고객이 실제로 겪는 불편에서 출발해, 5년 후 고객의 하루가 어떻게 달라질 수 있는지 3~5문장으로 묘사하세요.

### ${nameC} · 사업 설계
5년 내 시작 가능한 형태로, 누가 왜 돈을 내는지를 중심으로 새로운 사업 구조를 3~5문장으로 제안하세요.

## Build & Amplify — 보완과 융합
### ${nameA} · 기술로 보완
${nameB}의 고객 욕구와 ${nameC}의 사업 구조를 실현하려면 어떤 기술 조건이 필요한지, 현재 어떤 부분이 부족한지 솔직하게 평가하고 대안을 제시하세요.

### ${nameB} · 고객으로 보완
${nameA}의 기술 아이디어와 ${nameC}의 사업 구조가 실제 고객 행동을 바꿀 수 있는지 검토하고, 수용 장벽과 해결 방법을 제안하세요.

### ${nameC} · 사업으로 보완
${nameA}의 기술과 ${nameB}의 고객 욕구가 만나는 지점에서 실제로 수익을 낼 수 있는 구조와 5년 내 시작 가능한 MVP 범위를 제시하세요.

## Synergy Synthesis — 융합 아이디어
세 관점을 종합한 하나의 현실감 있고 새로운 아이디어를 정리하세요.

### 융합 아이디어
구체적인 이름과 함께, 기술·고객·사업이 어떻게 연결되는지 3~5문장으로 설명하세요.

### 5년 내 실행 경로
지금 당장 시작할 수 있는 첫 단계와 5년까지의 발전 경로를 간략히 제시하세요.

### 핵심 가정과 검증 과제
이 아이디어가 성립하려면 사실이어야 하는 핵심 가정 2~3가지와, 가장 먼저 검증해야 할 질문을 제시하세요.`;
}

function buildStreamingDebatePrompt(question: string, agents: Agent[]) {
  const [a, b, c] = agents;
  const nameA = a?.name ?? "Agent 1";
  const nameB = b?.name ?? "Agent 2";
  const nameC = c?.name ?? "Agent 3";

  return `질문: ${question}

아래 3개의 AI 페르소나가 토론한다고 가정하세요.
${agents.map(formatAgentForPrompt).join("\n")}

시간 범위: 현재 상황을 출발점으로, 5년 후(2030년 전후)까지의 변화 흐름을 함께 검토하세요.
현재만 보지 말고, 지금 시작한다면 5년 후 어디에 도달할 수 있는지를 판단 기준에 포함하세요.

Markdown만 출력하세요. JSON이나 코드블록은 쓰지 마세요.
반드시 아래 형식을 그대로 사용하세요. AI 이름은 위 페르소나 이름을 그대로 사용하세요.

## Question Framing
- 분석 대상:
- 현재 상황:
- 5년 후 전망 쟁점:

## Evidence Scan
- 현재 확인된 근거:
- 5년 내 변화를 뒷받침하는 신호:
- 근거 수준이 낮은 가정:

## Opening Views
### ${nameA} · 1차 주장
현재 기술 수준과 5년 내 변화 전망을 함께 포함해 3~6문장으로 발언하세요. 지금 가능한 것과 5년 후 가능할 것을 구분하세요.

### ${nameB} · 1차 주장
현재 고객 행동과 5년 후 고객 변화를 함께 포함해 3~6문장으로 발언하세요. 지금의 수용성과 미래 수용성을 구분하세요.

### ${nameC} · 1차 주장
현재 사업 구조와 5년 후 시장 변화를 함께 포함해 3~6문장으로 발언하세요. 지금 시작해서 5년 후 도달할 수 있는 위치를 제시하세요.

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
중립 진행자로서 토론을 종합한 결론. 현재 판단과 5년 후 전망을 모두 포함하세요.

### 현재 판단
지금 이 시점에서 가장 중요한 사실과 판단.

### 5년 전망
5년 후 이 주제가 어떤 상태에 있을지, 지금과 무엇이 달라질지.

### 다음 실행안
1. 지금 즉시 할 수 있는 것
2. 6~12개월 내 준비할 것
3. 5년을 바라보고 지금부터 쌓아야 할 것

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
  // Match conclusion section for both Feasibility (Szg Synthesis / 최종 결론) and Creative Idea (Synergy Synthesis)
  const conclusionMarker = markdown.match(/^##\s+(최종 결론|Szg Synthesis|Trinity Synthesis|Synergy Synthesis)[^\n]*/m);
  const debateText = conclusionMarker ? markdown.slice(0, conclusionMarker.index).trim() : markdown.trim();
  const conclusion = conclusionMarker ? markdown.slice(conclusionMarker.index).trim() : markdown.trim();

  const turns: DebateTurn[] = [];
  // Match any ### AgentName · Label heading (not limited to specific round labels)
  const headingPattern = /^###\s+(.+?)\s+·\s+(.+?)\s*$/gm;
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
  // Feasibility mode labels
  if (label === "상호 반박") return "rebuttal";
  if (label === "최종 입장") return "final";
  // Creative Idea mode labels: '기술로 보완', '고객으로 보완', '사업으로 보완'
  if (label.includes("보완")) return "rebuttal";
  // Default: '1차 주장', '기술 탐색', '고객 공감', '사업 설계', etc.
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
