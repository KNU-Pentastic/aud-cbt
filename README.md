# AUD-CBT
# 알코올컷! · AUD-CBT

> **퇴원 후 90일, 알코올 사용장애(AUD) 환자를 위한 LLM 기반 인지행동치료(CBT) 디지털 치료제.**
> 환자는 모바일 앱에서 12주 CBT 코치와 매주 대화하고, 의료진은 웹 포털에서 회복 경과와 위기 신호를 한눈에 본다.
> 그 사이를 **다중 모델 안전 오케스트레이션 백엔드**가 실시간으로 잇는다.

<p>
<img alt="backend" src="https://img.shields.io/badge/Backend-FastAPI%20%C2%B7%20PostgreSQL%2016-009688">
<img alt="patient" src="https://img.shields.io/badge/Patient-Expo%20%C2%B7%20React%20Native-000020">
<img alt="provider" src="https://img.shields.io/badge/Provider-Next.js%2016-black">
<img alt="llm" src="https://img.shields.io/badge/LLM-Claude%20Opus%20%C2%B7%20Sonnet%20%C2%B7%20Haiku-D97757">
<img alt="status" src="https://img.shields.io/badge/Demo-Reproducible%20%E2%9C%94-2E8B57">
</p>

대상은 DSM-5 기준 중등도-중증 AUD로 입원 치료 후 퇴원한 환자다. 이 시기의 90일 재발률은 40-60%, 자살 위험은 일반 인구의 약 10배에 달한다. 프로그램은 **Project MATCH CBT Manual(Kadden et al., 1995)** 과 **NIAAA Combined Behavioral Intervention(COMBINE, 2004)** 매뉴얼을 근거로 한 12주·4-Phase 구조화 CBT다.

---

## 1. 한 줄 정의

**"퇴원한 알코올 사용장애 환자가, 다음 외래까지의 공백기를 안전하게 건너도록 — 매주 CBT 코치와 대화하는 모바일 앱 + 의료진 모니터링 웹 + 위기를 실시간 분류·차단하는 LLM 백엔드."**

---

## 2. 데모 / 실행 결과

> 공개 배포 URL은 없습니다(임상 데이터를 다루는 특성상 로컬 실행 기준). 대신 **아래 모든 화면·로그는 실제로 백엔드(Docker)·웹·앱을 띄우고, 실 Claude(Opus 4.8) 호출로 캡처한 결과**입니다. [§6 로컬 실행](#6-로컬-실행-방법)으로 그대로 재현됩니다.

### 📱 환자 모바일 앱 (Expo · React Native)

| ① 가입 — 코드+PIN / 이메일 | ② 홈 — 단주·체크인·세션 | ③ AI CBT 세션 + LLM Trace |
|:---:|:---:|:---:|
| <img src="docs/screenshots/patient-01-login.png" width="250"> | <img src="docs/screenshots/patient-02-home.png" width="250"> | <img src="docs/screenshots/patient-03-chat.png" width="250"> |

* **홈**: 단주 일수, 오늘의 체크인(기분·갈망·수면·복약), 이번 주 핵심 세션, 갈망 대화·생각 노트 바로가기, 다음 외래 예약, 위기 시 어디서든 누르는 *도움이 필요해요* 버튼.
* **AI CBT 세션**: 코치(Claude Opus)가 **SSE로 토큰을 실시간 스트리밍**. 상단 `LLM TRACE` 패널은 이번 응답이 **어떤 가이드라인 블록과 시스템 프롬프트(3,310자)로 생성됐는지, 현재 단계, 감지된 갈망/안전 등급**까지 투명하게 보여줍니다(데모·임상 검증용).

### 🖥️ 의료진 웹 포털 (Next.js · shadcn/ui)

| 환자 목록 (D2) | 신규 환자 등록 (D0) |
|:---:|:---:|
| <img src="docs/screenshots/02-patients-list.png" width="420"> | <img src="docs/screenshots/04-new-patient-d0.png" width="420"> |

**환자 상세 대시보드 (D2)** — 주차/단주일수/복약순응률, 30일 기분·갈망·수면 추이, **안전 이벤트 타임라인**, 퇴원 정보, 세션 이력, LLM 잠금/해제:

<img src="docs/screenshots/03-patient-dashboard.png" width="760">

> 위 대시보드의 **"안전 이벤트 → 등급 B · 재발 신호(switch_resu)"** 는 데모용으로 환자가 *"어제 회식에서 결국 소주 두 병을 마셔버렸어요…"* 라고 보낸 메시지를 **안전 분류기가 실시간으로 등급 B(재발)로 분류**해 기록한 실제 이벤트입니다.

### 💬 실제 LLM 대화 — 한 턴 전체 (raw)

환자 메시지 → 백엔드 파이프라인(안전분류 → 컨텍스트 → Opus 4.8 코치 → 출력필터) 한 번의 실제 결과입니다.

**환자 입력**
> 요즘 회식 자리에서 술 권유를 받으면 거절하기가 너무 힘들어요. 이번 주에도 한 번 무너질 뻔했어요.

**코치 응답 (claude-opus-4-8, SSE 스트리밍)**
> 안녕하세요 길동님. 먼저 이렇게 솔직하게 이야기 꺼내주셔서 고맙습니다. 회식 자리에서 권유를 받는 게 정말 쉽지 않으셨겠어요. 그리고 "무너질 뻔했다"고 하신 건, 결국 그 상황을 넘기셨다는 뜻으로 들리는데요 — 그 자체가 쉽지 않은 일이었을 것 같아요. (…)
>
> 그래서 우선 지난 한 주를 좀 가볍게 점검해보고 싶은데요.
> - **기분**은 전반적으로 어떠셨어요?
> - **술 생각이나 갈망**은 얼마나 자주, 얼마나 세게 올라왔나요?
> - **잠**은 어떠셨어요?
> - 방금 말씀하신 회식 외에, 실제로 **술을 드신 적**이 있었는지도 편하게 말씀해 주세요.

**같은 턴의 내부 판정 (Trace)**

| 컴포넌트 | 모델 | 결과 |
|---|---|---|
| 안전 분류기 | Haiku 4.5 | `grade: none` (위험 없음, 신뢰도 0.95) — 오탐 없이 정상 진행 |
| 발화 분석 | Haiku 4.5 | 주 감정 *무력감*, 갈망 강도 **6/10**, 인지왜곡 *절제위반효과(AVE)* 감지 |
| 단계 추적 | Sonnet 4.6 | 세션 단계 **1/5 (체크인 리뷰)**, 진행률 0.2 |
| 출력 필터 | rule + Haiku | `passed: true` (의학 어휘·AVE 위반 없음) |

→ 코치가 5단계 CBT 세션의 **1단계(체크인 리뷰: 기분·갈망·수면·음주 점검)** 를 정확히 수행하고 있음을 내부 추적기가 독립적으로 확인.

### ✅ 재현 가능한 검증 로그

```text
$ docker compose up --build -d        # Postgres 16 + Redis 7 + FastAPI
$ docker compose logs api
  Running upgrade  -> 0001_initial ... -> 0009_drop_google_oauth   # 마이그레이션 9종 전부 통과
  app.startup LLM mode=real model=claude-opus-4-8
  Application startup complete.

$ docker compose exec api python -m scripts.seed_demo
  Provider ID  : pr_igcuy760wr
  Email        : demo.doctor@example.com
  Password     : DemoPassword!2026
  Patient ID   : p_1ne1dv1y83
  Reg code     : MBVVP56U   (POST /v1/auth/patient/register)

$ curl localhost:8000/v1/internal/health
  overall_status: healthy
  components: postgresql · anthropic_api · safety_classifier · stage_tracker
             · session_summarizer · output_filter · llm_gateway · context_builder  (8/8 healthy)
```

OpenAPI 정본 기준 **41개 경로 / 47개 오퍼레이션**, Swagger UI는 `http://localhost:8000/docs`.

---

## 3. 핵심 기능

| # | 기능 | 한 줄 설명 |
|---|---|---|
| 1 | **12주 CBT 코치 (대화 LLM)** | Claude Opus가 동기강화상담(MI) 스타일로 매주 세션을 진행. 한 세션은 **5단계**(체크인→과제리뷰→핵심콘텐츠→개인화→다음과제)로, 코치와 단계 판단기가 같은 단계 정의를 공유해 일관되게 진행. |
| 2 | **다중 턴 안전 분류기** | 모든 발화를 **규칙 키워드 + Haiku 4.5 하이브리드**로 분류. 위험 신호 5종을 2등급으로 — **A(자살·급성중독)** 는 LLM 즉시 잠금 + 119·109·1393 안내, **B(재발·복약중단·PAWS)** 는 RESU/SOMA 전문 분기 응답. *재현율 우선* 설계. |
| 3 | **의료진 대시보드 (D0/D2/D4)** | 퇴원 정보 입력(D0)→환자 목록·상세 대시보드(D2, 기분/갈망 추이·안전 이벤트·복약순응률)→재평가(D4, 복약·외래일·프로그램 상태). |
| 4 | **LLM 오케스트레이션 + Trace** | 작업별로 **Opus/Sonnet/Haiku 3-tier** 모델을 분담. 세션 요약기가 다음 세션으로 임상 맥락을 인계. `LLM TRACE`로 프롬프트·단계·안전 판정을 실시간 노출. |
| 5 | **갈망 대화 · 안전망** | 언제든 호출하는 갈망 대처 대화, 응급 연락(109·119)·중독관리센터·보호자(SSO) 원터치, PII 저장 시 Fernet 암호화. |

---

## 4. 시스템 구조 / 아키텍처

5개 레이어 + 공용 데이터 스토어. 환자 발화 한 턴이 흐르는 **실제 런타임 파이프라인**:

```mermaid
flowchart TB
  subgraph L1["① 사용자 접점"]
    PA["📱 환자 모바일 앱<br/>Expo · React Native"]
    PW["🖥️ 의료진 웹 포털<br/>Next.js 16"]
  end
  GW["② API 게이트웨이 — FastAPI<br/>JWT 인증 · 라우팅 · /internal 외부 차단"]
  SC{"③ 안전 분류기<br/>규칙 + Claude Haiku 4.5<br/>(위험 5종 · 2등급)"}
  LOCK["🔒 A·응급: LLM 잠금<br/>+ 119·109·1393 안내"]
  CTX["컨텍스트 빌더<br/>12주 CBI 커리큘럼 조립"]
  COACH["④ 대화 코치<br/>Claude Opus · SSE 스트리밍"]
  AUX["단계 판단기 · 세션 요약기<br/>Claude Sonnet 4.6"]
  OF["⑤ 출력 필터<br/>의학 어휘 · AVE 위반 차단"]
  DB[("PostgreSQL 16 + Redis 7<br/>PII Fernet 암호화")]

  PA --> GW
  PW --> GW
  GW --> SC
  SC -->|"A · 응급 (자살·급성중독)"| LOCK
  SC -->|"B · 비응급 (재발·복약중단·PAWS)"| CTX
  SC -->|"위험 없음"| CTX
  CTX --> COACH --> OF --> PA
  COACH -.응답 후 비동기.-> AUX
  GW <--> DB
  SC <--> DB
  AUX <--> DB
```

**한 턴이 처리되는 순서** (`conversation_service.stream_user_message`):
1. 환자 발화 저장 → 2. **안전 분류**(등급 A면 즉시 잠금·중단) → 3. **컨텍스트 빌드**(주차·Phase·단계·직전 세션 요약) → 4. **코치 LLM 토큰 스트리밍**(SSE) → 5. **출력 필터**(위반 시 안전 메시지로 대체) → 6. 응답 저장 → 7. **발화 분석·단계 추적**(다음 단계 판정, 비동기).
세션 종료는 환자가 직접 *"세션 마치기"* 를 눌렀을 때만(자동 종료 없음), 이때 **세션 요약기**가 다음 주차로 임상 맥락을 인계.

> 외부로 나가는 모든 LLM 호출은 게이트웨이에서 **비식별화**(주민번호·전화·이메일 등 구조적 식별자 마스킹)를 거칩니다. 단, 안전 분류 정확도를 위해 임상적 자연어 신호는 일부러 보존합니다.
> 상세 5-레이어 설계도: [`docs/aud_cbt_v3_system_architecture.svg`](docs/aud_cbt_v3_system_architecture.svg)

### 안전 분류기 — 검증된 신뢰성 (핵심 차별점)

단발 문장이 아니라 **직전 2~3턴 맥락**을 함께 보는 **다중 턴** 분류기입니다. *"아 죽고싶네ㅋㅋ"(관용어)* 와 *진짜 위기 신호* 를 같은 문장이어도 맥락으로 구분합니다. 임상 원칙은 **재현율 > 정밀도**(놓친 위험 1건이 오탐 10건보다 위험).

* 테스트 자산: 다중 턴 시나리오 **8종 / 채점 턴 9개**, 단발 스모크 8종, 잠금 흐름 7종 — **각 턴 5회 반복, 5/5 전부 통과해야 PASS**(엄격 기준).
* **다중 턴 (실 백엔드 분류기): 9턴 중 8턴 통과 = 88.9%**, **등급 A(자살·급성중독) 오음성(false-negative) = 0%**. 동일 문장 한 쌍(관용어 vs 위기)을 맥락으로 **양쪽 다 정확 판정**.
* **단발 스모크: 8건 중 6건 = 75%**, 두 오류는 모두 *함정 케이스에 대한 과탐(false-positive)* — 즉 재현율 우선 설계와 일치하며 **진짜 위험을 놓친 사례는 0건**.
* 분류 기준은 NIAAA CBI 매뉴얼(354p)에 **1:1 매핑된 518개 항목 카탈로그**에서 도출(출처 일치율 100%, 검수 완료).

---

## 5. 기술 스택

| 영역 | 스택 |
|---|---|
| **백엔드** | Python 3.11+ · **FastAPI** · Uvicorn · **SQLAlchemy 2.0** · Alembic · **PostgreSQL 16** · Redis 7 · Pydantic v2 · PyJWT + passlib(PIN 해싱) · **cryptography(Fernet)** PII 암호화 · **sse-starlette**(SSE) · pytest |
| **환자 앱** | TypeScript · **Expo SDK 54 / React Native 0.81 / React 19** · **expo-router 6**(파일 기반) · **Zustand** · **TanStack Query** · react-hook-form + zod · expo-secure-store · SSE는 `expo/fetch` ReadableStream |
| **의료진 웹** | TypeScript · **Next.js 16 (App Router)** / React 19 · **shadcn/ui + Tailwind v4** · TanStack **Query + Table** · **Recharts** · react-hook-form + zod · jose(세션 JWT) · openapi-fetch · BFF 프록시로 백엔드 토큰 은닉 · MSW(목 모드) |
| **LLM** | **Anthropic Claude (SDK)** — 대화 코치 `claude-opus-4-8` · 단계 판단/세션 요약 `claude-sonnet-4-6` · 안전 분류/출력 필터/분석 `claude-haiku-4-5` *(모두 환경변수로 교체 가능; `USE_LLM_MOCK=true`면 키 없이도 결정적 목으로 전 흐름 동작)* |
| **공통/인프라** | Git · **Docker Compose** · **openapi.yaml 단일 정본**(FastAPI 자동 Swagger ↔ TS 타입 생성) · ruff/black · ESLint/Prettier |

**모델 분담 근거** — 환자에게 보이는 유일한 텍스트인 코치 대화엔 최고 품질 **Opus**, 판단·요약은 중간 추론 **Sonnet**, 호출량 많은 분류/추출엔 빠르고 저렴한 **Haiku**.

---

## 6. 로컬 실행 방법

전제: Docker Desktop, Node.js 20+. (위 데모는 이 절차 그대로 검증했습니다.)

### ① 백엔드 (필수)
```bash
cd backend
cp .env.example .env                 # 키 없이도 USE_LLM_MOCK=true 로 전 흐름 동작
docker compose up --build -d         # Postgres + Redis + API
docker compose exec api python -m scripts.seed_demo   # 데모 계정·환자 생성(코드 출력)
# → API   http://localhost:8000/v1
# → Swagger http://localhost:8000/docs
# → Health  http://localhost:8000/v1/internal/health
```
> 실 Claude 응답을 보려면 `.env`에 `ANTHROPIC_API_KEY=sk-ant-...` 와 `USE_LLM_MOCK=false`.

### ② 의료진 웹
```bash
cd provider-web
npm install
npm run dev          # http://localhost:3000  (백엔드 실연동: .env.local 기본값)
# 백엔드 없이 UI만 보려면:  NEXT_PUBLIC_ENABLE_MOCKS=true npm run dev
```

### ③ 환자 앱
```bash
cd patient-app/cbt-app
npm install
npx expo start       # Expo Go(QR) · 'a' 안드로이드 · 'i' iOS · 'w' 웹
# 실기기는 같은 LAN이면 백엔드(:8000)를 자동 탐색
```

---

## 7. 프로젝트 구조 (모노레포)

```
aud-cbt/
├── backend/                # FastAPI + PostgreSQL + Anthropic SDK
│   ├── app/
│   │   ├── routers/        # 외부 API (auth, patient_*, provider_*) + internal/ (컴포넌트)
│   │   ├── services/       # LLM 게이트웨이·안전분류·단계추적·세션요약·컨텍스트빌더·출력필터·비식별화
│   │   ├── models/         # SQLAlchemy 2.0 엔티티 13종
│   │   ├── schemas/        # Pydantic v2 (openapi.yaml 미러)
│   │   ├── cbt_stages.py   # 5단계 세션 정의(코치 ↔ 단계 판단기 공유)
│   │   └── encryption.py   # Fernet PII 암호화 TypeDecorator
│   ├── alembic/            # 마이그레이션 0001 → 0009
│   ├── scripts/seed_demo.py
│   └── docker-compose.yml
├── patient-app/cbt-app/    # Expo · React Native (환자 앱)
│   ├── app/                # expo-router 화면 (login, (tabs), chat, checkin, safety, progress, notes, settings)
│   ├── components/         # chat/(TraceStrip·StageIndicator) · home · safety
│   └── store/ · lib/       # Zustand 스토어 · API/SSE 클라이언트
├── provider-web/           # Next.js 16 (의료진 포털)
│   └── src/
│       ├── app/(auth|provider)/   # 로그인 · 환자 목록/상세/등록/재평가
│       ├── components/            # checkins-chart(Recharts) · safety-event-list
│       └── proxy.ts · app/api/v1/ # BFF 프록시(백엔드 토큰 은닉)
└── docs/                   # openapi.yaml(정본) · 아키텍처 SVG · 안전분류 검증 시나리오/결과
```

---

## 8. 데모 계정

`docker compose exec api python -m scripts.seed_demo` 실행 후:

| 역할 | 접속 | 자격 증명 |
|---|---|---|
| **의료진** (웹 `:3000`) | 이메일 + 비밀번호 | `demo.doctor@example.com` / `DemoPassword!2026` |
| **환자** (앱) | 등록 코드 + PIN | 등록 코드 = **시드 실행 시 출력**(예: `MBVVP56U`) · PIN = `482917` |

* 환자: 앱 첫 화면에서 *처음이신가요? · 등록하기* → **코드 + PIN** 방식 → 시드가 출력한 등록 코드 입력 + PIN(`482917`) 설정 → 가입. 이후 같은 코드+PIN으로 로그인.
* 시드 환자는 *홍길동*(중증 AUD, 퇴원 7일차, naltrexone 복용, 2주차 진행 중)으로 생성되어 대시보드에 바로 데이터가 보입니다.
* 의료진 웹을 `NEXT_PUBLIC_ENABLE_MOCKS=true`로 띄우면 백엔드 없이 목 자격 `provider@example.com` / `Demo!Pass1234` 로도 UI를 둘러볼 수 있습니다.

---

<sub>본 README의 모든 스크린샷·대화·로그는 2026-06 기준 로컬에서 실제 실행(실 Claude Opus 4.8 호출 포함)해 캡처했습니다. AUD-CBT v3.0 · KNU Pentastic.</sub>
