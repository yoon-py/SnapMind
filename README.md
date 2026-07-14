# SnapMind

**텍스트가 추출 가능한 문서를 넣으면, AI가 모바일 학습 콘텐츠로 바꿔주는 앱**

PDF, Word, HWP, PPT, 이미지 등 다양한 형식의 문서를 업로드하면 AI(OpenAI / Gemini)가 내용을 분석해서 짧은 숏폼 학습 카드("Shorts")나 플래시카드("Cards")로 자동 변환해 줍니다. PDF는 텍스트 레이어가 있는 파일은 기본 파서로 처리하고, 스캔본/이미지 기반 PDF는 Google Document AI 또는 Upstage OCR 설정이 필요합니다. 변환된 콘텐츠는 스마트폰에서 스와이프하며 학습할 수 있고, 각 아이디어에 대해 AI 튜터와 1:1 채팅으로 더 깊이 이해할 수도 있습니다.

---

## 주요 기능

- **문서 → 학습팩 자동 변환**: 텍스트를 직접 붙여넣거나, 텍스트 기반 PDF · DOCX · HWP · PPTX · XLSX · TXT · CSV · JSON · HTML 등을 업로드하면 AI가 핵심 내용을 추출하고 학습 가능한 단위로 재구성합니다. 스캔 PDF와 이미지는 OCR 설정이 필요합니다.
- **숏폼(Shorts) / 카드(Cards) 두 가지 학습 포맷**: Shorts는 짧은 영상처럼 스와이프하며 배우는 형식, Cards는 플래시카드 스타일로 핵심 개념을 빠르게 복습하는 형식입니다.
- **AI 아이디어 채팅**: 학습 중 이해가 안 되는 개념이 있으면, 해당 아이디어를 탭해서 AI 튜터와 실시간 대화를 나눌 수 있습니다.
- **TTS 오디오 생성**: Gemini TTS를 활용해 Shorts 콘텐츠에 자동 음성을 입혀 귀로 들으며 학습할 수 있습니다.
- **AI 이미지 생성**: Shorts 각 장면에 맞는 일러스트를 AI가 자동으로 생성합니다.
- **진도 관리**: 팩별로 학습 완료한 아이디어를 추적하고, 복습 문제로 이해도를 확인합니다.
- **다국어 지원**: 앱 UI는 한국어/영어 전환 가능. 기본 제공 팩은 다국어, 사용자 생성 팩은 원본 언어를 유지합니다.
- **Google 로그인 + Supabase 동기화**: 기기 간 학습 데이터를 동기화할 수 있습니다.
- **OCR 지원**: 이미지나 스캔된 PDF는 Google Document AI / Upstage OCR 설정이 있을 때 텍스트를 추출합니다.

## 기술 스택

| 영역 | 기술 |
|------|------|
| 모바일 앱 | React Native (Expo SDK 54) |
| 백엔드 | Express.js (Node.js) |
| AI/LLM | OpenAI GPT · Google Gemini (선택) |
| 인증/DB | Supabase (Auth + PostgreSQL + Storage) |
| OCR | Google Document AI · Upstage (폴백) |
| 문서 파싱 | pdf-parse · mammoth · hwp.js · xlsx · officeparser |
| 웹 프론트엔드 | Vite + React |
| 배포 | Fly.io (Express API + Vite 정적 파일) |

## 프로젝트 구조

```
├── src/                    # Expo 모바일 앱 (React Native)
│   ├── RootApp.js          # 메인 앱 컴포넌트 (UI + 화면 전환)
│   ├── hooks/              # 비즈니스 로직 훅
│   │   ├── useRootAppController.js   # 앱 상태 관리 컨트롤러
│   │   ├── useBackgroundGeneration.js # 백그라운드 팩 생성 폴링
│   │   └── usePackPersistence.js      # 로컬/클라우드 데이터 저장
│   ├── data/               # 기본 제공 학습 콘텐츠
│   ├── supabase.js         # Supabase 클라이언트 초기화
│   └── supabaseDb.js       # DB CRUD 레이어
│
├── server/                 # Express 백엔드
│   ├── index.js            # 서버 엔트리포인트
│   ├── config/             # 설정 (모델 선택, 파일 업로드 등)
│   ├── lib/
│   │   ├── learningPack.js # 학습팩 생성 핵심 로직
│   │   ├── ideaChat.js     # AI 아이디어 채팅
│   │   ├── llm.js          # LLM API 호출 추상화
│   │   ├── sourceExtraction.js # 문서 텍스트 추출 (PDF, HWP 등)
│   │   └── text.js         # 텍스트 유틸리티
│   ├── routes/auth.js      # Google OAuth 콜백
│   └── stores/             # 인메모리 작업/세션 저장소
│
├── web/                    # Vite 웹 앱. Fly 배포 시 web/dist로 빌드됨
├── shared/backend-core/    # 서버에서 사용하는 공용 TypeScript 코어
├── ios/                    # Expo prebuild iOS 프로젝트
├── Dockerfile              # Fly.io 배포 이미지
├── fly.toml                # Fly.io 앱 설정
└── supabase-schema.sql     # DB 스키마
```

## 설치 및 실행

### 사전 준비

- Node.js 18+
- Expo CLI (`npx expo`)
- OpenAI API 키 또는 Gemini API 키
- Supabase 프로젝트 (인증/데이터 동기화 사용 시)

### 환경변수 설정

```bash
cp .env.example .env
```

`.env` 파일을 열고 아래 값들을 채웁니다:

| 변수 | 설명 |
|------|------|
| `OPENAI_API_KEY` | OpenAI API 키 |
| `OPENAI_MODEL` | 사용할 OpenAI 모델 (예: `gpt-4o`) |
| `LLM_PROVIDER` | `openai` 또는 `gemini` |
| `GEMINI_API_KEY` | Google Gemini API 키 (선택) |
| `PORT` | 백엔드 포트 (기본 `8788`) |
| `EXPO_PUBLIC_API_URL` | 앱에서 백엔드 접속 URL |
| `EXPO_PUBLIC_SUPABASE_URL` | Supabase 프로젝트 URL |
| `EXPO_PUBLIC_SUPABASE_ANON_KEY` | Supabase anon 키 |
| `UPSTAGE_API_KEY` | 스캔 PDF/이미지 기반 PDF OCR 폴백용. 텍스트 PDF만 처리할 경우 선택, 스캔 PDF를 처리하려면 필요 |

**`EXPO_PUBLIC_API_URL` 설정 팁:**
- iOS 시뮬레이터: `http://127.0.0.1:8788`
- Android 에뮬레이터: `http://10.0.2.2:8788`
- 실제 기기: `http://<내-맥-로컬-IP>:8788`

### 설치

```bash
npm install
cd worker && npm install && cd ..
```

### 실행

터미널 1 — 백엔드 서버:

```bash
npm run backend
```

터미널 2 — Expo 앱:

```bash
npm run dev
```

### 검증

```bash
npm run backend:check   # 문법 확인
npm test                # 테스트 실행
```

## API 엔드포인트

| 메서드 | 경로 | 설명 |
|--------|------|------|
| `GET` | `/health` | 서버 상태 및 LLM 설정 확인 |
| `POST` | `/api/generate-pack` | 텍스트/파일 업로드 → 학습팩 생성 (비동기) |
| `GET` | `/api/generate-pack/:jobId/status` | 생성 작업 진행 상태 폴링 |
| `POST` | `/api/media/sign` | 미디어 파일 서명 URL 발급 |
| `POST` | `/api/idea-chat` | AI 아이디어 채팅 |
| `GET` | `/auth/callback` | Google OAuth 콜백 |
| `POST` | `/auth/store-session` | 세션 저장 |
| `GET` | `/auth/get-session/:state` | 세션 조회 |

## 동작 흐름

1. 사용자가 앱에서 텍스트를 입력하거나 파일을 업로드합니다.
2. 백엔드가 문서에서 텍스트를 추출합니다 (PDF 파싱, OCR 등).
3. AI(OpenAI/Gemini)가 추출된 텍스트를 분석하여 핵심 아이디어를 뽑고, 학습 Shorts 또는 Cards로 구조화합니다.
4. 선택적으로 TTS 오디오와 AI 이미지를 생성합니다.
5. 생성된 학습팩이 앱에 전달되어, 스와이프하며 학습할 수 있습니다.
6. 학습 중 궁금한 내용은 아이디어 채팅에서 AI에게 질문합니다.

## 라이선스

MIT
