# Trinity Eye — CLAUDE.md

> 이 파일은 Claude Code가 이 프로젝트를 이해하고 작업하기 위한 핵심 참조 문서입니다.

---

## 프로젝트 개요

**Trinity Eye** (패키지명: `trinity-szg`)는 3개의 AI 전문가 Agent가 하나의 질문에 대해 토론하거나, 사용자가 개별 Agent와 1:1로 대화하고, Super Agent가 미래 시나리오를 생성하는 의사결정 지원 플랫폼입니다.

- **저장소**: github.com/skykelly/trinitySzg
- **프레임워크**: Next.js 16 (App Router, Node.js runtime — Edge 미사용)
- **DB**: Supabase Postgres (`SUPABASE_DB_URL` 연결)
- **LLM**: Google Gemini API (기본), GitHub Models OpenAI 호환 (선택)
- **Node.js**: ≥ 22 (`package.json engines` 필드로 고정)

---

## 디렉토리 구조

```
src/
  app/
    page.tsx                               # 단일 페이지 SPA (2100+ 줄)
    globals.css                            # 전역 스타일
    layout.tsx                             # HTML 루트 레이아웃
    api/
      agents/route.ts                      # GET/PUT — Agent 목록·수정
      chat/route.ts                        # POST — 개별 Agent 스트리밍 채팅
      debate/route.ts                      # POST — 3-Agent 토론 (SSE)
      debates/route.ts                     # GET — 토론 목록
      debates/[id]/route.ts                # GET — 토론 상세
      debates/[id]/extract-insights/route.ts  # POST — Insight 추출
      conversations/[id]/route.ts          # GET — 대화 상세
      recents/route.ts                     # GET — 최근 토론+대화 통합 목록
      knowledge-sources/route.ts           # GET/POST — Knowledge Source 관리
      knowledge-sources/[id]/route.ts      # PUT/DELETE — 개별 소스 수정·삭제
      knowledge-sources/[id]/ingest/route.ts  # POST — 원문 인덱싱
      knowledge-sources/preview/route.ts   # POST — URL fetch 미리보기
      agent-opinions/route.ts              # GET/POST — Agent Opinion 관리
      debate-insights/route.ts             # GET — Insight 목록
      debate-insights/[id]/route.ts        # PATCH — Insight 상태 변경
      super-agent/answer/route.ts          # POST — Super Agent 스트리밍 답변
      super-agent/answers/route.ts         # GET — 답변 목록
      super-agent/answers/[id]/route.ts    # GET — 답변 상세
      admin/restore-db/route.ts            # POST — DB 복구 (어드민용)
  lib/
    types.ts           # 공통 TypeScript 타입 정의
    db.ts              # Supabase Postgres DB 접근 레이어 (동기식 래퍼)
    pg-sync.ts         # PostgresSync 클래스 — 동기 실행 브리지
    pg-worker.cjs      # 자식 프로세스로 실제 pg 쿼리를 실행하는 CJS 모듈
    llm.ts             # LLM 호출 추상화 (Gemini / GitHub Models)
    debate.ts          # 토론 로직 (스트리밍 / 멀티콜)
    super-agent.ts     # Super Agent 프롬프트 빌더 + 스트리밍 실행
    debate-knowledge.ts  # Debate Insight 검색 헬퍼
    default-agents.ts  # 기본 Agent 3종 설정값 (시드)
supabase/
  migrations/
    202605130001_initial_schema.sql        # Postgres 초기 스키마
app/
  data/
    app.db                                 # (레거시) SQLite — 마이그레이션 후 미사용
    knowledge_sources.json                 # Knowledge Source 초기 시드 데이터
    migraion_data.json                     # 도메인 카테고리 + 케이스 데이터
scripts/
  migrate-sqlite-to-supabase.mjs           # SQLite → Supabase 마이그레이션 스크립트
```

---

## 데이터베이스

### DB 접근 구조

Next.js App Router는 비동기 환경이지만 `pg` 라이브러리는 비동기 전용이므로, 동기식 래퍼를 구현했습니다:

```
db.ts (동기 API 사용)
  └─> pg-sync.ts (PostgresSync 클래스)
        └─> execFileSync(pg-worker.cjs) — 자식 프로세스로 pg 쿼리 실행
```

- `pg-worker.cjs`: `better-sqlite3`와 유사한 API(`.all()`, `.get()`, `.run()`, `.exec()`)를 JSON 직렬화로 브리지
- `ensureColumn()`: 컬럼이 없으면 `ALTER TABLE`로 자동 추가 — 무중단 스키마 확장

### 스키마 (supabase/migrations/202605130001_initial_schema.sql)

| 테이블 | 주요 컬럼 | 설명 |
|---|---|---|
| `agents` | id, name, role, agent_type, model, system_prompt, ... | AI Agent 설정 |
| `conversations` | id, agent_id, title | 채팅 세션 |
| `messages` | conversation_id, role, content | 채팅 메시지 |
| `debates` | id, question, conclusion | 완료된 토론 |
| `debate_turns` | debate_id, agent_id, round, content | 토론 발언 |
| `knowledge_sources` | agent_id, title, url, reliability, priority, content_status | Knowledge Source 메타 |
| `knowledge_chunks` | source_id, chunk_index, content | RAG용 원문 청크 |
| `domain_categories` | id, name, sub, type, insight | 도메인 분류 체계 |
| `debate_insights` | debate_id, insight_type, confidence, evidence_level, status | 토론에서 추출한 인사이트 |
| `agent_opinions` | agent_id, question, claim, confidence | Agent 의견 아카이브 |
| `super_agent_answers` | question, answer_markdown, referenced_*, answer_type | Super Agent 답변 |

### 앱 기동 시 자동 처리 (db.ts `getDb()`)

1. `202605130001_initial_schema.sql` 실행 (IF NOT EXISTS이므로 멱등)
2. `ensureColumn()`으로 누락 컬럼 자동 ALTER
3. `agents` 테이블이 비어 있으면 `defaultAgents` 3종 INSERT
4. 기존 specialist_agent는 core 프롬프트 필드 force-update (이름은 보존)
5. `knowledge_sources.json`, `migraion_data.json` 시드 데이터 INSERT (ON CONFLICT DO NOTHING)

---

## AI Agent 구성

### Specialist Agents (3종)

| ID | 이름 | 관점 | 모델 | Temperature |
|---|---|---|---|---|
| `tech` | Tech Strategist | 기술 가능성·아키텍처·구현 리스크 | gemini-2.5-flash-lite | 0.5 |
| `customer` | Customer Advocate | 고객 니즈·UX·수용성·행동 변화 | gemini-2.5-flash-lite | 0.7 |
| `business` | Business Realist | 사업 실행성·ROI·우선순위·리스크 | gemini-2.5-flash-lite | 0.6 |

### Agent 필드 구조

각 Agent는 다음 필드를 가집니다 (`src/lib/types.ts` `Agent` 타입):

| 필드 | 용도 |
|---|---|
| `systemPrompt` | 핵심 역할 정의 |
| `knowledge` | Knowledge Pack 설명 |
| `judgmentCriteria` | 판단 기준 항목 |
| `debateBehavior` | 반박 성향, 양보 기준 |
| `responseTemplate` | 응답 구조 템플릿 |
| `challengeRules` | 타 Agent 주장 반박 규칙 |
| `evidenceRules` | 근거 수준 표기 기준 (High/Medium/Low) |
| `scorecard` | 평가 점수 항목 |

### Agent 타입 (`agentType`)

- `specialist_agent` — Tech / Customer / Business 3종 (기본)
- `moderator_agent` — 토론 진행자 (runtime 생성, DB 비저장)
- `super_agent` — Future Life Agent (DB에 존재할 수 있음)

### 시드 업데이트 정책

- `specialist_agent`: core 프롬프트 필드 **force-update** (사용자가 Persona Studio에서 변경해도 앱 재시작 시 덮어씀. 단, `name` 필드는 보존)
- 그 외 타입: 빈 필드만 **soft-update**

---

## LLM 레이어 (`src/lib/llm.ts`)

### Provider

| Provider | 인증 환경변수 | 스트리밍 방식 |
|---|---|---|
| Google Gemini | `GEMINI_API_KEY` | SSE (`streamGenerateContent?alt=sse`) |
| GitHub Models | `GITHUB_TOKEN` | SSE (OpenAI 호환 `/chat/completions`) |

### 주요 함수

- **`generateText()`** — 단일 응답 생성 (멀티콜 토론 모드용)
- **`streamText()`** — 스트리밍 응답 (채팅·토론·Super Agent 기본)

### System Prompt 합성

`fullSystemPrompt(agent)`가 다음을 하나로 조합합니다:

```
systemPrompt + description + tone + debateStyle
+ knowledgePack + Knowledge Sources (최대 8개, RAG 청크 포함)
+ judgmentCriteria + responseTemplate + challengeRules + evidenceRules + scorecard
```

### 폴백 & 재시도

- 기본 모델 실패 → `GEMINI_FALLBACK_MODEL` 환경변수 → `gemini-2.5-flash` 순으로 전환
- 429/503 응답: 지수 백오프(900ms × 2^n) 후 재시도, Quota 소진 시 즉시 다음 모델로 전환
- Gemini SSE: `data:` 라인을 개별 파싱 (멀티라인 JSON 파싱 오류 방지)

---

## 토론 엔진 (`src/lib/debate.ts`)

### 스트리밍 모드 (기본)

단일 LLM 호출로 중립 진행자가 3개 페르소나의 토론 전체를 생성합니다.

**출력 구조 (8단계 Markdown)**:
1. Question Framing
2. Evidence Scan
3. Opening Views
4. Cross Challenge
5. Refine Positions
6. Score & Trade-off
7. Consensus Map
8. Trinity Synthesis (최종 결론)

`parseMarkdownDebate()`로 `### AgentName · 라운드명` 헤딩을 파싱해 `DebateTurn[]` 추출 후 DB 저장.

### Debate Mode

| Mode | 진행자 Temperature | 특성 |
|---|---|---|
| `Feasibility` | 0.45 | 중립 균형형, 실행 가능성 중심 |
| `Creative Idea` | 0.85 | 협력형 아이디어 확장, 5년 내 실현 가능한 창의적 조합 |

Creative Idea 모드에서는 각 Agent가 재정의됩니다:
- Tech Strategist → **기술 탐색가** (현재 또는 2~5년 내 기술의 새로운 조합 탐색)
- Customer Advocate → **고객 공감가** (실제 고객 행동 패턴 기반 욕구 발굴)
- Business Realist → **사업 연결가** (비즈니스 모델과 수익 가능성 탐색)

### 멀티콜 모드 (`DEBATE_MODE=multi` 환경변수)

1. Opening: Agent 3개 순차 호출
2. Rebuttal: 이전 발언 요약 주입 후 각 Agent 재호출
3. Final: 전체 토론 요약 주입 후 최종 입장 생성
4. Conclusion: 중립 진행자가 Szg Synthesis 작성

### 메타데이터 주입

`debate/route.ts`에서 `debateDepth` (Turns)를 질문에 append해 LLM에 전달:
```
{question}\nTurns: {debateDepth}
```

---

## Knowledge Source 시스템

### 구조

- **Source**: 제목, URL, sourceType, reliability (very_high/high/medium/low), priority (1~5), summary, tags
- **Chunk**: 원문을 최대 1,400자 단위로 분할, 180자 overlap, 최대 80 chunks/source

### 인덱싱 방법

| 방법 | 설명 |
|---|---|
| URL 자동 fetch | 서버에서 URL fetch → HTML 태그 제거 후 텍스트 추출 |
| 파일 업로드 | PDF (pdf-parse), TXT, MD 파일 업로드 |
| 수동 텍스트 | 접근 제한 페이지 원문을 직접 붙여넣기 |

### RAG 검색 (`searchKnowledgeSources` / `searchKnowledgeChunks`)

- 쿼리를 토큰화 (2자 이상, 최대 24개, 유니코드 지원)
- title boost(×4), tag boost(×3), reliability/priority 가중치 적용
- 상위 6~8개 Source + 관련 Chunk를 LLM system prompt에 삽입

---

## Super Agent (`src/lib/super-agent.ts`)

Knowledge Source, Debate Insight, Agent Opinion을 종합해 미래 시나리오를 생성합니다.

### 답변 타입 (`outputType`)

| 타입 | 내용 |
|---|---|
| `future_life_answer` | 고객 미래 생활 변화 종합 분석 (response template 전체) |
| `scenario` | Most Likely / Alternative / Wildcard 3개 시나리오 |
| `business_opportunity` | 사업 기회 분석 |
| `executive_brief` | 임원 브리핑용 요약 |

### 스트리밍 메타데이터 프로토콜

SSE 대신 raw 스트림에 `\x02{json}\x03` 마커로 메타데이터를 append합니다:
```
<답변 텍스트 토큰들>...<STX>{answerId, references}<ETX>
```

---

## UI 구조 (`src/app/page.tsx`)

단일 파일 SPA (~2135줄). `Tab` 타입으로 탭 간 전환:

```typescript
type Tab = "admin" | "chat" | "debate" | "future" | "knowledge";
```

### 사이드바

- 내비게이션: Trinity Debate / Solo Lens / Persona Studio / Knowledge Manager / Future Life Agent
- History: 최근 토론·대화·Super Agent 답변 목록 (클릭 시 복원)

### Trinity Debate 탭 (`debate`)

- 질문 입력 (Enter로 제출, Shift+Enter 줄바꿈)
- **Debate Mode**: Feasibility / Creative Idea (pill 버튼)
- **Turns**: 1 / 3 / 5 (pill 버튼)
- **Output Type**: Executive Summary / Decision Memo / Action Plan / Risk Review / Product Concept / Strategy Canvas
- SSE 스트리밍 실시간 출력
- DebateStages: 8단계 `<details>` 아코디언으로 토론 과정 표시
- 토론 완료 후 Insight 추출 버튼 노출

### Solo Lens 탭 (`chat`)

- Agent 선택 (Tech / Customer / Business)
- 스트리밍 채팅
- Compare Perspectives: 다른 2개 Agent의 같은 질문 응답 비교
- Send to Trinity Debate: 현재 질문을 토론 탭으로 전달

### Persona Studio 탭 (`admin`)

- Agent별 프로필 편집 (이름, 역할, 페르소나, 톤, 모델, temperature 등)
- Knowledge Source Manager: URL 인덱싱·파일 업로드·수동 텍스트
- Professional Reasoning 편집: Response Template, Challenge Rules, Evidence Rules, Scorecard
- Persona Test: 특정 질문으로 Agent 즉시 테스트

### Knowledge Manager 탭 (`knowledge`)

- 전체 Knowledge Source 목록 (Agent 필터 + 검색)
- 인라인 편집 (title, summary, reliability, priority, tags, domainId)
- 소스 추가 + URL 인덱싱

### Future Life Agent 탭 (`future`)

- 질문 입력 (Tab키로 예시 질문 자동 완성)
- Time Horizon: 3y / 5y / 10y
- 답변 타입별 탭: Scenario / Business / Executive
- 참조 소스 / Debate Insight / Agent Opinion 표시

---

## API 라우트 목록

| 메서드 | 경로 | 기능 |
|---|---|---|
| GET | `/api/agents` | Agent 목록 (knowledge sources 포함) |
| PUT | `/api/agents` | Agent 일괄 수정 |
| POST | `/api/chat` | Agent와 스트리밍 채팅 (SSE) |
| POST | `/api/debate` | 3-Agent 토론 (SSE) |
| GET | `/api/debates` | 토론 목록 |
| GET | `/api/debates/[id]` | 토론 상세 |
| POST | `/api/debates/[id]/extract-insights` | Debate Insight 추출 |
| GET | `/api/conversations/[id]` | 대화 상세 |
| GET | `/api/recents` | 최근 토론+대화+답변 통합 |
| GET | `/api/knowledge-sources` | Knowledge Source 목록·검색 |
| POST | `/api/knowledge-sources` | Knowledge Source 추가 |
| PUT/DELETE | `/api/knowledge-sources/[id]` | 소스 수정·삭제 |
| POST | `/api/knowledge-sources/[id]/ingest` | 원문 인덱싱 |
| POST | `/api/knowledge-sources/preview` | URL 내용 미리보기 |
| GET/POST | `/api/agent-opinions` | Agent Opinion 목록·생성 |
| GET | `/api/debate-insights` | Debate Insight 목록 |
| PATCH | `/api/debate-insights/[id]` | Insight 상태 변경 |
| POST | `/api/super-agent/answer` | Super Agent 스트리밍 답변 |
| GET | `/api/super-agent/answers` | Super Agent 답변 목록 |
| GET | `/api/super-agent/answers/[id]` | Super Agent 답변 상세 |
| POST | `/api/admin/restore-db` | DB 복구 (어드민) |

모든 API 라우트: `export const runtime = "nodejs"` (Edge 미사용)

---

## 환경 변수

| 변수 | 필수 | 설명 |
|---|---|---|
| `GEMINI_API_KEY` | 필수 | Google Gemini API 키 |
| `SUPABASE_URL` | 필수 | Supabase 프로젝트 URL |
| `SUPABASE_DB_URL` | 필수 | Supabase Postgres connection string (비밀번호 포함) |
| `GITHUB_TOKEN` | 선택 | GitHub Models 사용 시 |
| `GEMINI_FALLBACK_MODEL` | 선택 | Quota 소진 시 폴백 모델명 |
| `DEBATE_MODE` | 선택 | `multi` 설정 시 멀티콜 토론 모드 활성화 |
| `PGSSLMODE` | 선택 | 기본값 `require` |

---

## 개발 명령

```bash
npm run dev          # 개발 서버 (Next.js turbopack)
npm run build        # 프로덕션 빌드
npm run start        # 프로덕션 서버
npm run migrate:db   # SQLite → Supabase 데이터 마이그레이션
npm run lint         # ESLint
```

---

## 알려진 이슈 / 설계 결정

| 항목 | 내용 |
|---|---|
| Postgres 동기 브리지 | Next.js App Router에서 `pg`(비동기)를 동기 API처럼 쓰기 위해 `execFileSync`로 자식 프로세스 실행. 성능보다 코드 단순성 우선 |
| Gemini SSE 멀티라인 | 한 이벤트 블록에 `data:` 라인이 여러 개일 때 JSON 파싱 실패 → 라인별 개별 파싱으로 수정 |
| Supabase DB URL | Supabase 프로젝트 URL만으로는 DB 접속 불가 — Settings > Database의 connection string(비밀번호 포함) 필요 |
| specialist_agent 프롬프트 덮어쓰기 | 앱 재시작마다 core 프롬프트 필드가 `default-agents.ts`로 리셋됨. Persona Studio에서 수정해도 재시작 시 복원됨 (`name` 필드 제외) |
| Super Agent 메타데이터 | SSE 대신 raw 스트림 + `\x02...\x03` 마커 방식 사용. 클라이언트에서 `indexOf('\x02')` 로 분리 |
| page.tsx 단일 파일 | UI 전체가 2100+ 줄 단일 파일. 컴포넌트 분리 시 import 경로 주의 |
