# TrinitySzg — 구현 현황

> 최종 업데이트: 2026-05-12

---

## 프로젝트 개요

**Trinity Eye** (구 TrinitySzg)는 3개의 AI 전문가 Agent가 하나의 질문에 대해 토론하거나, 사용자가 개별 Agent와 1:1로 대화할 수 있는 의사결정 지원 플랫폼입니다.

- **프레임워크**: Next.js 16 (App Router, Node.js runtime)
- **DB**: Node.js 내장 `node:sqlite` — `data/app.db`에 저장
- **LLM**: Google Gemini API, GitHub Models (OpenAI 호환)
- **배포**: Railway (퍼시스턴트 볼륨 필요: `/app/data`)
- **저장소**: github.com/skykelly/trinitySzg

---

## 디렉토리 구조

```
src/
  app/
    page.tsx                          # 단일 페이지 전체 UI
    globals.css                       # 전역 스타일
    layout.tsx                        # HTML 루트 레이아웃
    api/
      agents/route.ts                 # GET/PUT — Agent 목록 조회·수정
      chat/route.ts                   # POST — 개별 Agent 스트리밍 채팅
      debate/route.ts                 # POST — 3-Agent 토론 스트리밍
      debates/route.ts                # GET — 토론 목록
      debates/[id]/route.ts           # GET — 토론 상세
      conversations/[id]/route.ts     # GET — 대화 상세
      recents/route.ts                # GET — 최근 토론+대화 통합 목록
      knowledge-sources/route.ts      # GET/POST — Knowledge Source 관리
      knowledge-sources/[id]/ingest/route.ts  # POST — 원문 인덱싱
  lib/
    types.ts           # 공통 TypeScript 타입
    db.ts              # SQLite DB 접근 레이어
    llm.ts             # LLM 호출 추상화 (Gemini / GitHub Models)
    debate.ts          # 토론 로직 (스트리밍 / 멀티콜)
    default-agents.ts  # 기본 Agent 3종 설정값
data/
  app.db                    # SQLite DB (gitignore)
  knowledge_sources.json    # 초기 Knowledge Source 시드 데이터
```

---

## 데이터베이스 스키마

Node.js 22+ 내장 `node:sqlite` 사용. 앱 기동 시 자동 생성.

| 테이블 | 설명 |
|---|---|
| `agents` | AI Agent 설정 (페르소나, 모델, 프롬프트 등) |
| `conversations` | 채팅 세션 |
| `messages` | 채팅 메시지 (user / assistant / system) |
| `debates` | 완료된 토론 |
| `debate_turns` | 토론 발언 (agentId, round, content) |
| `knowledge_sources` | Agent별 지식 소스 메타데이터 |
| `knowledge_chunks` | 소스 원문을 분할한 청크 (RAG용) |

`ensureColumn()`으로 컬럼이 없으면 자동 ALTER TABLE 처리 — 무중단 스키마 확장.

---

## AI Agent 3종

| ID | 이름 | 관점 | 모델 | Temperature |
|---|---|---|---|---|
| `tech` | Tech Strategist | 기술 가능성·아키텍처·구현 리스크 | gemini-2.5-flash-lite | 0.5 |
| `customer` | Customer Advocate | 고객 니즈·UX·수용성·행동 변화 | gemini-2.5-flash-lite | 0.7 |
| `business` | Business Realist | 사업 실행성·ROI·우선순위·리스크 | gemini-2.5-flash-lite | 0.6 |

각 Agent는 다음 필드를 가집니다:

- `systemPrompt` — 역할 정의
- `knowledge` — Knowledge Pack 설명
- `judgmentCriteria` — 판단 기준 항목
- `debateBehavior` — 반박 성향, 양보 기준
- `responseTemplate` — 응답 구조 템플릿
- `challengeRules` — 다른 Agent 주장 반박 규칙
- `evidenceRules` — 근거 수준 표기 기준 (High/Medium/Low)
- `scorecard` — 평가 점수 항목

---

## LLM 레이어 (`llm.ts`)

### 지원 Provider

| Provider | 인증 | 스트리밍 방식 |
|---|---|---|
| Google Gemini | `GEMINI_API_KEY` | SSE (`streamGenerateContent?alt=sse`) |
| GitHub Models | `GITHUB_TOKEN` | SSE (OpenAI 호환) |

### 주요 기능

- **`generateText()`** — 단일 응답 생성 (토론 멀티콜 모드용)
- **`streamText()`** — 스트리밍 응답 생성 (채팅·토론 기본 모드)
- **자동 폴백**: 기본 모델 → `GEMINI_FALLBACK_MODEL` 환경변수 → `gemini-2.5-flash` 순으로 시도
- **Quota 재시도**: 429/503 응답 시 지수 백오프(900ms × 2^n), Quota 소진 시 다음 모델로 즉시 전환
- **System Prompt 조합**: systemPrompt + description + tone + debateStyle + knowledgePack + Knowledge Sources + judgmentCriteria + responseTemplate + challengeRules + evidenceRules + scorecard를 하나의 system prompt로 합성
- **SSE 파싱**: `data:` 라인을 개별 처리 (멀티라인 JSON 파싱 오류 방지)

---

## 토론 엔진 (`debate.ts`)

### 스트리밍 모드 (기본)

1. 중립 진행자 Agent가 3개 페르소나의 토론을 **한 번의 스트리밍 호출**로 생성
2. 출력 형식: Markdown (Question Framing → Evidence Scan → Opening Views → Cross Challenge → Refine Positions → Score & Trade-off → Consensus Map → 최종 결론)
3. `parseMarkdownDebate()`로 `### AgentName · 라운드명` 헤딩을 파싱해 `DebateTurn[]` 추출

### 멀티콜 모드 (`DEBATE_MODE=multi` 환경변수)

1. Opening: Agent 3개 순차 호출
2. Rebuttal: 이전 발언 요약 주입 후 각 Agent 재호출
3. Final: 전체 토론 요약 주입 후 최종 입장 생성
4. Conclusion: 중립 진행자가 전체 취합 후 Szg Synthesis 작성

### 토론 메타데이터 주입

- `Debate Mode`, `Depth`, `Output Type`을 질문에 append해서 LLM에 전달
- 각 Agent의 Knowledge Sources (최대 6개, RAG 청크 포함)를 프롬프트에 삽입

---

## Knowledge Source 시스템

### 구조

- **Source**: 제목, URL, sourceType, reliability(very_high/high/medium/low), priority(1~5), summary, tags
- **Chunk**: 원문을 최대 1,400자 단위로 분할, 180자 overlap, 최대 80 chunks/source

### 인덱싱 방법 3가지

| 방법 | 설명 |
|---|---|
| URL 자동 fetch | 서버에서 URL을 fetch → HTML 태그 제거 후 텍스트 추출 |
| 파일 업로드 | PDF(pdf-parse), TXT, MD 파일 업로드 |
| 수동 텍스트 | 접근 제한 페이지 원문을 직접 붙여넣기 |

### RAG 검색 (`searchKnowledgeChunks`)

- 쿼리를 토큰화(2자 이상, 최대 24개)
- title boost(×4), tag boost(×3), reliability/priority 가중치 적용
- 상위 6개 Source + 관련 Chunk를 LLM 프롬프트에 삽입

---

## API 라우트 목록

| 메서드 | 경로 | 기능 |
|---|---|---|
| GET | `/api/agents` | Agent 목록 조회 |
| PUT | `/api/agents` | Agent 일괄 수정 |
| POST | `/api/chat` | Agent와 스트리밍 채팅 |
| POST | `/api/debate` | 3-Agent 토론 실행 (SSE) |
| GET | `/api/debates` | 토론 목록 |
| GET | `/api/debates/[id]` | 토론 상세 |
| GET | `/api/conversations/[id]` | 대화 상세 |
| GET | `/api/recents` | 최근 토론+대화 통합 |
| GET | `/api/knowledge-sources` | Knowledge Source 목록/검색 |
| POST | `/api/knowledge-sources` | Knowledge Source 추가 |
| POST | `/api/knowledge-sources/[id]/ingest` | 원문 인덱싱 |

---

## UI 탭 구조

### 사이드바 (기본 열림)

- 헤더: **전문가 AI**
- 내비게이션 버튼 3개 (우측에 회색 힌트 텍스트):
  - Trinity Debate — `AI간 토론`
  - Solo Lens — `AI와 대화`
  - Persona Studio — `학습/조정`
- **History**: 최근 토론·대화 목록, 클릭 시 복원

### Trinity Debate 탭

- 질문 입력
- 설정: Debate Mode (Balanced/Critical/Opportunity/Execution/Investment Review/C-Level Briefing), Debate Depth, Output Type
- 실시간 스트리밍 출력
- **DebateStages 컴포넌트**: 8단계 `<details>` 아코디언으로 토론 과정 표시
  1. Question Framing
  2. Evidence Scan
  3. Opening Views
  4. Cross Challenge
  5. Refine Positions
  6. Score & Trade-off
  7. Consensus Map
  8. Trinity Synthesis (최종 결론)

### Solo Lens 탭 (1:1 채팅)

- Agent 선택 (Tech / Customer / Business)
- 스트리밍 채팅
- **Compare Perspectives**: 다른 2개 Agent의 같은 질문 응답 비교
- **Send to Trinity Debate**: 현재 질문을 토론 탭으로 전달

### Persona Studio 탭 (어드민)

- Agent별 프로필 편집 (이름, 역할, 페르소나 타입, 톤, 모델, temperature 등)
- **Knowledge Source Manager**: 소스 추가·검색·URL 인덱싱·파일 업로드·수동 텍스트 인덱싱
- **Professional Reasoning**: Response Template, Challenge Rules, Evidence Rules, Scorecard 편집
- **Persona Test**: 특정 질문으로 Agent 즉시 테스트

---

## 환경 변수

| 변수 | 필수 | 설명 |
|---|---|---|
| `GEMINI_API_KEY` | 필수 | Google Gemini API 키 |
| `GITHUB_TOKEN` | 선택 | GitHub Models 사용 시 필요 |
| `GEMINI_FALLBACK_MODEL` | 선택 | Quota 소진 시 폴백 모델명 |
| `DEBATE_MODE` | 선택 | `multi` 설정 시 멀티콜 토론 모드 |
| `NODE_ENV` | Railway | `production` |

---

## 배포 (Railway)

- Node.js ≥ 22 필수 (`node:sqlite` 요구사항) — `package.json`의 `engines` 필드로 고정
- **퍼시스턴트 볼륨** 필수: Mount Path `/app/data` — 없으면 재배포 시 DB 초기화
- `knowledge_sources.json`은 git에 포함 (초기 시드 데이터, git push 시 자동 배포)
- GitHub 연동 → `git push`로 자동 재배포

---

## 알려진 이슈 / 결정 사항

| 항목 | 내용 |
|---|---|
| Gemini SSE 멀티라인 | 한 이벤트 블록에 `data:` 라인이 여러 개일 때 JSON 파싱 실패 → 라인별 개별 파싱으로 수정 |
| Railway DB 초기화 | 퍼시스턴트 볼륨 없이 재배포하면 `app.db` 삭제됨 — 볼륨 설정 필수 |
| node:sqlite | Node 22 미만에서 미지원 — `package.json` engines로 ≥22 고정 |
