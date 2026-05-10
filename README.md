# Trinity SZG

3개의 AI 페르소나가 하나의 질문을 두고 토론한 뒤 결론을 만드는 개인용 MVP입니다.

## 실행

```bash
npm install
cp .env.example .env.local
npm run dev
```

브라우저에서 `http://localhost:3000`을 엽니다.

## 환경 변수

```bash
GEMINI_API_KEY=your_gemini_api_key
GEMINI_FALLBACK_MODEL=gemini-2.5-flash
DEBATE_MODE=single
GITHUB_TOKEN=your_github_token
```

기본 provider는 Gemini이며, Admin 화면에서 각 AI별 provider/model/temperature/system prompt/knowledge를 수정할 수 있습니다.
`GEMINI_FALLBACK_MODEL`은 기본 모델이 429/503으로 실패할 때 재시도 후 사용할 선택 모델입니다.
`DEBATE_MODE=single`은 토론 1회를 LLM 호출 1번으로 처리합니다. `multi`로 바꾸면 주장/반박/최종 입장/결론을 각각 호출하지만 무료 quota를 빠르게 소모합니다.

## 화면

- `토론`: 질문을 입력하면 기술중심, 고객중심, 현실적 사업가 AI가 1차 주장, 반박, 최종 입장을 만들고 최종 결론을 생성합니다.
- `개별 채팅`: 선택한 AI와 해당 페르소나 기반으로 채팅합니다.
- `Admin`: 3개 AI의 이름, 역할, provider, 모델, 시스템 프롬프트, 사전지식을 편집합니다.

## 저장소

개인용 MVP라서 로그인 없이 로컬 SQLite DB를 사용합니다.

- DB 파일: `data/app.db`
- DB 파일은 git에 커밋되지 않습니다.
