# AUD CBT Backend (v3.0)

FastAPI + PostgreSQL + Anthropic SDK 기반 백엔드.
정본은 `../docs/openapi.yaml` — 본 코드는 그 정본을 구현한다.

## 빠른 시작 (Docker)

```bash
cp .env.example .env
docker compose up --build
```

기동 후:
- API: http://localhost:8000/v1
- Swagger UI: http://localhost:8000/docs
- 헬스: http://localhost:8000/v1/internal/health

데모 환자/의료진 생성:
```bash
docker compose exec api python -m scripts.seed_demo
```
출력된 등록 코드와 PIN으로 `POST /v1/auth/patient/register`, 의료진은 이메일/패스워드/TOTP로 `POST /v1/auth/provider/login`.

## 로컬 (Docker 없이)

```bash
python -m venv .venv && source .venv/bin/activate  # Windows: .venv\Scripts\activate
pip install -r requirements.txt
cp .env.example .env
# PostgreSQL을 별도로 띄우고 DATABASE_URL을 .env에 맞추기
alembic upgrade head
python -m scripts.seed_demo
uvicorn app.main:app --reload
```

## 디렉터리 구조

```
backend/
├── app/
│   ├── main.py              FastAPI 앱 + 라우터 등록
│   ├── config.py            Pydantic Settings
│   ├── database.py          SQLAlchemy 엔진 + 세션
│   ├── deps.py              인증 dependency (current_patient/provider, internal key)
│   ├── security.py          JWT, PIN 해싱
│   ├── ids.py               prefix 기반 ID 생성기
│   ├── exceptions.py        APIError + 상태별 헬퍼
│   ├── middleware.py        request_id, 에러 envelope
│   ├── models/              SQLAlchemy 2.0 모델 (8+ 엔티티)
│   ├── schemas/             Pydantic v2 스키마 (openapi.yaml 미러)
│   ├── services/            LLM 게이트웨이, 안전 분류기, 단계 판단기, 세션 요약기,
│   │                        출력 필터, 컨텍스트 빌더, 트리거 정규화, 대화 오케스트레이션
│   ├── routers/             외부 API 라우터
│   │   └── internal/        내부 컴포넌트 라우터 (X-Internal-Service-Key 필수)
├── alembic/                 마이그레이션 (초기 0001_initial)
├── scripts/seed_demo.py     데모용 시드
├── Dockerfile
├── docker-compose.yml       Postgres + Redis + API
└── requirements.txt
```

## 분업 (담당자 표)

자세한 가이드는 [ONBOARDING.md](ONBOARDING.md).

| 영역 | 담당 |
|---|---|
| 인프라 (config / database / deps / middleware / security / ids / exceptions) | **시니어** |
| 모든 SQLAlchemy 모델 + Alembic | **시니어** |
| 인증 라우터 (`routers/auth.py`) | **시니어** |
| LLM 오케스트레이션 (모든 `services/*`) + 내부 API 라우터 | **시니어** |
| P3 대화 SSE (`routers/patient_conversation.py`, `services/conversation_service.py`) | **시니어** |
| P2 일일 체크인 (모범 라우터 = `routers/patient_checkin.py`) | **시니어** (완성, 입문자가 패턴 학습용으로 읽음) |
| D0 환자 등록 + D2 상세 대시보드 (`provider_d0.py`, `provider_d2_dashboard.py`) | **시니어** |
| P1 홈 (`patient_home.py`) | 입문자 — TODO |
| P4 안전 노출 기록 + 이벤트 이력 (`patient_safety.py`) | 입문자 — TODO (목록만) |
| P5 진도 (`patient_progress.py`) | 입문자 — TODO |
| P8 설정 + SSO (`patient_settings.py`) | 입문자 — patch만 채우면 됨 |
| 의료진 본인 (`provider_profile.py`) | 입문자 — 완료된 형태로 두었지만 확인 권장 |
| D2 환자 목록 (`provider_d2_list.py`) | 입문자 — 완료된 형태 |
| D4 갱신 3종 (`provider_d4.py`) | 입문자 — 검증 패턴 학습 |

## LLM 모드

기본 `USE_LLM_MOCK=true` — `ANTHROPIC_API_KEY` 없이도 결정적 mock 응답으로 모든 흐름이 동작한다.
실제 호출 시:
```bash
ANTHROPIC_API_KEY=sk-ant-... USE_LLM_MOCK=false
```

## 테스트

```bash
pytest
```

## 코드 스타일

```bash
ruff check app
black app
```
