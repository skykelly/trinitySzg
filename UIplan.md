# 1. 서비스 전체 구조

## 서비스명

**TrinitySzg**

## 한 줄 정의

**세 개의 AI 페르소나가 기술, 고객, 사업 관점에서 질문을 해석하고 토론하여 실행 가능한 결론을 도출하는 AI 의사결정 서비스**

## 핵심 컨셉

> 하나의 질문에 하나의 답을 바로 내지 않는다.
> 서로 다른 관점의 AI가 각자 주장하고, 반박하고, 조정한 뒤 최종 결론을 만든다.

---

# 2. IA / 전체 메뉴 구조

서비스는 크게 3개 영역으로 구성

| 영역 | 화면명                | 목적                             |
| -- | ------------------ | ------------------------------ |
| 1  | **Trinity Debate** | 3개 AI가 토론하고 최종 결론을 도출          |
| 2  | **Solo Lens**      | 각 AI와 개별적으로 대화하며 관점별 답변을 탐색    |
| 3  | **Persona Studio** | 3개 AI의 사전지식, 역할, 말투, 판단 기준을 설정 |

---

# 3. 화면 1: Admin 화면 **Persona Studio**

## Persona Studio의 목적

각 AI가 단순히 다른 말투를 갖는 것이 아니라, **다른 판단 프레임**을 갖도록 만드는 화면입니다.

즉, 여기서 관리자는 각 AI의 다음 요소를 조정합니다.

* 역할
* 사전지식
* 금지할 사고방식
* 선호하는 근거
* 의사결정 기준
* 답변 톤
* 반박 스타일
* 최종 결론에서 양보 가능한 조건

---

## 3개 AI 기본 페르소나

### 1) Tech Strategist

기술 중심 AI

**역할**

> 기술 가능성, 아키텍처, 구현 난이도, 확장성, 데이터/AI 적합성을 판단하는 AI

**주요 질문**

* 이 아이디어는 기술적으로 가능한가?
* 현재 기술 수준에서 어디까지 구현 가능한가?
* 필요한 데이터, 모델, 시스템은 무엇인가?
* PoC와 상용화 사이의 갭은 무엇인가?
* 확장성과 유지보수 리스크는 무엇인가?

**성향**

* 가능성과 구조를 본다.
* 기술적 타당성을 중시한다.
* 과도한 사업 낙관론을 견제한다.
* 구현 조건을 구체화한다.

---

### 2) Customer Advocate

고객 중심 AI

**역할**

> 고객 니즈, 행동 변화, 사용 맥락, 감정, 불편함, 수용성을 판단하는 AI

**주요 질문**

* 고객이 정말 이걸 원하는가?
* 고객 입장에서 이 서비스는 왜 필요한가?
* 사용 순간의 맥락은 무엇인가?
* 고객의 불편, 욕망, 심리적 장벽은 무엇인가?
* 실제 사용 행동으로 이어질 가능성이 있는가?

**성향**

* 고객 언어로 생각한다.
* 기술 공급자 관점을 의심한다.
* 사용 장면과 감정 변화를 중시한다.
* “멋있지만 안 쓰는 서비스”를 견제한다.

---

### 3) Pragmatic Builder

현실적 사업가 AI

**역할**

> 매출, 비용, 실행 가능성, 조직 수용성, 운영 리스크, 우선순위를 판단하는 AI

**주요 질문**

* 돈이 되는가?
* 누가 실행할 수 있는가?
* 지금 할 수 있는가?
* MVP 범위는 어디까지인가?
* 조직, 예산, 기간, KPI 관점에서 현실적인가?
* 실패하면 어디서 실패할 가능성이 높은가?

**성향**

* 냉정하고 현실적이다.
* 실행 우선순위를 중시한다.
* “좋은 아이디어”보다 “되는 사업”을 본다.
* 복잡한 비전을 단기 실행안으로 쪼갠다.

---

# 4. Persona Studio 상세 화면 기획

## 화면 구조

### 좌측: AI 페르소나 목록

* Tech Strategist
* Customer Advocate
* Pragmatic Builder

각 AI를 선택하면 우측에서 상세 설정 가능.

---

## 우측 설정 패널

### 1. Basic Profile

| 항목           | 설명                           |
| ------------ | ---------------------------- |
| AI Name      | 예: Tech Strategist           |
| Persona Type | 기술 중심 / 고객 중심 / 사업 중심        |
| Description  | 이 AI의 역할 설명                  |
| Tone         | 분석적 / 도전적 / 공감형 / 냉정함 등      |
| Debate Style | 공격적 반박 / 균형형 / 질문 중심 / 근거 중심 |

---

### 2. System Prompt Editor

관리자가 직접 수정할 수 있는 핵심 프롬프트 영역입니다.

예시:

```text
You are Tech Strategist, one of the three AI agents in TrinitySzg.

Your role is to evaluate the given question from the perspective of technology feasibility, AI architecture, data requirements, system scalability, and implementation risk.

You must:
- Identify what is technically possible now.
- Separate current feasibility from future possibility.
- Explain required data, models, architecture, and integration.
- Challenge unrealistic business or customer claims if they ignore technical constraints.
- Provide practical implementation options: MVP, pilot, scale-up.

You must not:
- Overstate AI capabilities.
- Assume data exists without checking.
- Recommend complex architecture when a simpler approach is enough.
```

---

### 3. Knowledge Base

각 AI별로 참조할 수 있는 사전지식 영역입니다.

#### 기능명 제안

**Knowledge Pack**

또는

* Reference Set
* Perspective Memory
* Domain Corpus
* Intelligence Base
* Source Library

가장 좋은 명칭은 **Knowledge Pack**입니다.

각 AI가 다른 참고자료를 가질 수 있다는 점을 명확히 보여줍니다.

---

### Knowledge Pack 구성

| 항목       | 예시                          |
| -------- | --------------------------- |
| 업로드 문서   | PDF, PPT, DOCX, TXT         |
| 웹 링크     | Gartner, McKinsey, 기술 블로그 등 |
| 내부 문서    | 전략 보고서, 회의록, 리서치 자료         |
| 직접 입력 지식 | 관리자가 직접 입력한 원칙/메모           |
| 우선순위     | 이 지식을 얼마나 강하게 반영할지          |

---

### 4. Judgment Criteria

각 AI가 결론을 평가할 때 사용하는 기준입니다.

#### Tech Strategist 기준

* 기술 구현 가능성
* 데이터 확보 가능성
* 아키텍처 복잡도
* 확장성
* 보안/거버넌스 리스크
* PoC → 상용화 전환 가능성

#### Customer Advocate 기준

* 고객 문제의 명확성
* 사용 빈도
* 고객 수용성
* 감정적 가치
* 행동 변화 가능성
* 사용 장벽

#### Pragmatic Builder 기준

* 매출 기여 가능성
* 비용 대비 효과
* 실행 난이도
* 조직 수용성
* KPI 명확성
* 단기 실행 가능성

---

### 5. Debate Behavior

토론 시 해당 AI가 어떤 역할을 할지 설정하는 영역입니다.

| 설정 항목   | 예시                          |
| ------- | --------------------------- |
| 주장 강도   | 낮음 / 보통 / 강함                |
| 반박 성향   | 부드러움 / 근거 중심 / 공격적          |
| 양보 기준   | 데이터 부족 시 양보 / 고객 근거 부족 시 반박 |
| 선호 결론   | 기술 우선 / 고객 우선 / 실행 우선       |
| 리스크 민감도 | 낮음 / 중간 / 높음                |

---

### 6. Test Prompt

관리자가 설정한 AI가 제대로 동작하는지 테스트하는 영역입니다.

#### 기능명

**Persona Test**

관리자가 질문을 입력하면 해당 AI만 응답합니다.

예:

> “AI 쇼핑 어시스턴트를 오프라인 매장에도 적용할 수 있을까?”

Tech Strategist는 기술 가능성을 답하고, Customer Advocate는 고객 사용성을 답하는 식으로 검증합니다.

---

# 5. 화면 2: 각 AI와 채팅하는 화면 **Solo Lens**

## Solo Lens 화면 목적

토론 전에 사용자가 각 AI와 개별적으로 대화하면서 관점별 논리를 탐색하는 공간입니다.

즉, 이 화면은 최종 결론을 내리는 화면이 아니라 **관점별 사전 분석 공간**입니다.

---

## 화면 구성

### 상단

* 현재 선택된 AI
* AI 설명
* 사용 중인 Knowledge Pack
* 응답 스타일 표시

예:

```text
Tech Strategist
기술 가능성, 데이터, 아키텍처, 구현 리스크를 중심으로 판단합니다.
Knowledge Pack: AI Architecture, Enterprise AI, Graph RAG
```

---

### 좌측 패널: AI 선택

* Tech Strategist
* Customer Advocate
* Pragmatic Builder

AI를 바꾸면 같은 질문을 다른 관점에서 다시 물을 수 있습니다.

---

### 중앙: 채팅 영역

일반적인 채팅 UI입니다.

다만 답변 구조를 통일하는 것이 좋습니다.

#### 답변 템플릿

```text
1. 핵심 판단
2. 근거
3. 놓치기 쉬운 리스크
4. 보완 질문
5. 다음 단계 제안
```

---

## Solo Lens 주요 기능

### 1. Ask This Agent

개별 AI에게 질문하는 기본 기능입니다.

#### 기능명

**Ask This Agent**

또는

* Ask Persona
* Ask Lens
* Consult Agent
* Get Perspective

가장 직관적인 명칭은 **Ask This Agent**입니다.

---

### 2. Compare with Others

현재 질문을 다른 AI에게도 보내 비교하는 기능입니다.

예:

Tech Strategist에게 먼저 질문한 뒤 버튼 클릭:

> “이 질문을 Customer Advocate와 Pragmatic Builder에게도 물어보기”

#### 기능명

**Compare Perspectives**

---

### 3. Send to Debate

현재 질문과 대화 맥락을 3개 AI 토론 화면으로 보내는 기능입니다.

#### 기능명

**Send to Trinity Debate**

또는 짧게:

**Start Debate**

---

### 4. Save as Seed

현재 대화를 토론의 출발점으로 저장합니다.

#### 기능명

**Save as Debate Seed**

3개 AI가 처음부터 토론하는 것보다, 사용자가 어느 정도 관점을 탐색한 후 토론을 시작할 수 있게 함

---

### 5. Persona Switch

같은 질문을 유지한 채 AI만 바꾸는 기능입니다.

#### 기능명

**Switch Lens**

예:

> Tech Lens → Customer Lens → Business Lens

---

# 6. 화면 1: AI간 토론 화면 **Trinity Debate**

개인적으로는 화면명은 **Trinity Debate**, 최종 결론 도출 기능은 **Szg Synthesis**가 좋습니다.

---

## Trinity Debate 화면 목적

세 개의 AI가 동일한 질문에 대해 각자 입장을 제시하고, 상호 반박하고, 합의/비합의 지점을 정리한 뒤 최종 결론을 도출합니다.

---

## 토론 프로세스

### Step 1. Question Framing

사용자가 질문 입력

예:

> “AI 쇼핑 어시스턴트를 오프라인 베스트샵 매니저용으로 확장하는 것이 타당한가?”

시스템이 질문을 정리합니다.

```text
분석 대상:
AI 쇼핑 어시스턴트의 오프라인 매장 확장

판단해야 할 쟁점:
1. 기술 구현 가능성
2. 고객/매니저 사용 가치
3. 사업성과 및 실행 가능성
```

#### 기능명

**Frame the Question**

---

### Step 2. Opening Statements

3개 AI가 각각 초기 입장을 제시합니다.

#### 기능명

**Opening Views**

예:

| AI                | 초기 입장                              |
| ----------------- | ---------------------------------- |
| Tech Strategist   | 가능하지만, 온라인 챗봇 구조를 그대로 쓰면 실패 가능성 높음 |
| Customer Advocate | 고객보다 매니저 보조 관점에서 먼저 접근해야 함         |
| Pragmatic Builder | 매출 KPI와 매장 업무 부담 감소가 명확해야 추진 가능    |

---

### Step 3. Cross Challenge

AI들이 서로의 주장에 반박합니다.

#### 기능명

**Cross Challenge**

예:

Customer Advocate → Tech Strategist에게 반박:

> 기술적으로 가능하다는 것과 매장에서 실제로 쓰인다는 것은 다르다. 매니저가 고객 앞에서 AI 답변을 기다리는 상황은 현실적이지 않을 수 있다.

Pragmatic Builder → Customer Advocate에게 반박:

> 고객 경험 개선만으로는 투자 승인이 어렵다. 객단가 상승, 상담 시간 단축, 신입 매니저 교육 기간 단축 같은 KPI가 필요하다.

---

### Step 4. Rebuttal & Refinement

각 AI가 반박을 반영해 입장을 수정합니다.

#### 기능명

**Refine Positions**

이 단계가 중요합니다.
단순히 싸우는 것이 아니라, 서로의 논리를 반영해 더 현실적인 안으로 좁혀갑니다.

---

### Step 5. Consensus Map

합의점과 쟁점을 정리합니다.

#### 기능명

**Consensus Map**

구성:

| 구분        | 내용                                   |
| --------- | ------------------------------------ |
| 합의된 내용    | 오프라인 적용은 고객 직접 챗봇보다 매니저 보조 AI가 우선    |
| 이견이 남은 내용 | 고객-facing 기능까지 확장할 시점                |
| 핵심 리스크    | 현장 사용성, 응답 속도, 프로모션 정보 정확성           |
| 실행 조건     | 매장 프로모션 DB, 제품 지식 DB, 상담 스크립트 구조화 필요 |

---

### Step 6. Final Synthesis

최종 결론 도출

#### 기능명

### **Szg Synthesis**

이 명칭을 추천합니다.

Syzygy는 천체가 일직선으로 정렬되는 의미이므로, 3개 관점이 정렬되어 하나의 결론으로 수렴한다는 의미와 잘 맞습니다.

최종 결과물은 아래 구조가 좋습니다.

```text
1. 최종 결론
2. 판단 근거
3. 우선 실행안
4. 하지 말아야 할 것
5. MVP 범위
6. 핵심 KPI
7. 남은 리스크
8. 다음 액션
```

---

# 7. Trinity Debate 화면 상세 UI

## 상단 영역

### Debate Header

* 질문 제목
* 토론 모드
* 사용된 AI 페르소나
* 진행 상태
* 토론 깊이 설정

예:

```text
Question
AI 쇼핑 어시스턴트의 오프라인 매장 확장 타당성

Mode
Balanced Debate

Agents
Tech Strategist / Customer Advocate / Pragmatic Builder

Depth
Standard
```

---

## 좌측 패널: Debate Settings

### 1. Debate Mode

토론 방식을 사용자가 선택할 수 있게 하면 좋습니다.

| 모드                        | 설명             |
| ------------------------- | -------------- |
| **Balanced Debate**       | 세 관점이 균형 있게 토론 |
| **Critical Review**       | 반박과 리스크 검토 중심  |
| **Opportunity Discovery** | 기회 발굴 중심       |
| **Execution Planning**    | 실행계획 도출 중심     |
| **Investment Review**     | 투자심의/사업성 검토 중심 |
| **C-Level Briefing**      | 경영진 보고용 결론 중심  |

---

### 2. Debate Depth

| 깊이       | 설명                  |
| -------- | ------------------- |
| Quick    | 짧은 토론 후 결론          |
| Standard | 주장-반박-합의            |
| Deep     | 다단계 반박, 리스크, 실행안 포함 |

---

### 3. Output Type

최종 산출물 형식을 선택할 수 있습니다.

| 형식                | 설명         |
| ----------------- | ---------- |
| Executive Summary | 경영진 요약     |
| Decision Memo     | 의사결정 메모    |
| Action Plan       | 실행계획       |
| Risk Review       | 리스크 검토     |
| Product Concept   | 서비스/제품 기획안 |
| Strategy Canvas   | 전략 캔버스     |

---

## 중앙 영역: 토론 타임라인

토론은 채팅처럼 보이되, 단계가 명확해야 합니다.

```text
[1] Question Framing
[2] Opening Views
[3] Cross Challenge
[4] Refine Positions
[5] Consensus Map
[6] Szg Synthesis
```

각 단계는 접거나 펼칠 수 있게 합니다.

---

## 우측 패널: Live Synthesis

토론 중간에도 핵심 쟁점이 정리됩니다.

### 구성

* 현재까지의 합의점
* 갈등 지점
* 가장 강한 주장
* 가장 큰 리스크
* 결론 후보
* 추가로 필요한 정보

이 기능은 사용자 입장에서 매우 유용합니다.
3개 AI 토론이 길어질수록 핵심을 놓치기 쉬우므로, 우측에 실시간 정리 패널이 있어야 합니다.

#### 기능명

**Live Synthesis**

---

# 8. 기능 명칭 정리

## 전체 주요 기능명

| 기능            | 추천 명칭                  |
| ------------- | ---------------------- |
| 페르소나 관리       | Persona Studio         |
| AI별 사전지식      | Knowledge Pack         |
| AI 테스트        | Persona Test           |
| 개별 AI 채팅      | Solo Lens              |
| 개별 AI에게 질문    | Ask This Agent         |
| 다른 AI와 비교     | Compare Perspectives   |
| 같은 질문으로 AI 전환 | Switch Lens            |
| 토론으로 보내기      | Send to Trinity Debate |
| 토론 시작         | Start Debate           |
| 질문 정리         | Frame the Question     |
| 초기 주장         | Opening Views          |
| 상호 반박         | Cross Challenge        |
| 입장 조정         | Refine Positions       |
| 합의/이견 지도      | Consensus Map          |
| 최종 결론         | Szg Synthesis          |
| 실시간 요약        | Live Synthesis         |
| 결과 저장         | Decision Archive       |

---

# 9. 핵심 화면별 UX 흐름

## Flow 1. Admin이 AI를 설정하는 흐름

```text
Persona Studio 접속
→ Tech Strategist 선택
→ System Prompt 수정
→ Knowledge Pack 업로드
→ Judgment Criteria 설정
→ Debate Behavior 설정
→ Persona Test 실행
→ 저장
```

---

## Flow 2. 사용자가 개별 AI에게 묻는 흐름

```text
Solo Lens 접속
→ 질문 입력
→ Tech Strategist 답변 확인
→ Switch Lens로 Customer Advocate 답변 확인
→ Compare Perspectives 실행
→ 마음에 드는 대화 맥락을 Save as Debate Seed
→ Start Debate
```

---

## Flow 3. 3개 AI 토론 흐름

```text
Trinity Debate 접속
→ 질문 입력
→ Debate Mode 선택
→ Output Type 선택
→ Frame the Question
→ Opening Views
→ Cross Challenge
→ Refine Positions
→ Consensus Map
→ Szg Synthesis 생성
→ Decision Archive 저장
```

---

# 10. 서비스 차별화 포인트

이 서비스의 핵심 차별점은 “3개 AI가 답변한다”가 아닙니다.

진짜 차별점은 다음입니다.

## 1. 관점이 고정되어 있다

일반 멀티에이전트는 역할이 흐려지기 쉽습니다.
TrinitySzg는 세 관점이 명확합니다.

```text
기술 가능성
고객 가치
사업 실행성
```

이 3개는 신사업/AI Transformation 의사결정에서 가장 중요한 축입니다.

---

## 2. 단순 병렬 답변이 아니라 충돌한다

각 AI가 따로 답변만 하면 “3개의 답변 모음”에 그칩니다.

반드시 아래 구조가 있어야 합니다.

```text
주장 → 반박 → 수정 → 합의 → 결론
```

이것이 TrinitySzg의 핵심 경험입니다.

---

## 3. 최종 결론이 실행안으로 나온다

최종 결과가 단순 요약이면 약합니다.

반드시 다음까지 나와야 합니다.

```text
해야 할 것
하지 말아야 할 것
MVP 범위
필요 데이터
KPI
리스크
다음 액션
```

---

# 11. 추천 최종 네이밍 체계

제가 보기엔 아래 조합이 가장 좋습니다.

| 영역       | 명칭                       |
| -------- | ------------------------ |
| 서비스      | **TrinitySzg**           |
| Admin    | **Persona Studio**       |
| 사전지식     | **Knowledge Pack**       |
| 개별 AI 채팅 | **Solo Lens**            |
| AI 전환    | **Switch Lens**          |
| 관점 비교    | **Compare Perspectives** |
| 3개 AI 토론 | **Trinity Debate**       |
| 상호 반박    | **Cross Challenge**      |
| 합의 지도    | **Consensus Map**        |
| 최종 결론    | **Szg Synthesis**        |
| 결과 저장소   | **Decision Archive**     |

---

# 12. MVP 기준으로 꼭 필요한 기능

처음부터 너무 복잡하게 만들 필요는 없습니다.

## MVP 1차 범위

반드시 필요한 것만 보면 아래입니다.

### Persona Studio

* 3개 AI 시스템 프롬프트 편집
* AI별 Knowledge Pack 업로드
* AI별 답변 테스트

### Solo Lens

* AI 선택
* 개별 AI 채팅
* 같은 질문을 다른 AI에게 재질문
* 토론으로 보내기

### Trinity Debate

* 질문 입력
* 3개 AI 초기 주장 생성
* 1회 상호 반박
* 합의점/이견 정리
* 최종 결론 생성
* 결과 저장

---

# 13. 향후 고도화 기능

MVP 이후에는 아래 기능을 붙이면 좋습니다.

## 1. Debate Score

각 AI가 최종안에 대해 점수를 매깁니다.

| 기준     | 점수   |
| ------ | ---- |
| 기술 가능성 | 8/10 |
| 고객 가치  | 7/10 |
| 사업 실행성 | 6/10 |
| 종합 추천도 | 7/10 |

---

## 2. Disagreement Highlight

AI 간 이견이 큰 지점을 자동 표시합니다.

예:

```text
가장 큰 이견:
고객-facing 기능을 1차 MVP에 포함할 것인가?
```

---

## 3. Decision Log

최종 결론뿐 아니라 왜 그런 결론이 나왔는지 저장합니다.

```text
초기안
반박
수정된 판단
최종 결론
남은 리스크
```

이 기능은 기업용 의사결정 서비스에서 매우 중요합니다.

---

## 4. Board Memo Export

결과를 경영진 보고용으로 자동 변환합니다.

형식:

* 1페이지 Executive Memo
* PPT Outline
* Strategy Canvas
* Action Plan
* Risk Register

---

# 14. 화면 컨셉 요약

## Persona Studio

> 세 AI의 사고방식을 설계하는 공간

## Solo Lens

> 하나의 관점으로 질문을 깊게 파고드는 공간

## Trinity Debate

> 세 관점이 충돌하고 정렬되어 결론을 만드는 공간

## Szg Synthesis

> 충돌 이후 만들어진 최종 판단과 실행안

---

# 15. 최종적으로 잡으면 좋은 제품 메시지

## 제품 카피

> **One question. Three minds. One aligned decision.**

## 한국어 카피

> **하나의 질문을 세 개의 관점으로 검증하고, 실행 가능한 하나의 결론으로 정렬합니다.**

또는

> **기술 가능성, 고객 가치, 사업 실행성을 동시에 검토하는 AI 의사결정 토론 서비스**

가장 실무적인 표현은 이겁니다.

> **TrinitySzg는 기술·고객·사업 관점의 AI가 질문을 토론하고, 합의 가능한 실행 결론을 도출하는 멀티에이전트 의사결정 플랫폼입니다.**
