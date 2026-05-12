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

type Tab = "admin" | "chat" | "debate" | "future" | "knowledge";
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
  const [superTimeHorizon, setSuperTimeHorizon] = useState<"1y" | "3y" | "5y" | "10y">("3y");
  const [superIncludeDebate, setSuperIncludeDebate] = useState(true);
  const [superIncludeOpinions, setSuperIncludeOpinions] = useState(false);
  const [answerByType, setAnswerByType] = useState<{ scenario: SuperAnswerResult | null; business: SuperAnswerResult | null; executive: SuperAnswerResult | null }>({ scenario: null, business: null, executive: null });
  const [loadingByType, setLoadingByType] = useState({ scenario: false, business: false, executive: false });
  const [resultTab, setResultTab] = useState<"scenario" | "business" | "executive">("scenario");

  // Save as Agent Opinion
  const [opinionFormIndex, setOpinionFormIndex] = useState<number | null>(null);
  const [opinionClaim, setOpinionClaim] = useState("");
  const [opinionRationale, setOpinionRationale] = useState("");
  const [opinionConfidence, setOpinionConfidence] = useState<"high" | "medium" | "low">("medium");
  const [opinionTags, setOpinionTags] = useState("");
  const [opinionDomainId, setOpinionDomainId] = useState("");
  const [recents, setRecents] = useState<RecentItem[]>([]);
  const [sidebarOpen, setSidebarOpen] = useState(true);

  // Knowledge Manager
  const [kmAgentFilter, setKmAgentFilter] = useState("all");
  const [kmSearch, setKmSearch] = useState("");
  const [allKmSources, setAllKmSources] = useState<KnowledgeSource[]>([]);
  const [kmLoadingState, setKmLoadingState] = useState(false);
  const [editingKmId, setEditingKmId] = useState<number | null>(null);
  const [kmEditForm, setKmEditForm] = useState<{
    title: string; summary: string; reliability: KnowledgeSource["reliability"]; priority: number; tags: string; domainId: string;
  }>({ title: "", summary: "", reliability: "high", priority: 2, tags: "", domainId: "" });
  const [kmAddAgentId, setKmAddAgentId] = useState("tech");
  const [kmQuickUrl, setKmQuickUrl] = useState("");
  const [kmFetchingUrl, setKmFetchingUrl] = useState(false);
  const [kmAddForm, setKmAddForm] = useState({ title: "", url: "", sourceType: "external_source", reliability: "high" as KnowledgeSource["reliability"], priority: 2, summary: "", tags: "" });
  const [kmManualContent, setKmManualContent] = useState<Record<number, string>>({});

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

  useEffect(() => {
    if (tab === "knowledge") loadAllKmSources();
  }, [tab]);

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
    setAnswerByType({ scenario: null, business: null, executive: null });
    setLoadingByType({ scenario: true, business: true, executive: true });
    setResultTab("scenario");
    setNotice("");

    const base = {
      question: superQuestion.trim(),
      timeHorizon: superTimeHorizon,
      includeDebateKnowledge: superIncludeDebate,
      includeAgentOpinions: superIncludeOpinions
    };

    const callOne = async (outputType: string, key: "scenario" | "business" | "executive") => {
      try {
        const res = await fetch("/api/super-agent/answer", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ ...base, outputType })
        });
        const data = (await res.json()) as SuperAnswerResult & { error?: string };
        if (!res.ok || !data.answerMarkdown) throw new Error(data.error ?? "답변 생성 실패");
        setAnswerByType(prev => ({ ...prev, [key]: data }));
      } catch (error) {
        setNotice(error instanceof Error ? error.message : `${key} 답변 생성 실패`);
      } finally {
        setLoadingByType(prev => ({ ...prev, [key]: false }));
      }
    };

    // 3개 동시 병렬 호출 — Future Scenario가 먼저 도착하면 바로 표시됨
    callOne("scenario", "scenario");
    callOne("business_opportunity", "business");
    callOne("executive_brief", "executive");
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

  async function loadAllKmSources() {
    setKmLoadingState(true);
    try {
      const res = await fetch("/api/knowledge-sources");
      const data = (await res.json()) as { sources?: KnowledgeSource[] };
      setAllKmSources(data.sources ?? []);
    } catch { /* ignore */ } finally {
      setKmLoadingState(false);
    }
  }

  function startEditKm(source: KnowledgeSource) {
    setEditingKmId(source.id);
    setKmEditForm({
      title: source.title,
      summary: source.summary,
      reliability: source.reliability,
      priority: source.priority,
      tags: source.tags.join(", "),
      domainId: source.domainId ?? ""
    });
  }

  async function saveKmEdit(event: FormEvent) {
    event.preventDefault();
    if (!editingKmId) return;
    try {
      const res = await fetch(`/api/knowledge-sources/${editingKmId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          title: kmEditForm.title.trim(),
          summary: kmEditForm.summary.trim(),
          reliability: kmEditForm.reliability,
          priority: kmEditForm.priority,
          tags: kmEditForm.tags,
          domainId: kmEditForm.domainId.trim() || undefined
        })
      });
      const data = (await res.json()) as { source?: KnowledgeSource; error?: string };
      if (!res.ok || !data.source) throw new Error(data.error ?? "수정 실패");
      setAllKmSources(prev => prev.map(s => s.id === editingKmId ? data.source! : s));
      setEditingKmId(null);
    } catch (error) {
      setNotice(error instanceof Error ? error.message : "수정 실패");
    }
  }

  async function deleteKmSource(id: number) {
    try {
      const res = await fetch(`/api/knowledge-sources/${id}`, { method: "DELETE" });
      if (!res.ok) throw new Error("삭제 실패");
      setAllKmSources(prev => prev.filter(s => s.id !== id));
      setNotice("Knowledge Source를 삭제했습니다.");
    } catch (error) {
      setNotice(error instanceof Error ? error.message : "삭제 실패");
    }
  }

  async function ingestKmSource(source: KnowledgeSource, mode: "fetch" | "manual") {
    const content = mode === "manual" ? kmManualContent[source.id]?.trim() : "";
    if (mode === "manual" && !content) return;
    setKmLoadingState(true);
    try {
      const res = await fetch(`/api/knowledge-sources/${source.id}/ingest`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(mode === "manual" ? { content } : { fetchUrl: true })
      });
      const data = (await res.json()) as { source?: KnowledgeSource; error?: string };
      if (!res.ok || !data.source) throw new Error(data.error ?? "인덱싱 실패");
      setAllKmSources(prev => prev.map(s => s.id === source.id ? data.source! : s));
      if (mode === "manual") setKmManualContent(prev => ({ ...prev, [source.id]: "" }));
      setNotice(`${source.title} 인덱싱 완료`);
    } catch (error) {
      setNotice(error instanceof Error ? error.message : "인덱싱 실패");
      await loadAllKmSources();
    } finally {
      setKmLoadingState(false);
    }
  }

  async function fetchKmPreview(event: FormEvent) {
    event.preventDefault();
    const url = kmQuickUrl.trim();
    if (!url) return;
    setKmFetchingUrl(true);
    try {
      const res = await fetch("/api/knowledge-sources/preview", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ url })
      });
      const data = (await res.json()) as { title?: string; summary?: string; tags?: string[]; sourceType?: string; reliability?: KnowledgeSource["reliability"]; error?: string };
      if (!res.ok) throw new Error(data.error ?? "미리보기 실패");
      setKmAddForm(f => ({
        ...f, url,
        title: data.title || f.title,
        summary: data.summary || f.summary,
        sourceType: data.sourceType || f.sourceType,
        reliability: data.reliability ?? f.reliability,
        tags: data.tags?.join(", ") || f.tags
      }));
      setKmQuickUrl("");
    } catch (error) {
      setNotice(error instanceof Error ? error.message : "미리보기 실패");
    } finally {
      setKmFetchingUrl(false);
    }
  }

  async function addKmSource(event: FormEvent) {
    event.preventDefault();
    if (!kmAddForm.title.trim() || !kmAddForm.url.trim() || !kmAddForm.summary.trim()) return;
    setKmLoadingState(true);
    try {
      const res = await fetch("/api/knowledge-sources", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ agentId: kmAddAgentId, ...kmAddForm })
      });
      const data = (await res.json()) as { source?: KnowledgeSource; error?: string };
      if (!res.ok || !data.source) throw new Error(data.error ?? "저장 실패");
      setKmAddForm({ title: "", url: "", sourceType: "external_source", reliability: "high", priority: 2, summary: "", tags: "" });
      await loadAllKmSources();
      setNotice("Knowledge Source를 추가했습니다.");
    } catch (error) {
      setNotice(error instanceof Error ? error.message : "저장 실패");
    } finally {
      setKmLoadingState(false);
    }
  }

  const kmFilteredSources = useMemo(() => {
    const filtered = allKmSources.filter(s => {
      if (kmAgentFilter !== "all" && s.agentId !== kmAgentFilter) return false;
      if (!kmSearch.trim()) return true;
      const terms = kmSearch.toLowerCase().split(/\s+/).filter(t => t.length >= 2);
      const hay = [s.title, s.summary, s.agentId, s.domainId ?? "", s.tags.join(" ")].join(" ").toLowerCase();
      return terms.every(t => hay.includes(t));
    });
    return filtered;
  }, [allKmSources, kmAgentFilter, kmSearch]);

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
        setAnswerByType({
          scenario: { answerId: data.answer.id, answerMarkdown: data.answer.answerMarkdown, references: { knowledgeSources: [], debateInsights: [], agentOpinions: [] } },
          business: null,
          executive: null
        });
        setResultTab("scenario");
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
            <button
              className={tab === "knowledge" ? "active" : ""}
              onClick={() => setTab("knowledge")}
            >
              Knowledge Manager
              <span className="navHint">지식 통합 관리</span>
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

                <section className="kmShortcut">
                  <h3>Knowledge Sources</h3>
                  <p className="emptySmall">
                    이 Agent의 Knowledge Source는 <strong>Knowledge Manager</strong>에서 통합 관리합니다.
                  </p>
                  <div className="kmShortcutMeta">
                    <span className="meta">{(selectedStudioAgent.knowledgeSources ?? []).length}개 연결됨</span>
                    <button type="button" onClick={() => setTab("knowledge")}>
                      Knowledge Manager 열기 →
                    </button>
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
                placeholder="예) AI Home 어시스턴트가 가장 먼저 해결할 수 있는 생활 불편은?"
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

      {tab === "knowledge" ? (
        <section className="stack">
          <div className="sectionHead panel kmHeader">
            <div>
              <p className="eyebrow">AI Knowledge Manager</p>
              <h2>지식 통합 관리</h2>
              <p>4개 Agent의 Knowledge Source를 한 곳에서 열람·수정·삭제합니다.</p>
            </div>
            <span className="meta">{allKmSources.length}개 Source</span>
          </div>

          {/* Add Source */}
          <div className="panel kmAddPanel">
            <h3>Add Knowledge Source</h3>
            <div className="kmAddTop">
              <label className="kmAgentSelect">
                Agent
                <select value={kmAddAgentId} onChange={e => setKmAddAgentId(e.target.value)}>
                  {agents.map(a => <option key={a.id} value={a.id}>{a.name}</option>)}
                </select>
              </label>
              <form className="quickAddRow kmUrlRow" onSubmit={fetchKmPreview}>
                <input
                  className="quickUrlInput"
                  value={kmQuickUrl}
                  onChange={e => setKmQuickUrl(e.target.value)}
                  placeholder="https://... URL 입력"
                  type="url"
                />
                <button type="submit" disabled={kmFetchingUrl || !kmQuickUrl.trim()}>
                  {kmFetchingUrl ? "불러오는 중…" : "Fetch"}
                </button>
              </form>
            </div>
            {(kmAddForm.url || kmAddForm.title) ? (
              <form className="sourceForm kmDetailForm" onSubmit={addKmSource}>
                <label>Title<input value={kmAddForm.title} onChange={e => setKmAddForm(f => ({ ...f, title: e.target.value }))} /></label>
                <label>URL<input value={kmAddForm.url} onChange={e => setKmAddForm(f => ({ ...f, url: e.target.value }))} /></label>
                <label>Summary<textarea rows={3} value={kmAddForm.summary} onChange={e => setKmAddForm(f => ({ ...f, summary: e.target.value }))} /></label>
                <div className="sourceMetaGrid">
                  <label>Type<input value={kmAddForm.sourceType} onChange={e => setKmAddForm(f => ({ ...f, sourceType: e.target.value }))} /></label>
                  <label>Reliability
                    <select value={kmAddForm.reliability} onChange={e => setKmAddForm(f => ({ ...f, reliability: e.target.value as KnowledgeSource["reliability"] }))}>
                      <option value="very_high">very_high</option>
                      <option value="high">high</option>
                      <option value="medium">medium</option>
                      <option value="low">low</option>
                    </select>
                  </label>
                  <label>Priority<input type="number" min="1" max="5" value={kmAddForm.priority} onChange={e => setKmAddForm(f => ({ ...f, priority: Number(e.target.value) }))} /></label>
                </div>
                <label>Tags<input value={kmAddForm.tags} placeholder="AI, wellness, 고령화" onChange={e => setKmAddForm(f => ({ ...f, tags: e.target.value }))} /></label>
                <div className="sourceFormActions">
                  <button className="primary" disabled={kmLoadingState || !kmAddForm.title.trim() || !kmAddForm.url.trim()}>Add Source</button>
                  <button type="button" onClick={() => setKmAddForm({ title: "", url: "", sourceType: "external_source", reliability: "high", priority: 2, summary: "", tags: "" })}>초기화</button>
                </div>
              </form>
            ) : null}
          </div>

          {/* Filter bar */}
          <div className="kmFilterBar">
            <div className="kmAgentTabs">
              <button className={kmAgentFilter === "all" ? "active" : ""} onClick={() => setKmAgentFilter("all")}>전체 ({allKmSources.length})</button>
              {agents.map(a => (
                <button key={a.id} className={kmAgentFilter === a.id ? "active" : ""} onClick={() => setKmAgentFilter(a.id)}>
                  {a.name.split(" ")[0]} ({allKmSources.filter(s => s.agentId === a.id).length})
                </button>
              ))}
            </div>
            <input className="sourceSearch kmSearchInput" value={kmSearch} onChange={e => setKmSearch(e.target.value)} placeholder="제목·요약·도메인 검색" />
          </div>

          {/* Source list */}
          {kmLoadingState ? (
            <p className="empty">로딩 중…</p>
          ) : kmFilteredSources.length === 0 ? (
            <p className="empty">Knowledge Source가 없습니다.</p>
          ) : (
            <div className="kmSourceList">
              {kmFilteredSources.map(source => (
                <article className="kmSourceItem" key={source.id}>
                  {editingKmId === source.id ? (
                    <form className="kmEditForm" onSubmit={saveKmEdit}>
                      <div className="kmEditHeader">
                        <span className={`kmAgentBadge agent-${source.agentId}`}>{source.agentId}</span>
                        <span className="meta">편집 중</span>
                      </div>
                      <label>Title<input value={kmEditForm.title} onChange={e => setKmEditForm(f => ({ ...f, title: e.target.value }))} /></label>
                      <label>Summary<textarea rows={4} value={kmEditForm.summary} onChange={e => setKmEditForm(f => ({ ...f, summary: e.target.value }))} /></label>
                      <div className="sourceMetaGrid">
                        <label>Reliability
                          <select value={kmEditForm.reliability} onChange={e => setKmEditForm(f => ({ ...f, reliability: e.target.value as KnowledgeSource["reliability"] }))}>
                            <option value="very_high">very_high</option>
                            <option value="high">high</option>
                            <option value="medium">medium</option>
                            <option value="low">low</option>
                          </select>
                        </label>
                        <label>Priority<input type="number" min="1" max="5" value={kmEditForm.priority} onChange={e => setKmEditForm(f => ({ ...f, priority: Number(e.target.value) }))} /></label>
                        <label>Domain ID<input value={kmEditForm.domainId} placeholder="1-1" onChange={e => setKmEditForm(f => ({ ...f, domainId: e.target.value }))} /></label>
                      </div>
                      <label>Tags<input value={kmEditForm.tags} onChange={e => setKmEditForm(f => ({ ...f, tags: e.target.value }))} /></label>
                      <div className="kmEditActions">
                        <button className="primary" type="submit">저장</button>
                        <button type="button" onClick={() => setEditingKmId(null)}>취소</button>
                      </div>
                    </form>
                  ) : (
                    <>
                      <div className="kmItemHead">
                        <div className="kmItemLeft">
                          <span className={`kmAgentBadge agent-${source.agentId}`}>{source.agentId}</span>
                          {source.domainId ? <span className="kmDomainBadge">{source.domainId}</span> : null}
                          <strong className="kmItemTitle">{source.title}</strong>
                        </div>
                        <div className="kmItemActions">
                          <button type="button" onClick={() => startEditKm(source)}>편집</button>
                          <button type="button" className="kmDeleteBtn" onClick={() => { if (confirm(`"${source.title}" 삭제하시겠습니까?`)) deleteKmSource(source.id); }}>삭제</button>
                        </div>
                      </div>
                      <a className="kmItemUrl" href={source.url} target="_blank" rel="noreferrer">{source.url}</a>
                      <p className="kmItemSummary">{source.summary}</p>
                      <div className="kmItemMeta">
                        <span className={`insightBadge rel-${source.reliability}`}>{source.reliability}</span>
                        <span className="insightBadge">P{source.priority}</span>
                        <span className="insightBadge">{source.sourceType}</span>
                        <span className={`insightBadge status-${source.contentStatus}`}>{source.contentStatus}{source.chunkCount > 0 ? ` · ${source.chunkCount}chunk` : ""}</span>
                        <button type="button" className="kmIndexBtn" onClick={() => ingestKmSource(source, "fetch")} disabled={kmLoadingState}>Index URL</button>
                      </div>
                    </>
                  )}
                </article>
              ))}
            </div>
          )}
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
                  placeholder="예) 2030년 AI Home은 한국 맞벌이 가구의 생활을 어떻게 바꿀까? — Tab으로 예시 입력 · Enter로 제출"
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
                <label className="checkboxLabel">
                  <input type="checkbox" checked={superIncludeDebate} onChange={(e) => setSuperIncludeDebate(e.target.checked)} />
                  Debate Knowledge
                </label>
                <label className="checkboxLabel">
                  <input type="checkbox" checked={superIncludeOpinions} onChange={(e) => setSuperIncludeOpinions(e.target.checked)} />
                  Agent Opinions
                </label>
              </div>
              <button className="primary" disabled={(loadingByType.scenario || loadingByType.business || loadingByType.executive) || !superQuestion.trim()}>
                {(loadingByType.scenario || loadingByType.business || loadingByType.executive) ? "분석 중…" : "Ask Future Life Agent"}
              </button>
            </form>

            {(answerByType.scenario || answerByType.business || answerByType.executive ||
              loadingByType.scenario || loadingByType.business || loadingByType.executive) ? (
              <div className="futureAnswer">
                {/* Result tabs */}
                <div className="resultTabBar">
                  {(["scenario", "business", "executive"] as const).map(key => {
                    const labels = { scenario: "Future Scenario", business: "Business Opportunity", executive: "Executive Summary" };
                    const isLoading = loadingByType[key];
                    const isDone = !isLoading && !!answerByType[key];
                    return (
                      <button
                        key={key}
                        className={`resultTabBtn${resultTab === key ? " active" : ""}${isLoading ? " loading" : ""}${isDone ? " done" : ""}`}
                        onClick={() => setResultTab(key)}
                      >
                        {labels[key]}
                        {isLoading ? <span className="tabSpinner" /> : isDone ? <span className="tabDone">✓</span> : null}
                      </button>
                    );
                  })}
                </div>
                <section className="panel futureAnswerPanel">
                  {resultTab === "scenario" && (
                    loadingByType.scenario
                      ? <p className="resultLoading">Future Scenario 생성 중…</p>
                      : answerByType.scenario
                        ? <ScenarioView markdown={answerByType.scenario.answerMarkdown} />
                        : null
                  )}
                  {resultTab === "business" && (
                    loadingByType.business
                      ? <p className="resultLoading">Business Opportunity 생성 중…</p>
                      : answerByType.business
                        ? <Markdownish text={answerByType.business.answerMarkdown} />
                        : null
                  )}
                  {resultTab === "executive" && (
                    loadingByType.executive
                      ? <p className="resultLoading">Executive Summary 생성 중…</p>
                      : answerByType.executive
                        ? <Markdownish text={answerByType.executive.answerMarkdown} />
                        : null
                  )}
                </section>
                {(() => {
                  const active = answerByType[resultTab];
                  if (!active) return null;
                  const { knowledgeSources, debateInsights, agentOpinions } = active.references;
                  if (!knowledgeSources.length && !debateInsights.length && !agentOpinions.length) return null;
                  return (
                    <details className="panel referencesPanel">
                      <summary><strong>참고한 지식</strong></summary>
                      {knowledgeSources.length > 0 && (
                        <div className="refGroup">
                          <p className="refGroupTitle">Knowledge Sources</p>
                          {knowledgeSources.map(s => <a key={s.id} className="refItem" href={s.url} target="_blank" rel="noreferrer">{s.title}</a>)}
                        </div>
                      )}
                      {debateInsights.length > 0 && (
                        <div className="refGroup">
                          <p className="refGroupTitle">Debate Insights</p>
                          {debateInsights.map(i => <span key={i.id} className="refItem"><span className="insightType">{i.insightType}</span> {i.title}</span>)}
                        </div>
                      )}
                      {agentOpinions.length > 0 && (
                        <div className="refGroup">
                          <p className="refGroupTitle">Agent Opinions</p>
                          {agentOpinions.map(o => <span key={o.id} className="refItem"><span className="insightBadge">{o.agentId}</span> {o.claim}</span>)}
                        </div>
                      )}
                    </details>
                  );
                })()}
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
              placeholder="예) AI 가전 구독 서비스는 한국에서 실행 가능한 사업인가? — Enter로 제출"
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

function parseScenarios(markdown: string) {
  const scenarios: Array<{ title: string; sections: Array<{ title: string; content: string }> }> = [];
  let currentScenario: typeof scenarios[0] | null = null;
  let currentSection: { title: string; content: string } | null = null;

  for (const line of markdown.split("\n")) {
    if (line.startsWith("## ")) {
      if (currentSection && currentScenario) currentScenario.sections.push(currentSection);
      if (currentScenario) scenarios.push(currentScenario);
      currentScenario = { title: line.slice(3).trim(), sections: [] };
      currentSection = null;
    } else if (line.startsWith("### ") && currentScenario) {
      if (currentSection) currentScenario.sections.push(currentSection);
      currentSection = { title: line.slice(4).trim(), content: "" };
    } else if (currentSection) {
      currentSection.content += line + "\n";
    }
  }
  if (currentSection && currentScenario) currentScenario.sections.push(currentSection);
  if (currentScenario) scenarios.push(currentScenario);
  return scenarios;
}

function ScenarioView({ markdown }: { markdown: string }) {
  const scenarios = parseScenarios(markdown);
  if (scenarios.length === 0) return <Markdownish text={markdown} />;
  return (
    <div className="scenarioList">
      {scenarios.map((scenario, i) => (
        <div key={i} className="scenarioCard">
          <h2 className="scenarioTitle">{scenario.title}</h2>
          {scenario.sections.map((section, j) => {
            const isPrimary = section.title.includes("하루 생활 장면");
            return isPrimary ? (
              <div key={j} className="scenarioPrimary">
                <h3>{section.title}</h3>
                <Markdownish text={section.content.trim()} />
              </div>
            ) : (
              <details key={j} className="scenarioDetail">
                <summary>{section.title}</summary>
                <Markdownish text={section.content.trim()} />
              </details>
            );
          })}
        </div>
      ))}
    </div>
  );
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
