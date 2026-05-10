import type { Agent, ChatMessage } from "./types";

type GenerateInput = {
  agent: Pick<
    Agent,
    | "provider"
    | "model"
    | "temperature"
    | "systemPrompt"
    | "knowledge"
    | "description"
    | "tone"
    | "debateStyle"
    | "judgmentCriteria"
    | "debateBehavior"
    | "responseTemplate"
    | "challengeRules"
    | "evidenceRules"
    | "scorecard"
    | "knowledgeSources"
  >;
  messages: ChatMessage[];
};

type StreamInput = GenerateInput & {
  onToken: (token: string) => void | Promise<void>;
};

export async function generateText({ agent, messages }: GenerateInput): Promise<string> {
  if (agent.provider === "github") {
    return generateWithGitHub(agent, messages);
  }

  return generateWithGemini(agent, messages);
}

export async function streamText({ agent, messages, onToken }: StreamInput): Promise<string> {
  if (agent.provider === "github") {
    return streamWithGitHub(agent, messages, onToken);
  }

  return streamWithGemini(agent, messages, onToken);
}

function fullSystemPrompt(agent: GenerateInput["agent"]): string {
  const knowledgeSourceText =
    "knowledgeSources" in agent && Array.isArray(agent.knowledgeSources) && agent.knowledgeSources.length > 0
      ? agent.knowledgeSources
          .slice()
          .sort((a, b) => a.priority - b.priority || a.title.localeCompare(b.title))
          .slice(0, 8)
          .map(
            (source) => {
              const chunks =
                source.chunks && source.chunks.length > 0
                  ? `\n  Matched chunks:\n${source.chunks
                      .map((chunk) => `  - Chunk ${chunk.chunkIndex + 1}: ${chunk.content.slice(0, 700)}`)
                      .join("\n")}`
                  : "";
              return `- [${source.reliability} / P${source.priority}] ${source.title} (${source.sourceType})\n  ${source.summary}\n  URL: ${source.url}\n  Tags: ${source.tags.join(", ")}${chunks}`;
            }
          )
          .join("\n")
      : "No curated source summaries are currently linked.";

  return `${agent.systemPrompt}

Description:
${agent.description}

Tone:
${agent.tone}

Debate Style:
${agent.debateStyle}

Knowledge Pack:
${agent.knowledge}

Curated Knowledge Sources:
${knowledgeSourceText}

Judgment Criteria:
${agent.judgmentCriteria}

Debate Behavior:
${agent.debateBehavior}

Response Template:
${agent.responseTemplate}

Challenge Rules:
${agent.challengeRules}

Evidence Rules:
${agent.evidenceRules}

Scorecard:
${agent.scorecard}

When answering:
- Follow the response template unless the user asks for a different format.
- Separate evidence-backed statements from assumptions.
- Include Evidence Level, Missing Evidence, and Next Validation when relevant.
- Use the scorecard when making a recommendation or trade-off judgment.`.trim();
}

function geminiPayload(agent: GenerateInput["agent"], messages: ChatMessage[]) {
  return {
    systemInstruction: {
      parts: [{ text: fullSystemPrompt(agent) }]
    },
    contents: messages
      .filter((message) => message.role !== "system")
      .map((message) => ({
        role: message.role === "assistant" ? "model" : "user",
        parts: [{ text: message.content }]
      })),
    generationConfig: {
      temperature: agent.temperature
    }
  };
}

async function generateWithGemini(agent: GenerateInput["agent"], messages: ChatMessage[]): Promise<string> {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) {
    throw new Error("GEMINI_API_KEY가 설정되어 있지 않습니다. .env.local에 API 키를 추가하세요.");
  }

  const models = [agent.model, process.env.GEMINI_FALLBACK_MODEL, "gemini-2.5-flash"].filter(
    (model, index, list): model is string => Boolean(model) && list.indexOf(model) === index
  );

  let lastError = "";
  for (const model of models) {
    for (let attempt = 0; attempt < 3; attempt += 1) {
      const res = await fetch(
        `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${apiKey}`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(geminiPayload(agent, messages))
        }
      );

      if (res.ok) {
        const data = (await res.json()) as {
          candidates?: Array<{ content?: { parts?: Array<{ text?: string }> } }>;
        };
        const text = data.candidates?.[0]?.content?.parts?.map((part) => part.text ?? "").join("\n").trim();
        if (!text) throw new Error("Gemini API 응답이 비어 있습니다.");
        return text;
      }

      const text = await res.text();
      lastError = `Gemini API 오류 (${res.status}, model: ${model}): ${text}`;
      if (res.status === 429 && isQuotaExhausted(text)) break;
      if (res.status !== 429 && res.status !== 503) break;
      await delay(900 * 2 ** attempt);
    }
  }

  throw new Error(lastError || "Gemini API 호출에 실패했습니다.");
}

async function streamWithGemini(
  agent: GenerateInput["agent"],
  messages: ChatMessage[],
  onToken: StreamInput["onToken"]
): Promise<string> {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) {
    throw new Error("GEMINI_API_KEY가 설정되어 있지 않습니다. .env.local에 API 키를 추가하세요.");
  }

  const models = [agent.model, process.env.GEMINI_FALLBACK_MODEL, "gemini-2.5-flash"].filter(
    (model, index, list): model is string => Boolean(model) && list.indexOf(model) === index
  );

  let lastError = "";
  for (const model of models) {
    const res = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/${model}:streamGenerateContent?alt=sse&key=${apiKey}`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(geminiPayload(agent, messages))
      }
    );

    if (!res.ok || !res.body) {
      const text = await res.text();
      lastError = `Gemini API 오류 (${res.status}, model: ${model}): ${text}`;
      if (res.status === 429 && isQuotaExhausted(text)) continue;
      if (res.status === 503) continue;
      break;
    }

    return readGeminiSse(res.body, onToken);
  }

  throw new Error(lastError || "Gemini API 스트리밍 호출에 실패했습니다.");
}

function isQuotaExhausted(text: string) {
  return (
    text.includes("RESOURCE_EXHAUSTED") ||
    text.includes("GenerateRequestsPerDayPerProjectPerModel-FreeTier") ||
    text.includes("exceeded your current quota")
  );
}

async function generateWithGitHub(agent: GenerateInput["agent"], messages: ChatMessage[]): Promise<string> {
  const token = process.env.GITHUB_TOKEN;
  if (!token) {
    throw new Error("GITHUB_TOKEN이 설정되어 있지 않습니다. .env.local에 GitHub token을 추가하세요.");
  }

  const res = await fetch("https://models.github.ai/inference/chat/completions", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${token}`
    },
    body: JSON.stringify({
      model: agent.model,
      temperature: agent.temperature,
      messages: [
        { role: "system", content: fullSystemPrompt(agent) },
        ...messages.map((message) => ({ role: message.role, content: message.content }))
      ]
    })
  });

  if (!res.ok) {
    const text = await res.text();
    throw new Error(`GitHub Models API 오류 (${res.status}): ${text}`);
  }

  const data = (await res.json()) as { choices?: Array<{ message?: { content?: string } }> };
  const text = data.choices?.[0]?.message?.content?.trim();
  if (!text) throw new Error("GitHub Models API 응답이 비어 있습니다.");
  return text;
}

async function streamWithGitHub(
  agent: GenerateInput["agent"],
  messages: ChatMessage[],
  onToken: StreamInput["onToken"]
): Promise<string> {
  const token = process.env.GITHUB_TOKEN;
  if (!token) {
    throw new Error("GITHUB_TOKEN이 설정되어 있지 않습니다. .env.local에 GitHub token을 추가하세요.");
  }

  const res = await fetch("https://models.github.ai/inference/chat/completions", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${token}`
    },
    body: JSON.stringify({
      model: agent.model,
      temperature: agent.temperature,
      stream: true,
      messages: [
        { role: "system", content: fullSystemPrompt(agent) },
        ...messages.map((message) => ({ role: message.role, content: message.content }))
      ]
    })
  });

  if (!res.ok || !res.body) {
    const text = await res.text();
    throw new Error(`GitHub Models API 오류 (${res.status}): ${text}`);
  }

  return readOpenAiSse(res.body, onToken);
}

async function readGeminiSse(body: ReadableStream<Uint8Array>, onToken: StreamInput["onToken"]) {
  let answer = "";
  await readSse(body, async (data) => {
    const parsed = JSON.parse(data) as {
      candidates?: Array<{ content?: { parts?: Array<{ text?: string }> } }>;
    };
    const token = parsed.candidates?.[0]?.content?.parts?.map((part) => part.text ?? "").join("") ?? "";
    if (!token) return;
    answer += token;
    await onToken(token);
  });
  return answer.trim();
}

async function readOpenAiSse(body: ReadableStream<Uint8Array>, onToken: StreamInput["onToken"]) {
  let answer = "";
  await readSse(body, async (data) => {
    if (data === "[DONE]") return;
    const parsed = JSON.parse(data) as { choices?: Array<{ delta?: { content?: string } }> };
    const token = parsed.choices?.[0]?.delta?.content ?? "";
    if (!token) return;
    answer += token;
    await onToken(token);
  });
  return answer.trim();
}

async function readSse(body: ReadableStream<Uint8Array>, onData: (data: string) => Promise<void>) {
  const reader = body.getReader();
  const decoder = new TextDecoder();
  let buffer = "";

  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    buffer += decoder.decode(value, { stream: true });
    const events = buffer.split("\n\n");
    buffer = events.pop() ?? "";

    for (const event of events) {
      for (const line of event.split("\n")) {
        if (!line.startsWith("data:")) continue;
        const data = line.slice(5).trim();
        if (data) await onData(data);
      }
    }
  }

  if (buffer.trim()) {
    for (const line of buffer.split("\n")) {
      if (!line.startsWith("data:")) continue;
      const data = line.slice(5).trim();
      if (data) await onData(data);
    }
  }
}

function delay(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
