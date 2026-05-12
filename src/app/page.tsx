"use client";

import { FormEvent, KeyboardEvent, useEffect, useMemo, useRef, useState } from "react";
import type { Agent, ChatMessage, ConversationResult, DebateInsight, DebateInsightStatus, DebateResult, KnowledgeSource, Provider, RecentItem } from "@/lib/types";

type SuperAnswerResult = {
  answerId: string;
  answerMarkdown: string;
  references: {
    knowledgeSources: Array<{ id: string; title: string; url: string }>;
    debateInsights: Array<{ id: string; title: string; insightType: string }>;
    agentOpinions: Array<{ id: string; claim: string; agentId: string }>;
  };
};

type Tab = "admin" | "chat" | "debate" | "future";
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
  const [personaTestInput, setPersonaTestInput] = useState("");
  const [personaTestOutput, setPersonaTestOutput] = useState("");
  const [sourceQuery, setSourceQuery] = useState("");
  const [manualContentBySource, setManualContentBySource] = useState<Record<number, string>>({});
  const [sourceForm, setSourceForm] = useState({
    title: "",
    url: "",
    sourceType: "external_source",
    reliability: "high" as KnowledgeSource["reliability"],
    priority: 2,
    summary: "",
    tags: ""
  });
  const [quickUrl, setQuickUrl] = useState("");
  const [fetchingPreview, setFetchingPreview] = useState(false);
  const [conversationId, setConversationId] = useState<number | undefined>();
  const [question, setQuestion] = useState("");
  const [debate, setDebate] = useState<DebateResult | null>(null);
  const [debateDraft, setDebateDraft] = useState("");
  const [debateInsights, setDebateInsights] = useState<DebateInsight[] | null>(null);
  const [extractingInsights, setExtractingInsights] = useState(false);

  // Future Life Agent
  const [superQuestion, setSuperQuestion] = useState("");
  const [superDomainId, setSuperDomainId] = useState("");
  const [superTimeHorizon, setSuperTimeHorizon] = useState<"1y" | "3y" | "5y" | "10y">("3y");
  const [superCustomerSegment, setSuperCustomerSegment] = useState("");
  const [superOutputType, setSuperOutputType] = useState("future_life_answer");
  const [superIncludeDebate, setSuperIncludeDebate] = useState(true);
  const [superIncludeOpinions, setSuperIncludeOpinions] = useState(false);
  const [superAnswer, setSuperAnswer] = useState<SuperAnswerResult | null>(null);
  const [superLoading, setSuperLoading] = useState(false);

  // Save as Agent Opinion
  const [opinionFormIndex, setOpinionFormIndex] = useState<number | null>(null);
  const [opinionClaim, setOpinionClaim] = useState("");
  const [opinionRationale, setOpinionRationale] = useState("");
  const [opinionConfidence, setOpinionConfidence] = useState<"high" | "medium" | "low">("medium");
  const [opinionTags, setOpinionTags] = useState("");
  const [opinionDomainId, setOpinionDomainId] = useState("");
  const [recents, setRecents] = useState<RecentItem[]>([]);
  const [sidebarOpen, setSidebarOpen] = useState(true);

  const futureFormRef = useRef<HTMLFormElement>(null);
  const debateFormRef = useRef<HTMLFormElement>(null);
  const personaTestFormRef = useRef<HTMLFormElement>(null);

  const SUPER_QUESTION_SUGGESTION = "2030년 AI Home은 한국 맞벌이 가구의 생활을 어떻게 바꿀까?";

  function enterSubmit(formRef: React.RefObject<HTMLFormElement | null>) {
    return (e: KeyboardEvent<HTMLTextAreaElement>) => {
      if (e.key === "Enter" && !e.shiftKey) {
        e.preventDefault();
        formRef.current?.requestSubmit();
      }
    };
  }

  function superQuestionKeyDown(e: KeyboardEvent<HTMLTextAreaElement>) {
    if (e.key === "Tab" && !superQuestion.trim()) {
      e.preventDefault();
      setSuperQuestion(SUPER_QUESTION_SUGGESTION);
      return;
    }
    enterSubmit(futureFormRef)(e);
  }
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
  const visibleStudioSources = useMemo(
    () => filterSources(selectedStudioAgent?.knowledgeSources ?? [], sourceQuery),
    [selectedStudioAgent?.knowledgeSources, sourceQuery]
  );

  useEffect(() => {
    loadAgents();
    loadRecents();
  }, []);

  async function loadAgents() {
    try {
      const res = await fetch("/api/agents");
      const data = (await res.json()) as { agents?: Agent[]; error?: string };
      if (!res.ok || !data.agents) throw new Error(data.error ?? "AI 설정을 불러오지 못했습니다.");
      setAgents(data.agents);
      setSelectedAgentId((current) => current || data.agents?.[0]?.id || "tech");
      setSelectedStudioAgentId((current) => current || data.agents?.[0]?.id || "tech");
    } catch (error) {
      setNotice(error instanceof Error ? error.message : "AI 설정을 불러오지 못했습니다.");
    }
  }

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

  async function askAgent(agentId: string, message: string, history: ChatMessage[] = [], saveConversation = true) {
    const res = await fetch("/api/chat", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        agentId,
        message,
        history,
        conversationId: saveConversation ? conversationId : undefined,
        saveConversation
      })
    });
    if (!res.ok || !res.body) {
      const data = await res.json().catch(() => ({ error: "응답 생성 실패" }));
      throw new Error(data.error ?? "응답 생성 실패");
    }

    const reader = res.body.getReader();
    const decoder = new TextDecoder();
    let answer = "";
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      answer += decoder.decode(value, { stream: true });
    }

    answer += decoder.decode();
    return {
      answer,
      conversationId: res.headers.get("X-Conversation-Id")
    };
  }

  async function comparePerspectives() {
    const seed = latestUserQuestion(chatMessages) || chatInput.trim();
    if (!seed || agents.length === 0) return;

    setLoading(true);
    setNotice("다른 페르소나 관점을 비교 중입니다.");
    const baseMessages = chatMessages.length > 0 ? chatMessages : [{ role: "user", content: seed } satisfies ChatMessage];
    setChatMessages(baseMessages);

    try {
      const otherAgents = agents.filter((agent) => agent.id !== selectedAgentId);
      const answers: string[] = [];
      for (const agent of otherAgents) {
        const { answer } = await askAgent(agent.id, seed, [], false);
        answers.push(`## ${agent.name}\n${answer}`);
        setChatMessages([
          ...baseMessages,
          {
            role: "assistant",
            content: `# Compare Perspectives\n\n${answers.join("\n\n")}`
          }
        ]);
      }
      setNotice("관점 비교가 완료되었습니다.");
    } catch (error) {
      setNotice(error instanceof Error ? error.message : "관점 비교 실패");
    } finally {
      setLoading(false);
    }
  }

  function sendCurrentQuestionToDebate() {
    const seed = latestUserQuestion(chatMessages) || chatInput.trim();
    if (!seed) return;
    setQuestion(seed);
    setDebate(null);
    setDebateDraft("");
    setDebateInsights(null);
    setTab("debate");
    setNotice("Solo Lens 질문을 Trinity Debate로 보냈습니다.");
  }

  async function runPersonaTest(event: FormEvent) {
    event.preventDefault();
    if (!selectedStudioAgent || !personaTestInput.trim()) return;

    setLoading(true);
    setPersonaTestOutput("");
    setNotice("");
    try {
      const { answer } = await askAgent(selectedStudioAgent.id, personaTestInput.trim(), [], false);
      setPersonaTestOutput(answer);
    } catch (error) {
      setNotice(error instanceof Error ? error.message : "Persona Test 실패");
    } finally {
      setLoading(false);
    }
  }

  async function fetchUrlPreview(event: FormEvent) {
    event.preventDefault();
    const url = quickUrl.trim();
    if (!url) return;
    setFetchingPreview(true);
    setNotice("");
    try {
      const res = await fetch("/api/knowledge-sources/preview", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ url })
      });
      const data = (await res.json()) as {
        title?: string;
        summary?: string;
        tags?: string[];
        sourceType?: string;
        reliability?: KnowledgeSource["reliability"];
        error?: string;
      };
      if (!res.ok) throw new Error(data.error ?? "미리보기 실패");
      setSourceForm((current) => ({
        ...current,
        url,
        title: data.title || current.title,
        summary: data.summary || current.summary,
        sourceType: data.sourceType || current.sourceType,
        reliability: data.reliability ?? current.reliability,
        tags: data.tags?.join(", ") || current.tags
      }));
      setQuickUrl("");
    } catch (error) {
      setNotice(error instanceof Error ? error.message : "미리보기 실패");
    } finally {
      setFetchingPreview(false);
    }
  }

  async function addKnowledgeSource(event: FormEvent) {
    event.preventDefault();
    if (!selectedStudioAgent || !sourceForm.title.trim() || !sourceForm.url.trim() || !sourceForm.summary.trim()) return;

    setLoading(true);
    setNotice("");
    try {
      const res = await fetch("/api/knowledge-sources", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          agentId: selectedStudioAgent.id,
          ...sourceForm
        })
      });
      const data = (await res.json()) as { source?: KnowledgeSource; error?: string };
      if (!res.ok || !data.source) throw new Error(data.error ?? "Knowledge Source 저장 실패");
      setSourceForm({
        title: "",
        url: "",
        sourceType: "external_source",
        reliability: "high",
        priority: 2,
        summary: "",
        tags: ""
      });
      await loadAgents();
      setNotice("Knowledge Source를 저장했습니다.");
    } catch (error) {
      setNotice(error instanceof Error ? error.message : "Knowledge Source 저장 실패");
    } finally {
      setLoading(false);
    }
  }

  async function ingestKnowledgeSource(source: KnowledgeSource, mode: "fetch" | "manual") {
    const content = mode === "manual" ? manualContentBySource[source.id]?.trim() : "";
    if (mode === "manual" && !content) return;

    setLoading(true);
    setNotice("");
    try {
      const res = await fetch(`/api/knowledge-sources/${source.id}/ingest`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(mode === "manual" ? { content } : { fetchUrl: true })
      });
      const data = (await res.json()) as { source?: KnowledgeSource; error?: string };
      if (!res.ok || !data.source) throw new Error(data.error ?? "원문 인덱싱 실패");
      setManualContentBySource((current) => ({ ...current, [source.id]: "" }));
      await loadAgents();
      setNotice(`${source.title} 원문을 인덱싱했습니다.`);
    } catch (error) {
      setNotice(error instanceof Error ? error.message : "원문 인덱싱 실패");
      await loadAgents();
    } finally {
      setLoading(false);
    }
  }

  async function uploadKnowledgeFile(source: KnowledgeSource, file: File | null) {
    if (!file) return;

    setLoading(true);
    setNotice("");
    try {
      const form = new FormData();
      form.append("file", file);
      const res = await fetch(`/api/knowledge-sources/${source.id}/ingest`, {
        method: "POST",
        body: form
      });
      const data = (await res.json()) as { source?: KnowledgeSource; error?: string };
      if (!res.ok || !data.source) throw new Error(data.error ?? "파일 인덱싱 실패");
      await loadAgents();
      setNotice(`${file.name} 파일을 인덱싱했습니다.`);
    } catch (error) {
      setNotice(error instanceof Error ? error.message : "파일 인덱싱 실패");
      await loadAgents();
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
    setDebateInsights(null);

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

  async function extractInsights() {
    if (!debate) return;
    setExtractingInsights(true);
    setNotice("");
    try {
      const res = await fetch(`/api/debates/${debate.id}/extract-insights`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({})
      });
      const data = (await res.json()) as { insights?: DebateInsight[]; error?: string };
      if (!res.ok || !data.insights) throw new Error(data.error ?? "Insight 추출 실패");
      setDebateInsights(data.insights);
      setNotice(`${data.insights.length}개의 Insight를 추출했습니다.`);
    } catch (error) {
      setNotice(error instanceof Error ? error.message : "Insight 추출 실패");
    } finally {
      setExtractingInsights(false);
    }
  }

  async function updateInsightStatus(id: string, status: DebateInsightStatus) {
    try {
      const res = await fetch(`/api/debate-insights/${id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ status })
      });
      const data = (await res.json()) as { insight?: DebateInsight; error?: string };
      if (!res.ok || !data.insight) throw new Error(data.error ?? "상태 변경 실패");
      setDebateInsights((prev) => prev?.map((item) => item.id === id ? data.insight! : item) ?? null);
    } catch (error) {
      setNotice(error instanceof Error ? error.message : "상태 변경 실패");
    }
  }

  async function approveAllInsights() {
    if (!debateInsights) return;
    const drafts = debateInsights.filter((item) => item.status === "draft");
    for (const item of drafts) {
      await updateInsightStatus(item.id, "approved");
    }
    setNotice("모든 Draft Insight를 승인했습니다.");
  }

  async function askSuperAgent(event: FormEvent) {
    event.preventDefault();
    if (!superQuestion.trim()) return;
    setSuperLoading(true);
    setSuperAnswer(null);
    setNotice("");
    try {
      const res = await fetch("/api/super-agent/answer", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          question: superQuestion.trim(),
          domainId: superDomainId.trim() || undefined,
          timeHorizon: superTimeHorizon,
          customerSegment: superCustomerSegment.trim() || undefined,
          outputType: superOutputType,
          includeDebateKnowledge: superIncludeDebate,
          includeAgentOpinions: superIncludeOpinions
        })
      });
      const data = (await res.json()) as SuperAnswerResult & { error?: string };
      if (!res.ok || !data.answerMarkdown) throw new Error(data.error ?? "답변 생성 실패");
      setSuperAnswer(data);
    } catch (error) {
      setNotice(error instanceof Error ? error.message : "답변 생성 실패");
    } finally {
      setSuperLoading(false);
    }
  }

  function openOpinionForm(index: number, content: string) {
    setOpinionFormIndex(index);
    setOpinionClaim(content.slice(0, 400));
    setOpinionRationale("");
    setOpinionConfidence("medium");
    setOpinionTags("");
    setOpinionDomainId("");
  }

  async function saveAgentOpinion(event: FormEvent) {
    event.preventDefault();
    if (!opinionClaim.trim()) return;
    try {
      const res = await fetch("/api/agent-opinions", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          agentId: selectedAgentId,
          question: latestUserQuestion(chatMessages),
          claim: opinionClaim.trim(),
          rationale: opinionRationale.trim() || undefined,
          confidence: opinionConfidence,
          tags: opinionTags,
          domainId: opinionDomainId.trim() || undefined
        })
      });
      const data = (await res.json()) as { opinion?: unknown; error?: string };
      if (!res.ok || !data.opinion) throw new Error(data.error ?? "저장 실패");
      setOpinionFormIndex(null);
      setNotice("Agent Opinion을 저장했습니다.");
    } catch (error) {
      setNotice(error instanceof Error ? error.message : "저장 실패");
    }
  }

  function newDiscussion() {
    setTab("debate");
    setQuestion("");
    setDebate(null);
    setDebateDraft("");
    setDebateInsights(null);
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
      } else if (item.kind === "answer") {
        const res = await fetch(`/api/super-agent/answers/${item.id}`);
        const data = (await res.json()) as { answer?: { answerMarkdown: string; id: string }; error?: string };
        if (!res.ok || !data.answer) throw new Error(data.error ?? "답변을 불러오지 못했습니다.");
        setTab("future");
        setSuperQuestion(item.question);
        setSuperAnswer({
          answerId: data.answer.id,
          answerMarkdown: data.answer.answerMarkdown,
          references: { knowledgeSources: [], debateInsights: [], agentOpinions: [] }
        });
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
          <span className="brandMark" aria-hidden="true" />
          <p className="eyebrow">One question. Three minds. One aligned decision.</p>
          <h1>Trinity Eye</h1>
        </div>
      </header>

      {sidebarOpen ? (
        <aside className="drawer open" aria-label="History menu">
          <div className="drawerHeader">
            <strong>전문가 AI</strong>
            <button className="drawerClose" type="button" aria-label="메뉴 닫기" onClick={() => setSidebarOpen(false)}>
              ×
            </button>
          </div>
          <nav className="drawerNav">
            <button className={tab === "debate" ? "active" : ""} onClick={() => { setTab("debate"); }}>
              Trinity Debate
              <span className="navHint">관점 토론</span>
            </button>
            <button
              className={tab === "chat" ? "active" : ""}
              onClick={() => setTab("chat")}
            >
              Solo Lens
              <span className="navHint">전문가 AI와 대화</span>
            </button>
            <button
              className={tab === "admin" ? "active" : ""}
              onClick={() => setTab("admin")}
            >
              Persona Studio
              <span className="navHint">학습/조정</span>
            </button>
            <hr className="navDivider" />
            <button
              className={`navFuture${tab === "future" ? " active" : ""}`}
              onClick={() => setTab("future")}
            >
              Future Life Agent
              <span className="navHint">고객 미래생활 분석</span>
            </button>
          </nav>
          <div className="recents">
            <div className="recentsHead">
                <span>History</span>
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
                    <span className={`badge ${item.kind}`}>{item.kind === "discussion" ? "Debate" : item.kind === "answer" ? "Answer" : "Chat"}</span>
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

                <section>
                  <h3>Knowledge Source Manager</h3>
                  <input
                    className="sourceSearch"
                    value={sourceQuery}
                    placeholder="Search source title, summary, tags"
                    onChange={(event) => setSourceQuery(event.target.value)}
                  />
                  <div className="sourceList">
                    {visibleStudioSources.length === 0 ? (
                      <p className="emptySmall">연결된 Knowledge Source가 없습니다.</p>
                    ) : (
                      visibleStudioSources.map((source) => (
                        <article className="sourceItem" key={source.id}>
                          <div>
                            <strong>{source.title}</strong>
                            <span>
                              {source.sourceType} · {source.reliability} · P{source.priority} · {source.contentStatus}
                              {source.chunkCount > 0 ? ` · ${source.chunkCount} chunks` : ""}
                            </span>
                          </div>
                          <p>{source.summary}</p>
                          {source.contentError ? <p className="sourceError">{source.contentError}</p> : null}
                          <div className="sourceActions">
                            <a href={source.url} target="_blank" rel="noreferrer">
                              Source
                            </a>
                            <button type="button" onClick={() => ingestKnowledgeSource(source, "fetch")} disabled={loading}>
                              Index URL
                            </button>
                          </div>
                          <details className="manualIngest">
                            <summary>Manual content / file upload</summary>
                            <input
                              type="file"
                              accept=".pdf,.txt,.md,text/plain,application/pdf"
                              onChange={(event) => {
                                uploadKnowledgeFile(source, event.target.files?.[0] ?? null);
                                event.currentTarget.value = "";
                              }}
                            />
                            <textarea
                              rows={5}
                              value={manualContentBySource[source.id] ?? ""}
                              placeholder="PDF나 접근 제한 페이지의 핵심 원문을 붙여넣으세요."
                              onChange={(event) =>
                                setManualContentBySource((current) => ({
                                  ...current,
                                  [source.id]: event.target.value
                                }))
                              }
                            />
                            <button
                              type="button"
                              onClick={() => ingestKnowledgeSource(source, "manual")}
                              disabled={loading || !manualContentBySource[source.id]?.trim()}
                            >
                              Index Manual Text
                            </button>
                          </details>
                        </article>
                      ))
                    )}
                  </div>
                  <div className="addSourceBlock">
                    <form className="quickAddRow" onSubmit={fetchUrlPreview}>
                      <input
                        className="quickUrlInput"
                        value={quickUrl}
                        onChange={(event) => setQuickUrl(event.target.value)}
                        placeholder="https://... URL을 입력하세요"
                        type="url"
                      />
                      <button type="submit" disabled={fetchingPreview || !quickUrl.trim()}>
                        {fetchingPreview ? "불러오는 중…" : "Fetch"}
                      </button>
                    </form>

                    {(sourceForm.url || sourceForm.title) ? (
                      <form className="sourceForm" onSubmit={addKnowledgeSource}>
                        <label>
                          Title
                          <input
                            value={sourceForm.title}
                            onChange={(event) => setSourceForm((current) => ({ ...current, title: event.target.value }))}
                          />
                        </label>
                        <label>
                          URL
                          <input
                            value={sourceForm.url}
                            onChange={(event) => setSourceForm((current) => ({ ...current, url: event.target.value }))}
                          />
                        </label>
                        <label>
                          Summary
                          <textarea
                            rows={4}
                            value={sourceForm.summary}
                            onChange={(event) => setSourceForm((current) => ({ ...current, summary: event.target.value }))}
                            placeholder="이 소스의 핵심 내용을 요약하세요"
                          />
                        </label>
                        <div className="sourceMetaGrid">
                          <label>
                            Source Type
                            <input
                              value={sourceForm.sourceType}
                              onChange={(event) => setSourceForm((current) => ({ ...current, sourceType: event.target.value }))}
                            />
                          </label>
                          <label>
                            Reliability
                            <select
                              value={sourceForm.reliability}
                              onChange={(event) =>
                                setSourceForm((current) => ({
                                  ...current,
                                  reliability: event.target.value as KnowledgeSource["reliability"]
                                }))
                              }
                            >
                              <option value="very_high">very_high</option>
                              <option value="high">high</option>
                              <option value="medium">medium</option>
                              <option value="low">low</option>
                            </select>
                          </label>
                          <label>
                            Priority
                            <input
                              type="number"
                              min="1"
                              max="5"
                              value={sourceForm.priority}
                              onChange={(event) => setSourceForm((current) => ({ ...current, priority: Number(event.target.value) }))}
                            />
                          </label>
                        </div>
                        <label>
                          Tags
                          <input
                            value={sourceForm.tags}
                            placeholder="AI, wellness, 고령화"
                            onChange={(event) => setSourceForm((current) => ({ ...current, tags: event.target.value }))}
                          />
                        </label>
                        <div className="sourceFormActions">
                          <button
                            className="primary"
                            disabled={loading || !sourceForm.title.trim() || !sourceForm.url.trim()}
                          >
                            Add Source
                          </button>
                          <button
                            type="button"
                            onClick={() => setSourceForm({ title: "", url: "", sourceType: "external_source", reliability: "high", priority: 2, summary: "", tags: "" })}
                          >
                            초기화
                          </button>
                        </div>
                      </form>
                    ) : null}
                  </div>
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

                <section>
                  <h3>Professional Reasoning</h3>
                  <label>
                    Response Template
                    <textarea
                      rows={7}
                      value={selectedStudioAgent.responseTemplate}
                      onChange={(event) => patchAgent(selectedStudioAgent.id, { responseTemplate: event.target.value })}
                    />
                  </label>
                  <div className="twoCols">
                    <label>
                      Challenge Rules
                      <textarea
                        rows={8}
                        value={selectedStudioAgent.challengeRules}
                        onChange={(event) => patchAgent(selectedStudioAgent.id, { challengeRules: event.target.value })}
                      />
                    </label>
                    <label>
                      Evidence Rules
                      <textarea
                        rows={8}
                        value={selectedStudioAgent.evidenceRules}
                        onChange={(event) => patchAgent(selectedStudioAgent.id, { evidenceRules: event.target.value })}
                      />
                    </label>
                  </div>
                  <label>
                    Scorecard
                    <textarea
                      rows={6}
                      value={selectedStudioAgent.scorecard}
                      onChange={(event) => patchAgent(selectedStudioAgent.id, { scorecard: event.target.value })}
                    />
                  </label>
                </section>

                <section>
                  <h3>Persona Test</h3>
                  <form className="testPrompt" onSubmit={runPersonaTest} ref={personaTestFormRef}>
                    <textarea
                      rows={3}
                      value={personaTestInput}
                      onChange={(event) => setPersonaTestInput(event.target.value)}
                      onKeyDown={enterSubmit(personaTestFormRef)}
                      placeholder="AI 쇼핑 어시스턴트를 오프라인 매장에도 적용할 수 있을까?"
                    />
                    <button className="primary" disabled={loading || !personaTestInput.trim()}>
                      Run Test
                    </button>
                  </form>
                  {personaTestOutput ? (
                    <div className="testOutput">
                      <Markdownish text={personaTestOutput} />
                    </div>
                  ) : null}
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
              <span>Knowledge Pack: {knowledgePackLabel(selectedAgent)}</span>
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
                    {message.role === "assistant" ? (
                      <div className="bubbleActions">
                        <button type="button" onClick={() => openOpinionForm(index, message.content)}>
                          Save as Agent Opinion
                        </button>
                      </div>
                    ) : null}
                    {opinionFormIndex === index ? (
                      <form className="opinionForm" onSubmit={saveAgentOpinion}>
                        <label>
                          Domain ID
                          <input value={opinionDomainId} onChange={(e) => setOpinionDomainId(e.target.value)} placeholder="ai_home" />
                        </label>
                        <label>
                          Claim
                          <textarea rows={3} value={opinionClaim} onChange={(e) => setOpinionClaim(e.target.value)} />
                        </label>
                        <label>
                          Rationale
                          <textarea rows={2} value={opinionRationale} onChange={(e) => setOpinionRationale(e.target.value)} placeholder="근거 (선택)" />
                        </label>
                        <div className="twoCols">
                          <label>
                            Confidence
                            <select value={opinionConfidence} onChange={(e) => setOpinionConfidence(e.target.value as "high" | "medium" | "low")}>
                              <option value="high">high</option>
                              <option value="medium">medium</option>
                              <option value="low">low</option>
                            </select>
                          </label>
                          <label>
                            Tags
                            <input value={opinionTags} onChange={(e) => setOpinionTags(e.target.value)} placeholder="AI, 쇼핑, UX" />
                          </label>
                        </div>
                        <div className="opinionFormActions">
                          <button className="primary" type="submit" disabled={!opinionClaim.trim()}>Save Opinion</button>
                          <button type="button" onClick={() => setOpinionFormIndex(null)}>취소</button>
                        </div>
                      </form>
                    ) : null}
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
            <div className="lensActions">
              <button type="button" onClick={comparePerspectives} disabled={loading || !hasQuestion(chatMessages, chatInput)}>
                Compare Perspectives
              </button>
              <button type="button" onClick={sendCurrentQuestionToDebate} disabled={loading || !hasQuestion(chatMessages, chatInput)}>
                Send to Trinity Debate
              </button>
              <button type="button" onClick={sendCurrentQuestionToDebate} disabled={loading || !hasQuestion(chatMessages, chatInput)}>
                Save as Debate Seed
              </button>
            </div>
          </div>
          </section>
        </section>
      ) : null}

      {tab === "future" ? (
        <section className="stack">
          <div className="sectionHead panel futureHeader">
            <div>
              <p className="eyebrow">Future Life Agent</p>
              <h2>AI로 인한 고객 미래 생활 변화 분석</h2>
              <p>독립 Super Agent가 Archive, Evidence, Debate Insight를 종합해 독립적으로 답변합니다.</p>
            </div>
          </div>
          <div className="futureLayout">
            <form className="panel futureInput" onSubmit={askSuperAgent} ref={futureFormRef}>
              <label className="futureQuestionLabel">
                Question
                <textarea
                  rows={3}
                  value={superQuestion}
                  onChange={(e) => setSuperQuestion(e.target.value)}
                  onKeyDown={superQuestionKeyDown}
                  placeholder="Tab으로 예시 질문 입력 · Enter로 제출 · Shift+Enter 줄바꿈"
                />
              </label>
              <div className="futureOptionsRow">
                <label className="futureInlineLabel">
                  <span>Time Horizon</span>
                  <select value={superTimeHorizon} onChange={(e) => setSuperTimeHorizon(e.target.value as "1y" | "3y" | "5y" | "10y")}>
                    <option value="1y">1년</option>
                    <option value="3y">3년</option>
                    <option value="5y">5년</option>
                    <option value="10y">10년</option>
                  </select>
                </label>
                <label className="futureInlineLabel">
                  <span>Output Type</span>
                  <select value={superOutputType} onChange={(e) => setSuperOutputType(e.target.value)}>
                    <option value="future_life_answer">Future Life Answer</option>
                    <option value="scenario">Scenario</option>
                    <option value="business_opportunity">Business Opportunity</option>
                    <option value="executive_brief">Executive Brief</option>
                  </select>
                </label>
                <label className="checkboxLabel">
                  <input type="checkbox" checked={superIncludeDebate} onChange={(e) => setSuperIncludeDebate(e.target.checked)} />
                  Debate Knowledge
                </label>
                <label className="checkboxLabel">
                  <input type="checkbox" checked={superIncludeOpinions} onChange={(e) => setSuperIncludeOpinions(e.target.checked)} />
                  Agent Opinions
                </label>
              </div>
              <button className="primary" disabled={superLoading || !superQuestion.trim()}>
                {superLoading ? "분석 중…" : "Ask Future Life Agent"}
              </button>
            </form>

            {superAnswer ? (
              <div className="futureAnswer">
                <section className="panel futureAnswerPanel">
                  <Markdownish text={superAnswer.answerMarkdown} />
                </section>
                {(superAnswer.references.knowledgeSources.length > 0 ||
                  superAnswer.references.debateInsights.length > 0 ||
                  superAnswer.references.agentOpinions.length > 0) ? (
                  <details className="panel referencesPanel">
                    <summary><strong>참고한 지식</strong></summary>
                    {superAnswer.references.knowledgeSources.length > 0 ? (
                      <div className="refGroup">
                        <p className="refGroupTitle">Knowledge Sources</p>
                        {superAnswer.references.knowledgeSources.map((s) => (
                          <a key={s.id} className="refItem" href={s.url} target="_blank" rel="noreferrer">{s.title}</a>
                        ))}
                      </div>
                    ) : null}
                    {superAnswer.references.debateInsights.length > 0 ? (
                      <div className="refGroup">
                        <p className="refGroupTitle">Debate Insights</p>
                        {superAnswer.references.debateInsights.map((i) => (
                          <span key={i.id} className="refItem">
                            <span className="insightType">{i.insightType}</span> {i.title}
                          </span>
                        ))}
                      </div>
                    ) : null}
                    {superAnswer.references.agentOpinions.length > 0 ? (
                      <div className="refGroup">
                        <p className="refGroupTitle">Agent Opinions</p>
                        {superAnswer.references.agentOpinions.map((o) => (
                          <span key={o.id} className="refItem">
                            <span className="insightBadge">{o.agentId}</span> {o.claim}
                          </span>
                        ))}
                      </div>
                    ) : null}
                  </details>
                ) : null}
              </div>
            ) : null}
          </div>
        </section>
      ) : null}

      {tab === "debate" ? (
        <section className="stack">
          <div className="debateHeader panel">
            <div>
              <p className="eyebrow">Trinity Debate</p>
              <h2>{question || "Shaping the Future"}</h2>
              <p>3개의 미래 예측 전문가 Agent가 기술 가능성, 고객 가치, 사업 실행성을 동시에 검토합니다.</p>
            </div>
            <div className="debateMetaGrid">
              <label>
                Debate Mode
                <select value={debateMode} onChange={(event) => setDebateMode(event.target.value as DebateMode)}>
                  {[
                    "Balanced",
                    "Critical",
                    "Opportunity",
                    "Execution",
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
                    "Summary",
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
          <form className="questionBox" onSubmit={submitDebate} ref={debateFormRef}>
            <textarea
              rows={4}
              value={question}
              onChange={(event) => setQuestion(event.target.value)}
              onKeyDown={enterSubmit(debateFormRef)}
              placeholder="Frame the Question  (Enter로 제출 · Shift+Enter 줄바꿈)"
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
                <DebateStages debate={debate} />
              </section>
              <section className="panel conclusion">
                <h2>Szg Synthesis</h2>
                <Markdownish text={debate.conclusion} />
                <div className="insightActions">
                  <button
                    type="button"
                    className="primary"
                    onClick={extractInsights}
                    disabled={extractingInsights}
                  >
                    {extractingInsights ? "추출 중…" : "Extract Insights"}
                  </button>
                </div>
              </section>
              {debateInsights ? (
                <section className="panel insightPanel">
                  <div className="sectionHead">
                    <h2>Debate Insights</h2>
                    <div className="insightHeadActions">
                      <span className="meta">{debateInsights.length}개</span>
                      {debateInsights.some((item) => item.status === "draft") ? (
                        <button type="button" onClick={approveAllInsights}>
                          Approve All
                        </button>
                      ) : null}
                    </div>
                  </div>
                  <div className="insightList">
                    {debateInsights.map((insight) => (
                      <article className={`insightItem status-${insight.status}`} key={insight.id}>
                        <div className="insightMeta">
                          <span className="insightType">{insight.insightType}</span>
                          <span className="insightBadge">{insight.confidence} confidence</span>
                          <span className="insightBadge">evidence: {insight.evidenceLevel}</span>
                          <span className={`insightStatus ${insight.status}`}>{insight.status}</span>
                        </div>
                        <strong>{insight.title}</strong>
                        <p>{insight.content}</p>
                        {insight.tags.length > 0 ? (
                          <div className="insightTags">
                            {insight.tags.map((tag) => <span key={tag}>{tag}</span>)}
                          </div>
                        ) : null}
                        {insight.status === "draft" ? (
                          <div className="insightItemActions">
                            <button type="button" onClick={() => updateInsightStatus(insight.id, "approved")}>Approve</button>
                            <button type="button" onClick={() => updateInsightStatus(insight.id, "rejected")}>Reject</button>
                          </div>
                        ) : null}
                      </article>
                    ))}
                  </div>
                </section>
              ) : null}
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
  if (item.kind === "discussion" || item.kind === "answer") return item.question;
  return item.title;
}

function recentMeta(item: RecentItem) {
  if (item.kind === "discussion") return `${item.turnCount}개 발언`;
  if (item.kind === "answer") return item.answerType;
  return `${item.agentName} · ${item.messageCount}개 메시지`;
}

function latestUserQuestion(messages: ChatMessage[]) {
  return [...messages].reverse().find((message) => message.role === "user")?.content.trim() ?? "";
}

function hasQuestion(messages: ChatMessage[], input: string) {
  return Boolean(input.trim() || latestUserQuestion(messages));
}

function knowledgePackLabel(agent: Agent | undefined) {
  return (agent?.knowledge.split("\n")[0] ?? "").replace(/^Knowledge Pack:\s*/i, "") || "Not configured";
}

function filterSources(sources: KnowledgeSource[], query: string) {
  const terms = query
    .toLowerCase()
    .split(/\s+/)
    .filter((term) => term.length >= 2);
  if (terms.length === 0) return sources;
  return sources.filter((source) => {
    const text = [source.title, source.summary, source.sourceType, source.reliability, source.tags.join(" ")]
      .join(" ")
      .toLowerCase();
    return terms.every((term) => text.includes(term));
  });
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

function DebateStages({ debate }: { debate: DebateResult }) {
  const opening = debate.turns.filter((turn) => turn.round === "opening");
  const rebuttal = debate.turns.filter((turn) => turn.round === "rebuttal");
  const final = debate.turns.filter((turn) => turn.round === "final");

  return (
    <div className="stageList">
      <details className="stage" open>
        <summary>
          <strong>[1] Question Framing</strong>
          <span>{debate.question}</span>
        </summary>
        <p>분석 대상을 기술 가능성, 고객 가치, 사업 실행성 관점으로 나눠 검토합니다.</p>
      </details>
      <details className="stage" open>
        <summary>
          <strong>[2] Evidence Scan</strong>
          <span>근거 수준과 누락 자료</span>
        </summary>
        <Markdownish text={extractSection(debate.conclusion, "Evidence Scan")} />
      </details>
      <DebateStage index={3} title="Opening Views" turns={opening} />
      <DebateStage index={4} title="Cross Challenge" turns={rebuttal} />
      <DebateStage index={5} title="Refine Positions" turns={final} />
      <details className="stage" open>
        <summary>
          <strong>[6] Score & Trade-off</strong>
          <span>Agent별 점수와 핵심 이견</span>
        </summary>
        <Markdownish text={extractSection(debate.conclusion, "Score & Trade-off")} />
      </details>
      <details className="stage" open>
        <summary>
          <strong>[7] Consensus Map</strong>
          <span>합의점, 이견, 리스크 정리</span>
        </summary>
        <Markdownish text={extractConsensusMap(debate.conclusion)} />
      </details>
      <details className="stage" open>
        <summary>
          <strong>[8] Trinity Synthesis</strong>
          <span>최종 실행 결론</span>
        </summary>
        <Markdownish text={debate.conclusion} />
      </details>
    </div>
  );
}

function DebateStage({ index, title, turns }: { index: number; title: string; turns: DebateResult["turns"] }) {
  return (
    <details className="stage" open>
      <summary>
        <strong>
          [{index}] {title}
        </strong>
        <span>{turns.length}개 발언</span>
      </summary>
      <div className="transcriptList">
        {turns.map((turn, turnIndex) => (
          <article className={`debateMessage ${turn.agentId}`} key={`${turn.agentId}-${turn.round}-${turnIndex}`}>
            <div className="speaker">
              <strong>{turn.agentName}</strong>
              <span>{roundName(turn.round)}</span>
            </div>
            <Markdownish text={turn.content} />
          </article>
        ))}
      </div>
    </details>
  );
}

function extractConsensusMap(conclusion: string) {
  const consensusSection = extractSection(conclusion, "Consensus Map", false);
  if (consensusSection) return consensusSection;
  const sections = ["합의", "이견", "리스크", "실행 조건", "판단 근거"];
  const lines = conclusion.split("\n").filter((line) => sections.some((section) => line.includes(section)));
  if (lines.length === 0) return "최종 결론에서 합의점, 남은 리스크, 다음 실행안을 확인하세요.";
  return lines.slice(0, 12).join("\n");
}

function extractSection(conclusion: string, heading: string, fallback = true) {
  const escapedHeading = heading.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const pattern = new RegExp(`^##\\s+${escapedHeading}\\s*$([\\s\\S]*?)(?=^##\\s+|$)`, "im");
  const section = conclusion.match(pattern)?.[1]?.trim();
  if (section) return section;
  return fallback ? `${heading} 정보는 최종 결론에 포함되어 있지 않습니다.` : "";
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
