# Trinity Eye — 단계별 재현 프롬프트

> **목적**: 시행착오 없이 최적화된 최종 결과물을 처음부터 재현하기 위한 가이드  
> **전제**: Claude Code + Supabase 계정 + Gemini API 키 + Railway 계정 준비  
> **각 단계**: 한 세션에서 완료 가능하도록 구성

---

## 개요: 최종 아키텍처

```
Next.js 16 (App Router, Node.js runtime)
├── DB: Supabase Postgres
│   ├── pg-worker.cjs  — child process로 pg 쿼리 실행 (exec_batch 지원)
│   └── pg-sync.ts    — 동기 API 래퍼 (better-sqlite3 스타일)
├── LLM: Google Gemini API (스트리밍 SSE)
└── 단일 페이지 SPA (src/app/page.tsx)
```

**핵심 설계 결정** (처음부터 반영해야 하는 것들):
- Supabase Postgres 직접 사용 (SQLite 절대 사용하지 않음)
- pg-worker의 `exec_batch` 모드: Migration SQL 9개를 1 DB 연결로 실행
- `isSchemaReady()` 체크: 스키마 최신 시 22개 ensureColumn 블록 전체 건너뜀
- `getAgents()`: N+1 제거 — agents 1쿼리 + knowledge_sources 1쿼리로 통합
- `searchKnowledgeSourcesForAgents()`: 토론 시 에이전트 3개 청크 검색을 1쿼리로
- `listConversations()`: `GROUP BY conversations.id, agents.name` (Postgres 필수)
- `parseMarkdownDebate()`: Feasibility + Creative Idea 두 모드 헤딩 모두 지원

---

## Step 1: 프로젝트 초기화

```
Next.js 16 기반 AI 멀티에이전트 플랫폼 'Trinity Eye'를 초기화한다.

설정:
- 패키지명: trinity-szg
- 프레임워크: Next.js 16, App Router, Node.js runtime (Edge 미사용)
- 모든 API 라우트에 `export const runtime = "nodejs"` 명시
- Node.js ≥ 22 (package.json engines 필드)

의존성:
- next@^16, react@19, react-dom@19
- pg@^8 (PostgreSQL 클라이언트)
- pdf-parse@^2 (PDF 텍스트 추출용)
- devDeps: @types/pg, @types/node, @types/react, @types/react-dom, typescript

파일 생성:
1. next.config.mjs — 기본 설정
2. tsconfig.json — strict: true, paths: {"@/*": ["./src/*"]}
3. .env.example:
   GEMINI_API_KEY=
   GEMINI_FALLBACK_MODEL=gemini-2.5-flash
   SUPABASE_URL=
   SUPABASE_DB_URL=
   PGSSLMODE=require
4. .gitignore — .env.local, .next/, node_modules/ 포함
5. src/app/layout.tsx — lang="ko", 기본 HTML 구조
6. src/app/globals.css — 다크 테마 (배경 #0a0a0f, 텍스트 #e8e8f0, 포인트 컬러 #7c6ffb)
7. src/app/icon.svg — 빈 SVG 아이콘
```

---

## Step 2: DB 인프라 — pg-worker + pg-sync + 스키마

```
Next.js App Router에서 Supabase Postgres를 동기 API처럼 사용하는 DB 레이어를 구현한다.

배경: pg는 비동기 전용이므로 execFileSync로 child process를 spawn해서
동기 API처럼 쓰는 브리지 패턴을 사용한다.

[1] src/lib/pg-worker.cjs (CommonJS)
- process.argv[2]에서 JSON payload { mode, sql, params } 수신
- 모든 ? 플레이스홀더를 $1, $2... 로 변환 (translatePlaceholders 함수)
- Pool 연결: ssl: PGSSLMODE==="disable" ? false : { rejectUnauthorized: false }
- mode 처리:
  * "exec_batch": JSON 배열로 받은 SQL 구문들을 단일 Pool 연결에서 순차 실행
    → 여러 SQL을 하나의 연결로 처리해 프로세스 spawn 비용 절감
  * "exec": 단일 DDL 실행
  * "all"/"get"/"run": DML 실행, stdout에 { rows, rowCount, lastInsertRowid } JSON 출력
- SUPABASE_DB_URL 없으면 에러 throw
- 성공: process.stdout.write(JSON.stringify(result))
- 실패: process.stderr.write(error.message), process.exit(1)

[2] src/lib/pg-sync.ts
- QueryResult 타입: { rows, rowCount, lastInsertRowid }
- workerPath: join(process.cwd(), "src", "lib", "pg-worker.cjs")
- runQuery(mode, sql, params): execFileSync로 pg-worker 실행, JSON.parse(stdout) 반환
- PostgresSync 클래스:
  * exec(sql): 여러 구문이면 exec_batch(1 연결), 단일이면 exec
    → 구문 분리: sql.split(/;\s*(?:\n|$)/).map(s=>s.trim()).filter(Boolean)
  * prepare(sql): { all(...params), get(...params), run(...params) } 반환

[3] supabase/migrations/202605130001_initial_schema.sql
CREATE TABLE IF NOT EXISTS으로 아래 테이블 생성:
- agents: id TEXT PK, name, role, persona_type, description, tone, debate_style,
          provider, model, temperature DOUBLE PRECISION, system_prompt, knowledge,
          judgment_criteria, debate_behavior, response_template, challenge_rules,
          evidence_rules, scorecard, agent_type DEFAULT 'specialist_agent', updated_at
- conversations: id BIGSERIAL PK, agent_id, title, created_at
- messages: id BIGSERIAL PK, conversation_id BIGINT, role, content, created_at
- debates: id BIGSERIAL PK, question, conclusion, created_at
- debate_turns: id BIGSERIAL PK, debate_id BIGINT, agent_id, agent_name, round, content, created_at
- knowledge_sources: id BIGSERIAL PK, agent_id, title, url, source_type, reliability,
                     priority INT, summary, tags DEFAULT '[]', content_status DEFAULT 'summary_only',
                     content_error DEFAULT '', last_ingested_at DEFAULT '',
                     external_source_id, external_project_id, domain_id, content_hash, last_synced_at,
                     created_at, updated_at, UNIQUE(agent_id, url)
- knowledge_chunks: id BIGSERIAL PK, source_id BIGINT, chunk_index INT, content,
                    created_at, updated_at, UNIQUE(source_id, chunk_index)
- debate_insights: id TEXT PK, debate_id, domain_id, insight_type, agent_id, title, content,
                   confidence DEFAULT 'medium', evidence_level DEFAULT 'medium', tags DEFAULT '[]',
                   status DEFAULT 'draft', valid_until, reviewed_at, created_at, updated_at
- super_agent_answers: id TEXT PK, question, scenario_markdown DEFAULT '', business_markdown DEFAULT '',
                       executive_markdown DEFAULT '', created_at, updated_at
```

---

## Step 3: Types + Default Agents

```
Trinity Eye의 TypeScript 타입과 기본 에이전트 3종을 정의한다.

[1] src/lib/types.ts
주요 타입:
- Provider: "gemini" | "github"
- AgentType: "specialist_agent" | "super_agent" | "moderator_agent"
- Agent: id, name, role, agentType, personaType, description, tone, debateStyle,
         provider, model, temperature, systemPrompt, knowledge, judgmentCriteria,
         debateBehavior, responseTemplate, challengeRules, evidenceRules, scorecard,
         knowledgeSources?, knowledgeChunks?, updatedAt
- KnowledgeSource: id, agentId, title, url, sourceType, reliability("very_high"|"high"|"medium"|"low"),
                   priority, summary, tags[], contentStatus, contentError, lastIngestedAt,
                   chunkCount, chunks?, externalSourceId?, domainId?, contentHash?, lastSyncedAt?, createdAt, updatedAt
- KnowledgeChunk: id, sourceId, sourceTitle, sourceUrl, sourceReliability, sourcePriority,
                  chunkIndex, content, createdAt, updatedAt
- ChatMessage: role("user"|"assistant"|"system"), content
- DebateTurn: agentId, agentName, round("opening"|"rebuttal"|"final"), content
- DebateResult: id, question, turns[], conclusion, createdAt
- DebateSummary: id, question, createdAt, turnCount
- ConversationSummary: id, agentId, agentName, title, createdAt, messageCount
- ConversationResult: id, agentId, title, messages[], createdAt
- SuperAgentAnswerSummary: id, question, createdAt
- RecentItem: ({kind:"discussion"}&DebateSummary) | ({kind:"chat"}&ConversationSummary) | ({kind:"answer"}&SuperAgentAnswerSummary)
- DebateInsightStatus: "draft"|"approved"|"deprecated"|"rejected"
- DebateInsightType: "tech_feasibility"|"customer_behavior"|"business_opportunity"|"risk"|"counterargument"|"consensus"|"disagreement"|"scenario_seed"|"kpi"|"assumption"
- DebateInsight: id, debateId, domainId?, insightType, agentId?, title, content, confidence, evidenceLevel, tags[], status, validUntil?, reviewedAt?, createdAt, updatedAt
- NewDebateInsight: Omit<DebateInsight, "id"|"createdAt"|"updatedAt">
- SuperAgentAnswer: id, question, scenarioMarkdown, businessMarkdown, executiveMarkdown, createdAt, updatedAt
- NewSuperAgentAnswer: Omit<SuperAgentAnswer, "id"|"createdAt"|"updatedAt">

[2] src/lib/default-agents.ts
3종 Specialist Agent + 1종 Super Agent:

Tech Strategist (id: "tech"):
- agentType: "specialist_agent", model: "gemini-2.5-flash-lite", temperature: 0.5
- 관점: AI 기술 가능성·아키텍처·구현 리스크
- systemPrompt: 영어로 작성, 기술 실현성 분석 전문가
- knowledge: AI 기술 가능성, Home IoT, Agentic AI, on-device AI 등
- judgmentCriteria: 기술 실현 가능성, 3년/5년/10년 실현 시점, 구현 복잡도, 운영 리스크
- debateBehavior: Opening에서 기술 가능성 중심 주장, Cross Challenge에서 Customer/Business 검증
- responseTemplate: ## Tech Strategist View 헤딩 포함 마크다운 구조
- challengeRules, evidenceRules, scorecard 포함

Customer Advocate (id: "customer"):
- agentType: "specialist_agent", model: "gemini-2.5-flash-lite", temperature: 0.7
- 관점: 고객 니즈·UX·수용성·행동 변화
- 고객 세그먼트: 1인 가구, 맞벌이, 육아, 고령, 고소득

Business Realist (id: "business"):
- agentType: "specialist_agent", model: "gemini-2.5-flash-lite", temperature: 0.6
- 관점: 사업 실행성·ROI·우선순위·리스크

Future Life Intelligence Agent (id: "future_life_super"):
- agentType: "super_agent", model: "gemini-2.5-flash-lite", temperature: 0.6
- 목적: Knowledge Sources + Debate Insights를 종합해 미래 시나리오 생성
- Solo Lens에서는 노출 안 함 (super_agent 타입으로 필터링)

EVIDENCE_RULES 상수: 출처 없는 숫자 금지, 미래 예측은 시나리오로, High/Medium/Low 판단 근거 설명 등
```

---

## Step 4: DB 함수 레이어

```
src/lib/db.ts 전체를 구현한다. 성능 최적화가 핵심.

[핵심 최적화 패턴 — 반드시 처음부터 적용]

1. isSchemaReady(db): scenario_markdown 컬럼 존재 여부로 최신 스키마 확인
   → true면 22개 ensureColumn 블록 전체 건너뜀

2. ensureColumn(db, table, col, def): ADD COLUMN IF NOT EXISTS 사용 (체크 쿼리 없이 1회)

3. dropColumnIfExists(db, table, col): DROP COLUMN IF EXISTS 사용 (체크 쿼리 없이 1회)

4. getAgents(): N+1 제거
   - agents SELECT 1쿼리 + knowledge_sources 전체 SELECT 1쿼리 → JS에서 groupBy
   - enrichAgentWithKnowledgeSources 함수 삭제, 에이전트별 listKnowledgeSources 호출 금지

5. searchKnowledgeSourcesForAgents(query, agents[], limitPerAgent):
   - 에이전트 배열의 소스(이미 로드됨)를 단 1회 searchKnowledgeChunks로 처리
   - 결과: Map<agentId, KnowledgeSource[]>
   - 토론 라우트에서 에이전트 3개 × 2쿼리 = 6쿼리를 1쿼리로 감소

6. rankSources(sources, chunksBySource, terms, limit): 순수 JS 점수 계산 (쿼리 없음)
   - title boost×4, tag boost×3, reliability/priority/chunk 가중치

7. listConversations(): GROUP BY conversations.id, agents.name
   → Postgres에서 agents.name이 GROUP BY에 없으면 에러 발생 (중요!)

getDb() 초기화 순서:
1. isSchemaReady(db) 체크
2. false이면: db.exec(migration SQL) → ensureColumn 22개 → dropColumnIfExists 8개
3. agents COUNT → 0이면 INSERT, 있으면 seedMissingAgentFields + seedMissingAgents
4. seedKnowledgeSources(db) — data/knowledge_sources.json 있으면 시드
5. seedMigrationData(db) — app/data/migraion_data.json 있으면 cases를 knowledge_sources로 변환

export 함수 목록:
- getAgents(), getAgent(id)
- updateAgents(agents[])
- createConversation(agentId, title), addMessage(convId, role, content)
- listConversations(limit), getConversation(id)
- createDebate(question, turns[], conclusion), listDebates(limit), getDebate(id)
- listRecents(limit): discussions + chats + answers 합쳐 createdAt 역순 정렬
- listKnowledgeSources(agentId?), searchKnowledgeSources(query, agentId?, limit)
- searchKnowledgeSourcesForAgents(query, agents[], limitPerAgent) — 토론 전용
- getKnowledgeSource(id), listKnowledgeChunks(sourceId), searchKnowledgeChunks(query, agentId?, limit)
- replaceKnowledgeSourceChunks(sourceId, content) — 1400자 청크, 180자 overlap, 최대 80개
- markKnowledgeSourceIngestFailed(sourceId, error)
- createKnowledgeSource(input), deleteKnowledgeSource(id), updateKnowledgeSourceMeta(id, data)
- createDebateInsights(items[]), listDebateInsights(params), updateDebateInsightStatus(id, status)
- createSuperAgentAnswer(input), getSuperAgentAnswer(id), listSuperAgentAnswers(limit)
```

---

## Step 5: LLM 레이어

```
src/lib/llm.ts — Gemini + GitHub Models 스트리밍 레이어를 구현한다.

[지원 Provider]
- Google Gemini: GEMINI_API_KEY, SSE (streamGenerateContent?alt=sse)
- GitHub Models: GITHUB_TOKEN, OpenAI 호환 SSE

[fullSystemPrompt(agent)] — 시스템 프롬프트 합성
다음 순서로 결합:
systemPrompt + description + tone + debateStyle + knowledge pack +
Knowledge Sources (최대 8개, 우선순위 정렬, 청크 포함) +
judgmentCriteria + responseTemplate + challengeRules + evidenceRules + scorecard

Knowledge Source 표기: [reliability / P{priority}] title — summary
청크 표기: - Chunk {index+1}: {content.slice(0, 700)}

[generateText(agent, messages)] — 단일 응답 생성
[streamText(agent, messages, onToken)] — 스트리밍 응답, 전체 텍스트 반환

[Gemini 스트리밍 구현]
- URL: https://generativelanguage.googleapis.com/v1beta/models/{model}:streamGenerateContent?alt=sse&key={API_KEY}
- SSE 파싱: data: 라인을 개별 처리 (멀티라인 JSON 파싱 오류 방지)
- 429/503 재시도: 900ms × 2^n 지수 백오프, 최대 3회
- 폴백 모델: 기본 모델 → GEMINI_FALLBACK_MODEL env → "gemini-2.5-flash" 순
- agentType === "super_agent": 별도 system instruction 추가

[GitHub Models 스트리밍]
- URL: https://models.inference.ai.azure.com/chat/completions
- Authorization: Bearer GITHUB_TOKEN
- SSE data: [DONE] 처리
```

---

## Step 6: 토론 엔진

```
src/lib/debate.ts — Trinity Debate의 스트리밍 토론 엔진을 구현한다.

[streamDebate(question, agents, onToken, mode)]
- mode === "Creative Idea": buildCreativeDebatePrompt, temperature 0.85 moderator
- mode 그 외 (Feasibility 등): buildStreamingDebatePrompt, temperature 0.45 moderator
- streamText()로 Markdown 생성 후 parseMarkdownDebate() 파싱

[buildStreamingDebatePrompt(question, agents)]
Feasibility 모드 출력 형식 (LLM에 이 형식 강제):
## Question Framing, ## Evidence Scan, ## Opening Views,
## Cross Challenge, ## Refine Positions, ## Score & Trade-off,
## Consensus Map, ## Szg Synthesis
각 Agent 발언: ### {AgentName} · 1차 주장 / 상호 반박 / 최종 입장

[buildCreativeDebatePrompt(question, agents)]
Creative Idea 모드 출력 형식:
## Idea Spark — 씨앗 아이디어
  ### {AgentA} · 기술 탐색 / {AgentB} · 고객 공감 / {AgentC} · 사업 설계
## Build & Amplify — 보완과 융합
  ### {AgentA} · 기술로 보완 / {AgentB} · 고객으로 보완 / {AgentC} · 사업으로 보완
## Synergy Synthesis — 융합 아이디어

[parseMarkdownDebate(markdown, agents)] — 핵심
결론 감지: /^##\s+(최종 결론|Szg Synthesis|Trinity Synthesis|Synergy Synthesis)/m
Turn 헤딩 패턴: /^###\s+(.+?)\s+·\s+(.+?)\s*$/gm (임의 레이블 모두 매칭)
labelToRound:
- "상호 반박" → rebuttal
- "최종 입장" → final
- "보완" 포함 → rebuttal (Creative Idea 모드)
- 나머지 ("1차 주장", "탐색", "공감", "설계" 등) → opening
turns가 0이면 throw (에러 이벤트로 클라이언트에 전달)

[runMultiCallDebate(question, agents)] — DEBATE_MODE=multi 환경변수 시 사용
Opening → Rebuttal(이전 요약 주입) → Final → Szg Synthesis(결론)
```

---

## Step 7: Knowledge 시스템 + Super Agent

```
[1] src/lib/debate-knowledge.ts

extractDebateInsights(debateId, options):
- LLM(generateText)으로 토론 전사본에서 구조화된 인사이트 추출
- 출력: JSON 배열 (insightType, agentId, title, content, confidence, evidenceLevel, tags)
- JSON 파싱: ```json 코드블록 또는 [ 로 시작하는 배열 자동 감지
- 유효한 insightType만 허용 (10종)
- 최소 1개 이상이어야 createDebateInsights 호출

searchDebateInsights(params):
- listDebateInsights()로 전체 로드 후 query 텍스트 매칭
- status === "approved" 또는 includeDraft=true 시 "draft"도 포함

[2] src/lib/super-agent.ts

SuperAgentAnswerRequest: question, timeHorizon?, outputType?, includeDebateKnowledge?
SuperAgentAnswerResponse: answerId, answerMarkdown, references{knowledgeSources[], debateInsights[]}
SaveAnswersInput: question, scenarioMarkdown, businessMarkdown, executiveMarkdown

buildSuperAgentPrompt(params):
outputType별 instruction:
- scenario: 3개 시나리오 (Most Likely / High Upside / Overhyped)
  각 시나리오의 '고객 하루 생활 장면'은 10~15문장, 아침~저녁 서사 형식
- business_opportunity: 사업 기회(제품/서비스/B2B) + 실행 우선순위(Now/Next/Later)
- executive_brief: 핵심 결론 + 도메인 해석 + 근거 + 추천 + 스코어카드

buildContext(input):
- getAgent("future_life_super") — 없으면 에러
- searchKnowledgeSources(question, undefined, 8) — 전체 에이전트 소스 검색
- includeDebateKnowledge !== false 이면 searchDebateInsights

streamAnswerWithSuperAgent(input, onToken):
- DB 저장 없음 (순수 스트리밍만)
- \x02{meta JSON}\x03 마커를 스트림 끝에 append

saveAllAnswers(input: SaveAnswersInput): string (id 반환)
- createSuperAgentAnswer으로 3개 탭 내용을 1개 레코드에 저장
```

---

## Step 8: API 라우트

```
모든 API 라우트를 구현한다. 모든 라우트에 try-catch + JSON 에러 반환 필수.
export const runtime = "nodejs" 모든 라우트에 적용.

[GET /api/agents] — getAgents() 반환 (2쿼리, N+1 없음)
[PUT /api/agents] — updateAgents(body.agents) 

[POST /api/chat] — 스트리밍 채팅
- agentId, message, history, conversationId 수신
- saveConversation !== false 시 createConversation + addMessage
- streamText()로 LLM 응답
- 응답 완료 후 addMessage(assistant)
- X-Conversation-Id 헤더로 conversationId 반환

[POST /api/debate] — SSE 스트리밍 토론
- getAgents()로 에이전트 로드 (소스 포함)
- searchKnowledgeSourcesForAgents(question, agents, 6)로 질문 관련 소스 선별 (1쿼리)
- streamDebate() 실행 → event: token 전송
- createDebate() 저장 → event: done 전송
- 에러 시 event: error 전송

[GET /api/debates] — listDebates()
[GET /api/debates/[id]] — getDebate(id)
[POST /api/debates/[id]/extract-insights] — extractDebateInsights(id)
[GET /api/conversations/[id]] — getConversation(id)
[GET /api/recents] — listRecents()
[GET /api/debate-insights] — listDebateInsights(searchParams)
[PATCH /api/debate-insights/[id]] — updateDebateInsightStatus(id, status)

[GET /api/knowledge-sources] — listKnowledgeSources() 또는 searchKnowledgeSources()
[POST /api/knowledge-sources] — createKnowledgeSource(body)
[PUT /api/knowledge-sources/[id]] — updateKnowledgeSourceMeta(id, body)
[DELETE /api/knowledge-sources/[id]] — deleteKnowledgeSource(id)
[POST /api/knowledge-sources/[id]/ingest] — URL fetch 또는 파일 업로드 또는 텍스트 직접 입력
  * fetchUrl: true → URL fetch → HTML 태그 제거 → replaceKnowledgeSourceChunks
  * multipart/form-data → pdf-parse 또는 텍스트 추출 → replaceKnowledgeSourceChunks
  * { content } → replaceKnowledgeSourceChunks
[POST /api/knowledge-sources/preview] — URL fetch → 제목+내용 추출 후 미리보기 반환

[POST /api/super-agent/answer] — 스트리밍 전용 (DB 저장 없음)
  * streamAnswerWithSuperAgent() → 토큰 스트리밍 → \x02{meta}\x03 append
[GET /api/super-agent/answers] — listSuperAgentAnswerSummaries()
[POST /api/super-agent/answers] — saveAllAnswers() — 3탭 통합 저장
[GET /api/super-agent/answers/[id]] — getSuperAgentAnswerWithRefs(id)

[GET /api/health] — 환경변수·파일·DB 연결 진단 (Railway 배포 후 첫 확인용)
```

---

## Step 9: 메인 UI — 레이아웃 + Trinity Debate + Solo Lens

```
src/app/page.tsx (단일 파일 SPA)의 레이아웃, 사이드바, Trinity Debate, Solo Lens 탭 구현.

["use client"] 선언 필수.

[State 구조]
- tab: "debate" | "chat" | "admin" | "knowledge" | "future"
- agents: Agent[], selectedAgentId, selectedStudioAgentId
- debateMode: "Feasibility" | "Creative Idea" (기본값: "Creative Idea")
- debateDepth: "1" | "3" | "5"
- outputType: "Decision Memo" | "Executive Summary" | "Action Plan" | ...
- chatMessages, chatInput, conversationId, loading, notice
- question, debate, debateDraft, debateInsights, extractingInsights
- recents: RecentItem[], sidebarOpen
- kmAgentFilter, kmSearch, allKmSources, kmLoadingState, kmManualContent

[초기 로드] useEffect: Promise.all([loadAgents(), loadRecents()]) — 병렬 실행
[Knowledge Manager 탭] useEffect: tab==="knowledge" && allKmSources.length===0 → loadAllKmSources()

[레이아웃]
- 상단 topbar: 햄버거 메뉴 + "Trinity Eye" 브랜드
- 좌측 sidebar (sidebarOpen 시):
  * 내비게이션 5개: Trinity Debate / Solo Lens / Persona Studio / Knowledge Manager / Future Life Agent
  * History: recents 목록, badge(Debate/Chat/Answer), 새로고침 버튼

[Trinity Debate 탭]
- 질문 textarea (Enter 제출, Shift+Enter 줄바꿈)
- 설정 행: Debate Mode pill (Feasibility/Creative Idea) + Turns pill (1/3/5) + Output Type select
- 스트리밍 시: debateDraft를 Markdownish로 실시간 표시
- 완료 시: DebateStages 컴포넌트 (8단계 <details> 아코디언)
  * Question Framing, Evidence Scan, Opening Views, Cross Challenge,
    Refine Positions, Score & Trade-off, Consensus Map, Trinity Synthesis
  * 각 agent 발언 카드 (agentName + round 레이블)
- Insight 추출 버튼 → extractInsights() → insightItem 카드 (approve/reject)
- loadRecents()는 setNotice("토론이 완료됐습니다.") 이후가 아닌 이전에 호출
  (에러 메시지가 덮이지 않도록)

[Solo Lens 탭]
- 에이전트 선택 사이드바: agentType !== "super_agent" 로 필터 (Future Life Agent 제외)
- 스트리밍 채팅 (채팅 버블 + Markdownish 렌더링)
- 하단: Compare Perspectives 버튼 + Send to Trinity Debate 버튼

[readEventStream 함수]
- SSE 파싱: buffer.split("\n\n")로 이벤트 분리
- processEvent: event: / data: 라인 파싱 → handlers.token/done/error 호출
- handlers.error가 throw하면 Promise rejection으로 전파

[loadRecents 함수]
- 실패 시 notice 설정하지 않고 조용히 무시 (백그라운드 갱신이므로)
```

---

## Step 10: 메인 UI — Persona Studio + Knowledge Manager + Future Life Agent

```
page.tsx의 나머지 3개 탭을 구현한다.

[Persona Studio 탭 (admin)]
- 에이전트 선택 탭
- Basic Profile 섹션: name, role, personaType, provider, model, temperature, tone, debateStyle
- Professional Reasoning 섹션: systemPrompt, knowledge, judgmentCriteria, debateBehavior,
  responseTemplate, challengeRules, evidenceRules, scorecard
- Persona Test: 입력 → askAgent(saveConversation=false) → 결과 표시
- Knowledge Source Manager (Persona Studio용):
  * Quick URL 입력 → fetchUrlPreview → 폼 자동 채우기 → Add Source
  * 소스별: Index URL / 파일 업로드 / 수동 텍스트 입력

[Knowledge Manager 탭 (knowledge)]
- Add Source 패널:
  * Agent 선택 (super_agent 제외)
  * URL 입력 + URL 미리보기 → 폼 자동 채우기 → Add Source
- 소스 목록:
  * Agent 필터 탭 + 텍스트 검색
  * 소스 카드: title, url, summary, reliability badge, priority badge, 상태
  * 인라인 편집 (title, summary, reliability, priority, tags, domainId)
  * Index URL 버튼 / Upload PDF/TXT 버튼 / 수동 텍스트 textarea + Index Text 버튼
  * 삭제 버튼

[Future Life Agent 탭 (future)]
- 질문 textarea (Tab키 → 예시 질문 자동 완성)
- Time Horizon 선택: 3y / 5y / 10y
- Debate Knowledge 포함 체크박스
- 3개 결과 탭: Future Scenario / Business Opportunity / Executive Summary
  * 탭 버튼: 생성 중(spinner) / 완료(✓) 상태 표시
  * loadingByType: 탭별 독립 로딩 상태
  * 첫 토큰 도착 시에만 loadingByType[key]=false (이전은 "생성 중..." 표시 유지)
- ScenarioView: ## 헤딩으로 시나리오 파싱, ### 헤딩으로 섹션 파싱
  * 고객 하루 생활 장면 → 카드(primary), 나머지 → <details> 접기
- BusinessView: # 헤딩으로 섹션 파싱
  * "실행" 포함 섹션 → Now/Next/Later 그리드
- 참고 지식 패널: Knowledge Sources (링크) + Debate Insights

[askSuperAgent 흐름]
1. 3개 callOne 병렬 시작 (Promise.allSettled)
2. 각 callOne: 스트리밍 → 첫 토큰 도착 시 loadingByType[key]=false → 최종 markdown 반환
3. 모두 완료 후: POST /api/super-agent/answers로 3탭 내용 1개 레코드 저장
4. loadRecents()

[openRecent 함수]
- kind==="answer": GET /api/super-agent/answers/[id] → scenarioMarkdown, businessMarkdown, executiveMarkdown 복원
  * 비어 있는 탭은 null로 설정 (표시 안 함)
- kind==="discussion": GET /api/debates/[id] → setDebate
- kind==="chat": GET /api/conversations/[id] → setChatMessages, setConversationId

[Markdownish 컴포넌트]
- 커스텀 Markdown 렌더러: ##/###/#### 헤딩, **bold**, `code`, 링크, ul, ol, table
- parseMarkdownBlocks(): 블록 단위 파싱
- renderInlineMarkdown(): 인라인 요소 처리
```

---

## Step 11: Railway 배포

```
Railway에 배포하고 환경 변수를 설정한다.

[1] Git 저장소 설정
- GitHub에 리포지토리 생성 (예: yourname/trinitySzg)
- git remote add origin + push

[2] Railway 프로젝트 설정
- railway.app에서 GitHub 연동
- 서비스 → Variables 탭에서 아래 환경 변수 추가:
  GEMINI_API_KEY=<Google AI Studio에서 발급>
  GEMINI_FALLBACK_MODEL=gemini-2.5-flash
  SUPABASE_URL=<Supabase 프로젝트 URL>
  SUPABASE_DB_URL=<Supabase Settings > Database > Connection String (비밀번호 포함)>
  PGSSLMODE=require
- NODE_ENV=production 자동 설정됨

[3] Supabase 사전 준비
- Supabase 프로젝트 생성
- Settings > Database > Connection Pooling에서 Connection String 복사
  (Transaction mode가 아닌 Session mode / Direct connection 사용 권장)

[4] 첫 배포 후 확인
- Railway 자동 빌드 완료 후 앱 URL 접속
- /api/health 엔드포인트로 환경 진단:
  {"ok":true,"checks":{"supabase_db_url":"set","db":"ok (4 agents)",...}}
- DB는 첫 요청 시 자동 초기화 (Migration SQL 실행, 에이전트 시드)

[5] 스키마 확인 팁
- cold start 첫 요청은 DB 초기화로 약 5~10초 소요
- 이후 요청은 isSchemaReady() 덕분에 빠름
- Supabase Dashboard > Table Editor에서 agents, knowledge_sources 테이블 확인
```

---

## Step 12: 기능 검증 체크리스트

```
배포 후 순서대로 확인한다.

□ /api/health → ok: true, db: "ok (4 agents)"
□ 페이지 로드 → 에이전트 3종 로드 (Future Life Agent는 Solo Lens에 미표시)
□ Trinity Debate → Creative Idea 모드로 토론 실행 → History에 1개 항목 저장
□ Trinity Debate → Feasibility 모드 실행 → History 저장
□ Trinity Debate → Insight 추출 → Approve/Reject 작동
□ Solo Lens → Tech Strategist와 채팅 → History에 Chat 항목 저장
□ Solo Lens → Compare Perspectives 작동
□ Persona Studio → Agent 설정 편집 후 저장
□ Knowledge Manager → URL 추가 → Index URL
□ Knowledge Manager → PDF 업로드 → 청크 생성 확인
□ Future Life Agent → 질문 입력 → 3탭 동시 스트리밍
□ Future Life Agent → 완료 후 History 1개만 저장
□ History 항목 클릭 → 3탭 내용 모두 복원
□ History > 새로고침 버튼 작동
```

---

## 참고: 핵심 설계 결정 요약

| 결정 | 이유 |
|------|------|
| SQLite → Supabase 처음부터 | Railway 배포 시 파일 기반 DB는 재시작 시 초기화 |
| pg-worker child process | Next.js 동기 API 스타일 유지 + pg는 비동기 전용 |
| exec_batch | Migration 9개 CREATE TABLE을 1 DB 연결로 처리 |
| isSchemaReady 체크 | warm restart 시 22개 ensureColumn 건너뜀 |
| getAgents() 2쿼리 | N+1 제거: 에이전트별 listKnowledgeSources 호출 금지 |
| searchKnowledgeSourcesForAgents | 토론 시 3×2=6쿼리 → 1쿼리로 감소 |
| GROUP BY agents.name 명시 | Postgres는 SELECT에 있는 joined 컬럼 GROUP BY 필수 |
| parseMarkdownDebate 범용 패턴 | Creative Idea 모드 헤딩(기술 탐색 등)도 파싱 |
| 3탭 → 1 DB 레코드 | History 1개 항목 + 모든 탭 복원 가능 |
| loadRecents 조용한 실패 | 백그라운드 갱신 실패가 성공 notice를 덮지 않도록 |
