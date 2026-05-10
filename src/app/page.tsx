"use client";

import { FormEvent, useEffect, useMemo, useState } from "react";
import type { Agent, ChatMessage, ConversationResult, DebateResult, Provider, RecentItem } from "@/lib/types";

type Tab = "admin" | "chat" | "debate";
type DebateMode =
  | "Balanced Debate"
  | "Critical Review"
  | "Opportunity Discovery"
  | "Execution Planning"
  | "Investment Review"
  | "C-Level Briefing";
type DebateDepth = "Quick" | "Standard" | "Deep";
type OutputType =
  | "Executive Summary"
  | "Decision Memo"
  | "Action Plan"
  | "Risk Review"
  | "Product Concept"
  | "Strategy Canvas";

export default function Home() {
  const [tab, setTab] = useState<Tab>("debate");
  const [agents, setAgents] = useState<Agent[]>([]);
  const [selectedAgentId, setSelectedAgentId] = useState("tech");
  const [selectedStudioAgentId, setSelectedStudioAgentId] = useState("tech");
  const [debateMode, setDebateMode] = useState<DebateMode>("Balanced Debate");
  const [debateDepth, setDebateDepth] = useState<DebateDepth>("Standard");
  const [outputType, setOutputType] = useState<OutputType>("Decision Memo");
  const [chatInput, setChatInput] = useState("");
  const [chatMessages, setChatMessages] = useState<ChatMessage[]>([]);
  const [conversationId, setConversationId] = useState<number | undefined>();
  const [question, setQuestion] = useState("");
  const [debate, setDebate] = useState<DebateResult | null>(null);
  const [debateDraft, setDebateDraft] = useState("");
  const [recents, setRecents] = useState<RecentItem[]>([]);
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const [notice, setNotice] = useState("");

  const selectedAgent = useMemo(
    () => agents.find((agent) => agent.id === selectedAgentId) ?? agents[0],
    [agents, selectedAgentId]
  );
  const selectedStudioAgent = useMemo(
    () => agents.find((agent) => agent.id === selectedStudioAgentId) ?? agents[0],
    [agents, selectedStudioAgentId]
  );

  useEffect(() => {
    fetch("/api/agents")
      .then((res) => res.json())
      .then((data: { agents: Agent[] }) => {
        setAgents(data.agents);
        setSelectedAgentId(data.agents[0]?.id ?? "tech");
        setSelectedStudioAgentId(data.agents[0]?.id ?? "tech");
      })
      .catch((error: Error) => setNotice(error.message));
    loadRecents();
  }, []);

  async function loadRecents() {
    try {
      const res = await fetch("/api/recents");
      const data = (await res.json()) as { recents?: RecentItem[]; error?: string };
      if (!res.ok) throw new Error(data.error ?? "최근 항목을 불러오지 못했습니다.");
      setRecents(data.recents ?? []);
    } catch (error) {
      setNotice(error instanceof Error ? error.message : "최근 항목을 불러오지 못했습니다.");
    }
  }

  function patchAgent(id: string, patch: Partial<Agent>) {
    setAgents((current) => current.map((agent) => (agent.id === id ? { ...agent, ...patch } : agent)));
  }

  async function saveAgents() {
    setLoading(true);
    setNotice("");
    try {
      const res = await fetch("/api/agents", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ agents })
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "저장 실패");
      setAgents(data.agents);
      setNotice("Admin 설정을 저장했습니다.");
    } catch (error) {
      setNotice(error instanceof Error ? error.message : "저장 실패");
    } finally {
      setLoading(false);
    }
  }

  async function submitChat(event: FormEvent) {
    event.preventDefault();
    if (!selectedAgent || !chatInput.trim()) return;

    const nextMessages = [...chatMessages, { role: "user", content: chatInput.trim() } satisfies ChatMessage];
    setChatMessages([...nextMessages, { role: "assistant", content: "" }]);
    setChatInput("");
    setLoading(true);
    setNotice("");

    try {
      const res = await fetch("/api/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          agentId: selectedAgent.id,
          message: chatInput.trim(),
          history: chatMessages,
          conversationId
        })
      });
      if (!res.ok || !res.body) {
        const data = await res.json().catch(() => ({ error: "응답 생성 실패" }));
        throw new Error(data.error ?? "응답 생성 실패");
      }

      const nextConversationId = res.headers.get("X-Conversation-Id");
      if (nextConversationId) setConversationId(Number(nextConversationId));

      const reader = res.body.getReader();
      const decoder = new TextDecoder();
      let answer = "";

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        answer += decoder.decode(value, { stream: true });
        setChatMessages([...nextMessages, { role: "assistant", content: answer }]);
      }

      answer += decoder.decode();
      setChatMessages([...nextMessages, { role: "assistant", content: answer }]);
      await loadRecents();
    } catch (error) {
      setChatMessages(nextMessages);
      setNotice(error instanceof Error ? error.message : "응답 생성 실패");
    } finally {
      setLoading(false);
    }
  }

  async function submitDebate(event: FormEvent) {
    event.preventDefault();
    if (!question.trim()) return;

    setLoading(true);
    setNotice("토론을 진행 중입니다. 무료 API 상태에 따라 시간이 걸릴 수 있습니다.");
    setDebate(null);
    setDebateDraft("");

    try {
      const res = await fetch("/api/debate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ question, debateMode, debateDepth, outputType })
      });
      if (!res.ok || !res.body) {
        const data = await res.json().catch(() => ({ error: "토론 실패" }));
        throw new Error(data.error ?? "토론 실패");
      }

      let draft = "";
      let finalDebate: DebateResult | null = null;
      await readEventStream(res.body, {
        token: (token) => {
          draft += token;
          setDebateDraft(draft);
        },
        done: (value) => {
          finalDebate = value as DebateResult;
        },
        error: (value) => {
          throw new Error(String(value));
        }
      });

      if (!finalDebate) throw new Error("토론 결과를 저장하지 못했습니다.");
      setDebate(finalDebate);
      setDebateDraft("");
      await loadRecents();
      setNotice("토론이 완료되었습니다.");
    } catch (error) {
      setNotice(error instanceof Error ? error.message : "토론 실패");
    } finally {
      setLoading(false);
    }
  }

  function newDiscussion() {
    setTab("debate");
    setQuestion("");
    setDebate(null);
    setDebateDraft("");
    setNotice("");
  }

  async function openRecent(item: RecentItem) {
    setLoading(true);
    setNotice("");
    try {
      if (item.kind === "discussion") {
        const res = await fetch(`/api/debates/${item.id}`);
        const data = (await res.json()) as { debate?: DebateResult; error?: string };
        if (!res.ok || !data.debate) throw new Error(data.error ?? "토론을 불러오지 못했습니다.");
        setTab("debate");
        setDebate(data.debate);
        setDebateDraft("");
        setQuestion(data.debate.question);
      } else {
        const res = await fetch(`/api/conversations/${item.id}`);
        const data = (await res.json()) as { conversation?: ConversationResult; error?: string };
        if (!res.ok || !data.conversation) throw new Error(data.error ?? "채팅을 불러오지 못했습니다.");
        setTab("chat");
        setSelectedAgentId(data.conversation.agentId);
        setConversationId(data.conversation.id);
        setChatMessages(data.conversation.messages.filter((message) => message.role !== "system"));
      }
    } catch (error) {
      setNotice(error instanceof Error ? error.message : "최근 항목을 불러오지 못했습니다.");
    } finally {
      setLoading(false);
    }
  }

  return (
    <main className={`shell ${sidebarOpen ? "withSidebar" : ""}`}>
      <header className="topbar">
        <button
          className="menuButton"
          type="button"
          aria-label="메뉴 열기"
          aria-expanded={sidebarOpen}
          onClick={() => setSidebarOpen((open) => !open)}
        >
          <span />
          <span />
          <span />
        </button>
        <div className="brand">
          <p className="eyebrow">One question. Three minds. One aligned decision.</p>
          <h1>Trinity SZG</h1>
        </div>
      </header>

      {sidebarOpen ? (
        <aside className="drawer open" aria-label="History menu">
          <div className="drawerHeader">
            <strong>History</strong>
            <button className="drawerClose" type="button" aria-label="메뉴 닫기" onClick={() => setSidebarOpen(false)}>
              ×
            </button>
          </div>
          <nav className="drawerNav">
            <button className={tab === "debate" && !debate ? "active" : ""} onClick={newDiscussion}>
              Trinity Debate
            </button>
            <button
              className={tab === "chat" ? "active" : ""}
              onClick={() => {
                setTab("chat");
              }}
            >
              Solo Lens
            </button>
            <button
              className={tab === "admin" ? "active" : ""}
              onClick={() => {
                setTab("admin");
              }}
            >
              Persona Studio
            </button>
          </nav>
          <div className="recents">
            <div className="recentsHead">
                <span>Decision Archive</span>
              <button type="button" onClick={loadRecents} disabled={loading}>
                새로고침
              </button>
            </div>
            <div className="recentList">
              {recents.length === 0 ? (
                <p className="emptySmall">저장된 항목이 없습니다.</p>
              ) : (
                recents.map((item) => (
                  <button className="recentItem" key={`${item.kind}-${item.id}`} onClick={() => openRecent(item)}>
                    <span className={`badge ${item.kind}`}>{item.kind === "discussion" ? "Discussion" : "Chat"}</span>
                    <strong>{recentTitle(item)}</strong>
                    <span>
                      {formatDate(item.createdAt)} · {recentMeta(item)}
                    </span>
                  </button>
                ))
              )}
            </div>
          </div>
        </aside>
      ) : null}

      {notice ? <div className="notice">{notice}</div> : null}

      {tab === "admin" ? (
        <section className="stack">
          <div className="sectionHead">
            <div>
              <p className="eyebrow">Persona Studio</p>
              <h2>AI 사고방식 설계</h2>
            </div>
            <button className="primary" onClick={saveAgents} disabled={loading}>
              Save Persona
            </button>
          </div>
          <div className="studioLayout">
            <aside className="personaList panel">
              {agents.map((agent) => (
                <button
                  className={selectedStudioAgentId === agent.id ? "personaItem active" : "personaItem"}
                  key={agent.id}
                  onClick={() => setSelectedStudioAgentId(agent.id)}
                >
                  <strong>{agent.name}</strong>
                  <span>{agent.personaType}</span>
                </button>
              ))}
            </aside>
            {selectedStudioAgent ? (
              <article className="panel studioPanel">
                <section>
                  <h3>Basic Profile</h3>
                  <div className="twoCols">
                    <label>
                      AI Name
                      <input
                        value={selectedStudioAgent.name}
                        onChange={(event) => patchAgent(selectedStudioAgent.id, { name: event.target.value })}
                      />
                    </label>
                    <label>
                      Persona Type
                      <input
                        value={selectedStudioAgent.personaType}
                        onChange={(event) => patchAgent(selectedStudioAgent.id, { personaType: event.target.value })}
                      />
                    </label>
                  </div>
                  <label>
                    Description
                    <textarea
                      rows={3}
                      value={selectedStudioAgent.description}
                      onChange={(event) => patchAgent(selectedStudioAgent.id, { description: event.target.value })}
                    />
                  </label>
                  <div className="twoCols">
                    <label>
                      Tone
                      <input
                        value={selectedStudioAgent.tone}
                        onChange={(event) => patchAgent(selectedStudioAgent.id, { tone: event.target.value })}
                      />
                    </label>
                    <label>
                      Debate Style
                      <input
                        value={selectedStudioAgent.debateStyle}
                        onChange={(event) => patchAgent(selectedStudioAgent.id, { debateStyle: event.target.value })}
                      />
                    </label>
                  </div>
                  <div className="twoCols">
                    <label>
                      Provider
                      <select
                        value={selectedStudioAgent.provider}
                        onChange={(event) => patchAgent(selectedStudioAgent.id, { provider: event.target.value as Provider })}
                      >
                        <option value="gemini">Gemini</option>
                        <option value="github">GitHub Models</option>
                      </select>
                    </label>
                    <label>
                      Temperature
                      <input
                        type="number"
                        min="0"
                        max="1"
                        step="0.05"
                        value={selectedStudioAgent.temperature}
                        onChange={(event) => patchAgent(selectedStudioAgent.id, { temperature: Number(event.target.value) })}
                      />
                    </label>
                  </div>
                  <label>
                    Model
                    <input
                      value={selectedStudioAgent.model}
                      onChange={(event) => patchAgent(selectedStudioAgent.id, { model: event.target.value })}
                    />
                  </label>
                </section>

                <section>
                  <h3>System Prompt Editor</h3>
                  <textarea
                    rows={9}
                    value={selectedStudioAgent.systemPrompt}
                    onChange={(event) => patchAgent(selectedStudioAgent.id, { systemPrompt: event.target.value })}
                  />
                </section>

                <section>
                  <h3>Knowledge Pack</h3>
                  <textarea
                    rows={6}
                    value={selectedStudioAgent.knowledge}
                    onChange={(event) => patchAgent(selectedStudioAgent.id, { knowledge: event.target.value })}
                  />
                </section>

                <section className="twoCols">
                  <label>
                    Judgment Criteria
                    <textarea
                      rows={8}
                      value={selectedStudioAgent.judgmentCriteria}
                      onChange={(event) => patchAgent(selectedStudioAgent.id, { judgmentCriteria: event.target.value })}
                    />
                  </label>
                  <label>
                    Debate Behavior
                    <textarea
                      rows={8}
                      value={selectedStudioAgent.debateBehavior}
                      onChange={(event) => patchAgent(selectedStudioAgent.id, { debateBehavior: event.target.value })}
                    />
                  </label>
                </section>
              </article>
            ) : null}
          </div>
        </section>
      ) : null}

      {tab === "chat" ? (
        <section className="stack">
          <div className="lensHeader panel">
            <div>
              <p className="eyebrow">Solo Lens</p>
              <h2>{selectedAgent?.name ?? "Select Agent"}</h2>
              <p>{selectedAgent?.description}</p>
            </div>
            <div className="lensMeta">
              <span>Knowledge Pack: {selectedAgent?.knowledge.split("\n")[0]}</span>
              <span>Response Style: {selectedAgent?.tone}</span>
            </div>
          </div>
          <section className="workspace">
          <aside className="side">
            {agents.map((agent) => (
              <button
                className={selectedAgentId === agent.id ? "agent active" : "agent"}
                key={agent.id}
                onClick={() => {
                  setSelectedAgentId(agent.id);
                  setChatMessages([]);
                  setConversationId(undefined);
                }}
              >
                <strong>{agent.name}</strong>
                <span>{agent.role}</span>
              </button>
            ))}
          </aside>
          <div className="panel chatPanel">
            <div className="chatLog">
              {chatMessages.length === 0 ? (
                <p className="empty">{selectedAgent?.name ?? "AI"}와 대화를 시작하세요.</p>
              ) : (
                chatMessages.map((message, index) => (
                  <div className={`bubble ${message.role}`} key={`${message.role}-${index}`}>
                    {message.role === "assistant" ? <Markdownish text={message.content || "…"} /> : message.content}
                  </div>
                ))
              )}
            </div>
            <form className="composer" onSubmit={submitChat}>
              <input
                value={chatInput}
                onChange={(event) => setChatInput(event.target.value)}
                placeholder="Ask This Agent"
              />
              <button className="primary" disabled={loading || !chatInput.trim()}>
                Ask This Agent
              </button>
            </form>
          </div>
          </section>
        </section>
      ) : null}

      {tab === "debate" ? (
        <section className="stack">
          <div className="debateHeader panel">
            <div>
              <p className="eyebrow">Trinity Debate</p>
              <h2>{question || "Frame the Question"}</h2>
              <p>기술 가능성, 고객 가치, 사업 실행성을 동시에 검토합니다.</p>
            </div>
            <div className="debateMetaGrid">
              <label>
                Debate Mode
                <select value={debateMode} onChange={(event) => setDebateMode(event.target.value as DebateMode)}>
                  {[
                    "Balanced Debate",
                    "Critical Review",
                    "Opportunity Discovery",
                    "Execution Planning",
                    "Investment Review",
                    "C-Level Briefing"
                  ].map((item) => (
                    <option key={item}>{item}</option>
                  ))}
                </select>
              </label>
              <label>
                Depth
                <select value={debateDepth} onChange={(event) => setDebateDepth(event.target.value as DebateDepth)}>
                  {["Quick", "Standard", "Deep"].map((item) => (
                    <option key={item}>{item}</option>
                  ))}
                </select>
              </label>
              <label>
                Output Type
                <select value={outputType} onChange={(event) => setOutputType(event.target.value as OutputType)}>
                  {[
                    "Executive Summary",
                    "Decision Memo",
                    "Action Plan",
                    "Risk Review",
                    "Product Concept",
                    "Strategy Canvas"
                  ].map((item) => (
                    <option key={item}>{item}</option>
                  ))}
                </select>
              </label>
            </div>
          </div>
          <form className="questionBox" onSubmit={submitDebate}>
            <textarea
              rows={4}
              value={question}
              onChange={(event) => setQuestion(event.target.value)}
              placeholder="Frame the Question"
            />
            <button className="primary" disabled={loading || !question.trim()}>
              Start Debate
            </button>
          </form>

          {debateDraft ? (
            <section className="panel liveDebate">
              <div className="sectionHead">
                <h2>Live Synthesis</h2>
                <span className="meta">streaming</span>
              </div>
              <Markdownish text={debateDraft} />
            </section>
          ) : null}

          {debate ? (
            <div className="debateResult">
              <section className="panel debateTranscript">
                <div className="sectionHead">
                  <h2>Debate Timeline</h2>
                  <span className="meta">{debate.turns.length}개 발언</span>
                </div>
                <div className="transcriptList">
                  {debate.turns.map((turn, index) => (
                    <article className={`debateMessage ${turn.agentId}`} key={`${turn.agentId}-${turn.round}-${index}`}>
                      <div className="speaker">
                        <strong>{turn.agentName}</strong>
                        <span>{roundName(turn.round)}</span>
                      </div>
                      <Markdownish text={turn.content} />
                    </article>
                  ))}
                </div>
              </section>
              <section className="panel conclusion">
                <h2>Szg Synthesis</h2>
                <Markdownish text={debate.conclusion} />
              </section>
            </div>
          ) : null}
        </section>
      ) : null}
    </main>
  );
}

function formatDate(value: string) {
  return new Intl.DateTimeFormat("ko-KR", {
    month: "short",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit"
  }).format(new Date(value));
}

function recentTitle(item: RecentItem) {
  return item.kind === "discussion" ? item.question : item.title;
}

function recentMeta(item: RecentItem) {
  return item.kind === "discussion" ? `${item.turnCount}개 발언` : `${item.agentName} · ${item.messageCount}개 메시지`;
}

async function readEventStream(
  body: ReadableStream<Uint8Array>,
  handlers: {
    token?: (value: unknown) => void;
    done?: (value: unknown) => void;
    error?: (value: unknown) => void;
  }
) {
  const reader = body.getReader();
  const decoder = new TextDecoder();
  let buffer = "";

  async function processEvent(rawEvent: string) {
    const event = rawEvent
      .split("\n")
      .find((line) => line.startsWith("event:"))
      ?.slice(6)
      .trim();
    const data = rawEvent
      .split("\n")
      .filter((line) => line.startsWith("data:"))
      .map((line) => line.slice(5).trim())
      .join("\n");

    if (!event || !data) return;
    const value = JSON.parse(data) as unknown;
    if (event === "token") handlers.token?.(value);
    if (event === "done") handlers.done?.(value);
    if (event === "error") handlers.error?.(value);
  }

  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    buffer += decoder.decode(value, { stream: true });
    const events = buffer.split("\n\n");
    buffer = events.pop() ?? "";
    for (const event of events) await processEvent(event);
  }

  buffer += decoder.decode();
  if (buffer.trim()) await processEvent(buffer);
}

function roundName(round: DebateResult["turns"][number]["round"]) {
  if (round === "opening") return "1차 주장";
  if (round === "rebuttal") return "상호 반박";
  return "최종 입장";
}

function Markdownish({ text }: { text: string }) {
  const blocks = parseMarkdownBlocks(text);
  return <div className="markdownish">{blocks.map((block, index) => renderMarkdownBlock(block, index))}</div>;
}

type MarkdownBlock =
  | { type: "heading"; level: 3 | 4; text: string }
  | { type: "paragraph"; text: string }
  | { type: "ul"; items: string[] }
  | { type: "ol"; items: string[] };

function parseMarkdownBlocks(text: string): MarkdownBlock[] {
  const blocks: MarkdownBlock[] = [];
  const lines = text.replace(/\r\n/g, "\n").split("\n");
  let paragraph: string[] = [];
  let list: { type: "ul" | "ol"; items: string[] } | null = null;

  function flushParagraph() {
    if (paragraph.length === 0) return;
    blocks.push({ type: "paragraph", text: paragraph.join(" ") });
    paragraph = [];
  }

  function flushList() {
    if (!list) return;
    blocks.push(list);
    list = null;
  }

  for (const rawLine of lines) {
    const line = rawLine.trim();
    if (!line) {
      flushParagraph();
      flushList();
      continue;
    }

    const heading = line.match(/^(#{1,4})\s+(.+)$/);
    if (heading) {
      flushParagraph();
      flushList();
      blocks.push({ type: "heading", level: heading[1].length <= 2 ? 3 : 4, text: heading[2] });
      continue;
    }

    const unordered = line.match(/^[-*]\s+(.+)$/);
    if (unordered) {
      flushParagraph();
      if (!list || list.type !== "ul") {
        flushList();
        list = { type: "ul", items: [] };
      }
      list.items.push(unordered[1]);
      continue;
    }

    const ordered = line.match(/^\d+[.)]\s+(.+)$/);
    if (ordered) {
      flushParagraph();
      if (!list || list.type !== "ol") {
        flushList();
        list = { type: "ol", items: [] };
      }
      list.items.push(ordered[1]);
      continue;
    }

    flushList();
    paragraph.push(line);
  }

  flushParagraph();
  flushList();
  return blocks;
}

function renderMarkdownBlock(block: MarkdownBlock, key: number) {
  if (block.type === "heading") {
    const Heading = block.level === 3 ? "h3" : "h4";
    return <Heading key={key}>{renderInlineMarkdown(block.text)}</Heading>;
  }

  if (block.type === "ul") {
    return (
      <ul key={key}>
        {block.items.map((item, index) => (
          <li key={index}>{renderInlineMarkdown(item)}</li>
        ))}
      </ul>
    );
  }

  if (block.type === "ol") {
    return (
      <ol key={key}>
        {block.items.map((item, index) => (
          <li key={index}>{renderInlineMarkdown(item)}</li>
        ))}
      </ol>
    );
  }

  return <p key={key}>{renderInlineMarkdown(block.text)}</p>;
}

function renderInlineMarkdown(text: string) {
  const nodes: React.ReactNode[] = [];
  const pattern = /(\*\*[^*]+\*\*|`[^`]+`|\[[^\]]+\]\([^)]+\))/g;
  let lastIndex = 0;
  let match: RegExpExecArray | null;

  while ((match = pattern.exec(text)) !== null) {
    if (match.index > lastIndex) nodes.push(text.slice(lastIndex, match.index));

    const token = match[0];
    if (token.startsWith("**")) {
      nodes.push(<strong key={nodes.length}>{token.slice(2, -2)}</strong>);
    } else if (token.startsWith("`")) {
      nodes.push(<code key={nodes.length}>{token.slice(1, -1)}</code>);
    } else {
      const link = token.match(/^\[([^\]]+)\]\(([^)]+)\)$/);
      if (link) {
        nodes.push(
          <a key={nodes.length} href={link[2]} target="_blank" rel="noreferrer">
            {link[1]}
          </a>
        );
      }
    }

    lastIndex = pattern.lastIndex;
  }

  if (lastIndex < text.length) nodes.push(text.slice(lastIndex));
  return nodes;
}
