# 이 디렉터리 작업 가이드 (Claude Code용)

여기는 **AUD CBT 백엔드 (FastAPI v3.0)** 의 라우터 디렉터리. 입문자 개발자와 함께 작업한다.

API 정본: `../../docs/openapi.yaml` — 항상 이 명세를 따라야 한다.
사람 친화 가이드: `../../ONBOARDING.md` (입문자용 상세 설명)
프로젝트 README: `../../README.md`

---

## 절대 규칙

1. **이 디렉터리(`app/routers/`) 안의 파일만 수정한다.** 변경 요청이 다른 디렉터리를 건드려야 한다면 먼저 사용자에게 "이 변경은 모델/스키마/서비스 수정이 필요한데 진행할까요?" 라고 물어볼 것.
   - `app/models/` 수정 → Alembic 마이그레이션 추가 필요. 시니어 검토 영역.
   - `app/schemas/` 수정 → openapi.yaml과 동기화 필요. 시니어 검토 영역.
   - `app/services/` 수정 → LLM/안전/세션 로직. 절대 금지에 가까움. 호출만 한다.
   - `app/deps.py`, `app/security.py`, `app/middleware.py`, `app/database.py`, `app/exceptions.py`, `app/ids.py`, `app/config.py` → 인프라. 수정 금지. 사용만.
   - `alembic/` → 마이그레이션. 절대 수정 금지.

2. **이 디렉터리의 모범 라우터는 `patient_checkin.py`.** 새 라우터를 만들거나 TODO를 채울 때 항상 이 파일의 패턴을 먼저 참고한다.

3. **모든 응답·요청은 `app/schemas/` 의 Pydantic 모델을 통해야 한다.** dict를 직접 반환하지 말 것.

4. **모든 에러는 `app/exceptions.py` 의 헬퍼로 발생시킨다.** `HTTPException` 직접 쓰지 말 것. (그래야 표준 ErrorResponse 봉투로 감싸진다.)

5. **언어는 한국어를 기본**으로 쓴다 (사용자 노출 메시지, 주석). 코드 식별자는 영어.

---

## 라우터 현황

| 파일 | 상태 | 비고 |
|---|---|---|
| `auth.py` | 완성 (시니어) | 수정 금지 |
| `patient_checkin.py` | 완성 (시니어, **모범**) | 패턴 참조용. 수정 시 시니어 상의 |
| `patient_conversation.py` | 완성 (시니어, SSE) | 수정 금지 |
| `patient_home.py` | TODO | 입문자 작업 |
| `patient_progress.py` | TODO | 입문자 작업 (가장 단순) |
| `patient_safety.py` | 부분 TODO (`list_events`) | 입문자 작업 |
| `patient_settings.py` | 틀 완성 | 동작 검증 + 보강 |
| `provider_d0.py` | 완성 (시니어) | 수정 금지 |
| `provider_d2_dashboard.py` | 완성 (시니어) | 수정 금지 |
| `provider_d2_list.py` | 완성 (학습용) | 입문자가 읽고 이해 |
| `provider_d4.py` | 완성 (학습용) | 입문자가 읽고 이해 |
| `provider_profile.py` | 완성 (학습용) | 입문자가 읽고 이해 |
| `internal/*.py` | 완성 (시니어) | 수정 금지 |

---

## 표준 라우터 패턴

```python
from datetime import date, datetime, timezone
from fastapi import APIRouter, Query, status
from sqlalchemy import func, select

from app.deps import CurrentPatient, DbSession
from app.exceptions import conflict, not_found
from app.models.daily_checkin import DailyCheckin
from app.schemas.common import PaginatedEnvelope, Pagination
from app.schemas.checkin import CheckinOut

router = APIRouter(prefix="/me/checkins", tags=["Patient - Checkin"])


@router.get("", response_model=PaginatedEnvelope[CheckinOut])
def list_checkins(
    patient: CurrentPatient,   # ← 인증된 환자 (자동 주입, 401은 자동)
    db: DbSession,             # ← DB 세션 (자동 주입)
    page: int = Query(1, ge=1),
    page_size: int = Query(20, ge=1, le=100),
):
    total = int(db.execute(
        select(func.count(DailyCheckin.checkin_id))
        .where(DailyCheckin.patient_id == patient.patient_id)
    ).scalar() or 0)

    rows = db.execute(
        select(DailyCheckin)
        .where(DailyCheckin.patient_id == patient.patient_id)
        .order_by(DailyCheckin.date.desc())
        .offset((page - 1) * page_size)
        .limit(page_size)
    ).scalars().all()

    return PaginatedEnvelope[CheckinOut](
        items=[CheckinOut.model_validate(r) for r in rows],
        pagination=Pagination(
            page=page,
            page_size=page_size,
            total_items=total,
            total_pages=(total + page_size - 1) // page_size if total else 0,
        ),
    )
```

---

## 자주 쓰는 dependency

- `patient: CurrentPatient` — 토큰 검증 + Patient 객체. 환자 전용 엔드포인트에서.
- `provider: CurrentProvider` — 의료진 전용 엔드포인트에서.
- `db: DbSession` — SQLAlchemy 세션. 항상 인자에 추가.
- 내부 API의 경우 `_: InternalKey` — `X-Internal-Service-Key` 검증. (입문자 영역에는 안 나옴)

---

## ID 생성

직접 UUID 만들지 말고 `app/ids.py` 의 헬퍼 사용:

```python
from app.ids import checkin_id as new_checkin_id, p4_event_id as new_p4_event_id

new_row = DailyCheckin(checkin_id=new_checkin_id(), ...)
```

---

## 에러 발생

```python
from app.exceptions import (
    conflict, forbidden, gone, locked, not_found, too_many,
    unauthorized, upstream_unavailable, validation_error,
)

raise not_found("Patient not found")
raise conflict("이미 제출됨", code="CHECKIN_ALREADY_SUBMITTED")
raise forbidden("담당 환자가 아닙니다")
raise validation_error("날짜가 과거", details=[{"field": "date", "issue": "past"}])
```

`code` 는 대문자 스네이크. openapi.yaml과 일치시킬 것.

---

## DB 작업 체크리스트

- INSERT: `db.add(obj)` → `db.commit()` → (필요시) `db.refresh(obj)`
- UPDATE: 필드 수정 → `db.commit()`
- DELETE: `db.delete(obj)` → `db.commit()`
- **commit 빼먹지 말 것. 가장 흔한 실수.**
- 트랜잭션 명시적 시작 불필요 (FastAPI dependency가 세션 라이프사이클 관리).

---

## 본인 환자/의료진 데이터만 접근

라우터에서 path/body의 ID를 받았다면 항상 소유권 검증:

```python
patient = db.get(Patient, patient_id)
if patient is None:
    raise not_found("Patient not found")
if patient.provider_id != provider.provider_id:
    raise forbidden("Not assigned to this patient")
```

`/me/...` 경로는 토큰에서 자동 추출되므로 추가 검증 불필요 (CurrentPatient/Provider가 처리).

---

## 응답 모델 변환

SQLAlchemy 객체 → Pydantic 응답은 `model_validate()`:

```python
return CheckinOut.model_validate(row)         # 단건
return [CheckinOut.model_validate(r) for r in rows]   # 리스트
```

Pydantic 모델이 `ConfigDict(from_attributes=True)`(= `ApiModel`)을 갖고 있어야 동작. 스키마 작성 시 `app.schemas.common.ApiModel` 사용.

---

## 새 라우터를 main.py에 등록

`app/main.py` 의 import 블록과 `for r in (...)` 블록에 추가:

```python
from app.routers import patient_new_thing as r_patient_new_thing
# ...
for r in (..., r_patient_new_thing.router, ...):
    app.include_router(r, prefix=API_PREFIX)
```

---

## 테스트 절차

1. 파일 저장 → uvicorn 자동 재시작 (`docker compose logs -f api` 에서 `Reloading...` 확인).
2. http://localhost:8000/docs → 로그인 엔드포인트로 토큰 받기 → Authorize.
3. 대상 엔드포인트 "Try it out" → Execute → 응답 검증.
4. 응답 모양은 openapi.yaml과 일치해야 함.

---

## 입문자와 함께 작업할 때

- 코드를 **직접 다 짜주지 말고**, 입문자가 채울 부분을 명확히 표시하고 **왜** 그렇게 짜는지 한 줄 설명을 곁들일 것. ONBOARDING.md 9장의 Step 1→4 같은 점진적 안내가 이상적.
- 새 개념(예: SQLAlchemy `select`, FastAPI `Query`)이 등장하면 첫 등장 시 1줄 설명.
- 큰 변경(예: 새 모델 추가, 마이그레이션, 서비스 수정)을 제안하기 전에 시니어 검토가 필요함을 알릴 것.
- 한글 메시지·주석을 자연스럽게 섞을 것. 입문자가 한국어 사용자.

---

## 변경 후 빠른 검증

```bash
# 컨테이너 안에서 (선택)
docker compose exec api ruff check app/routers
docker compose exec api python -c "from app.main import app; print(len(app.routes))"
```

위 두 명령이 통과하고 Swagger에서 새 엔드포인트가 보이면 일단 성공.
