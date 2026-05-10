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
  onToken: (token: string) => void | Promise<void>
) {
  const moderator = {
    provider: agents[0]?.provider ?? "gemini",
    model: agents[0]?.model ?? "gemini-2.5-flash-lite",
    temperature: 0.45,
    systemPrompt:
      "당신은 세 AI 페르소나의 토론을 진행하고 종합하는 중립 진행자입니다. 각 페르소나의 관점을 분리해서 충실히 시뮬레이션하되, 최종 결론은 실행 가능하게 정리하세요.",
    description: "Trinity Debate의 중립 진행자입니다.",
    tone: "명확하고 실행 중심",
    debateStyle: "균형형",
    knowledge: "출력은 사용자가 실시간으로 읽는 Markdown 토론문입니다.",
    judgmentCriteria: "기술 가능성, 고객 가치, 사업 실행성을 균형 있게 종합합니다.",
    debateBehavior: "각 페르소나의 충돌 지점을 드러내고 Szg Synthesis로 정렬합니다."
  } satisfies Parameters<typeof streamText>[0]["agent"];

  const markdown = await streamText({
    agent: moderator,
    messages: [{ role: "user", content: buildStreamingDebatePrompt(question, agents) }],
    onToken
  });

  return parseMarkdownDebate(markdown, agents);
}

function buildStreamingDebatePrompt(question: string, agents: Agent[]) {
  const [a, b, c] = agents;
  const nameA = a?.name ?? "Agent 1";
  const nameB = b?.name ?? "Agent 2";
  const nameC = c?.name ?? "Agent 3";

  return `질문: ${question}

아래 3개의 AI 페르소나가 토론한다고 가정하세요.
${agents
  .map(
    (agent) => `- id: ${agent.id}
  name: ${agent.name}
  role: ${agent.role}
  personaType: ${agent.personaType}
  description: ${agent.description}
  tone: ${agent.tone}
  debateStyle: ${agent.debateStyle}
  systemPrompt: ${agent.systemPrompt}
  knowledgePack: ${agent.knowledge}
  judgmentCriteria: ${agent.judgmentCriteria}
  debateBehavior: ${agent.debateBehavior}`
  )
  .join("\n")}

Markdown만 출력하세요. JSON이나 코드블록은 쓰지 마세요.
반드시 아래 형식을 그대로 사용하세요. AI 이름은 위 페르소나 이름을 그대로 사용하세요.

## 토론 과정
### ${nameA} · 1차 주장
직접 말하는 자연스러운 발언 3~6문장.

### ${nameB} · 1차 주장
직접 말하는 자연스러운 발언 3~6문장.

### ${nameC} · 1차 주장
직접 말하는 자연스러운 발언 3~6문장.

### ${nameA} · 상호 반박
이전 발언을 지칭하며 동의, 반박, 보완하는 발언 3~6문장.

### ${nameB} · 상호 반박
이전 발언을 지칭하며 동의, 반박, 보완하는 발언 3~6문장.

### ${nameC} · 상호 반박
이전 발언을 지칭하며 동의, 반박, 보완하는 발언 3~6문장.

### ${nameA} · 최종 입장
최종 입장 3~5문장.

### ${nameB} · 최종 입장
최종 입장 3~5문장.

### ${nameC} · 최종 입장
최종 입장 3~5문장.

## 최종 결론
중립 진행자로서 토론을 종합한 결론.

### 판단 근거
- 핵심 근거
- 합의점
- 남은 리스크

### 다음 실행안
1. 첫 번째 실행안
2. 두 번째 실행안
3. 세 번째 실행안`;
}

async function runSingleCallDebate(question: string, agents: Agent[]) {
  const moderator = {
    provider: agents[0]?.provider ?? "gemini",
    model: agents[0]?.model ?? "gemini-2.5-flash-lite",
    temperature: 0.45,
    systemPrompt:
      "당신은 세 AI 페르소나의 토론을 진행하고 종합하는 중립 진행자입니다. 각 페르소나의 관점을 분리해서 충실히 시뮬레이션하되, 최종 결론은 실행 가능하게 정리하세요.",
    description: "Trinity Debate의 중립 진행자입니다.",
    tone: "명확하고 실행 중심",
    debateStyle: "균형형",
    knowledge: "무료 LLM API quota를 아끼기 위해 전체 토론을 한 번의 응답 안에서 생성합니다.",
    judgmentCriteria: "기술 가능성, 고객 가치, 사업 실행성을 균형 있게 종합합니다.",
    debateBehavior: "각 페르소나의 충돌 지점을 드러내고 Szg Synthesis로 정렬합니다."
  } satisfies Parameters<typeof generateText>[0]["agent"];

  const response = await generateText({
    agent: moderator,
    messages: [
      {
        role: "user",
        content: `질문: ${question}

아래 3개의 AI 페르소나가 토론한다고 가정하세요.
${agents
  .map(
    (agent) => `- id: ${agent.id}
  name: ${agent.name}
  role: ${agent.role}
  personaType: ${agent.personaType}
  description: ${agent.description}
  tone: ${agent.tone}
  debateStyle: ${agent.debateStyle}
  systemPrompt: ${agent.systemPrompt}
  knowledgePack: ${agent.knowledge}
  judgmentCriteria: ${agent.judgmentCriteria}
  debateBehavior: ${agent.debateBehavior}`
  )
  .join("\n")}

토론 과정은 보고서 요약이 아니라 실제 회의 대화처럼 작성하세요.
- 각 content는 해당 AI가 직접 말하는 자연스러운 발언이어야 합니다.
- "핵심 주장:", "근거:" 같은 문서형 소제목은 content 안에 넣지 마세요.
- 서로의 이전 발언을 짧게 인용하거나 지칭하면서 동의, 반박, 보완하세요.
- 각 발언은 3~6문장으로 제한하세요.

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
  "conclusion": "## 최종 결론\\n...\\n## 판단 근거\\n...\\n## 다음 실행안\\n..."
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
    description: "Szg Synthesis를 작성하는 중립 진행자입니다.",
    tone: "간결하고 실무적인 보고형",
    debateStyle: "균형형",
    knowledge: "결론은 개인용 MVP 의사결정에 바로 쓸 수 있어야 합니다.",
    judgmentCriteria: "기술 가능성, 고객 가치, 사업 실행성",
    debateBehavior: "합의점, 이견, 실행 조건을 분리합니다."
  } satisfies Parameters<typeof generateText>[0]["agent"];

  const conclusion = await generateText({
    agent: moderator,
    messages: [
      {
        role: "user",
        content: `질문: ${question}\n\n토론 전체:\n${formatTurns(turns)}\n\n다음 형식으로 최종 결론을 작성하세요.\n\n## 핵심 결론\n## 관점별 요약\n## 합의점\n## 남은 이견과 리스크\n## 다음 실행안`
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
