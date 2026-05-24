# 백엔드 입문자용 온보딩

이 문서 하나만 따라가면 됩니다. 모르는 단어가 나와도 다음 줄에서 설명합니다.
처음 보는 개념은 **굵게** 표시했고, 헷갈리면 그 단어로 Ctrl+F 하면 다시 정의가 나옵니다.

> 페이지 따라 차근차근 진행하세요. 0장(환경 셋업)을 끝낸 다음에 9장(첫 라우터 실습)으로 곧장 가도 됩니다.

---

## 목차

0. 시작 전 — 백엔드가 뭔지 30초 설명
1. 환경 셋업 — 한 번 동작시키기
2. 프로젝트 한 바퀴 둘러보기
3. 핵심 개념 5가지 (FastAPI / Pydantic / SQLAlchemy / Dependency / JWT)
4. 본인이 맡을 7개 파일
5. 모범 라우터 한 줄씩 해설 (patient_checkin.py)
6. Swagger UI 사용법
7. 자주 쓰는 코드 치트시트
8. 절대 하지 말 것
9. **실습: 첫 라우터 채우기 (patient_progress.py)** — 가장 쉬운 것부터
10. 자주 보는 에러와 해결법
11. PR 워크플로
12. 막혔을 때

---

## 0. 시작 전 — 백엔드가 뭔지 30초 설명

지금까지 만든 환자 앱은 **클라이언트**입니다. 화면을 그리고 사용자 입력을 받습니다.
하지만 "어제 단주 일수가 며칠인지", "체크인을 어디에 저장할지" 같은 건 앱 혼자 풀 수 없습니다.
그래서 **서버**(=백엔드)가 필요합니다.

```
[환자 앱]  ──── HTTPS 요청 ────▶  [백엔드 API]  ──── SQL ────▶  [PostgreSQL DB]
   (RN)      JSON 데이터               (FastAPI)                   (영구 저장)
```

**API**(Application Programming Interface)는 앱과 백엔드가 주고받는 규칙입니다.
예: "오늘 체크인을 제출하고 싶으면, `POST /me/checkins` 주소로 JSON을 보내라."
이 규칙들을 모아 둔 게 [`docs/openapi.yaml`](../docs/openapi.yaml)이고, 이게 우리 팀의 **계약서**입니다.

이 백엔드는 그 계약서를 코드로 구현합니다.

---

## 1. 환경 셋업 — 한 번 동작시키기

### 1.1 필요한 것
- **Docker Desktop** — Windows/Mac용 컨테이너 도구. 설치만 해두면 됩니다.
- **VS Code** (또는 익숙한 에디터)
- **Git**

### 1.2 셋업 (복붙)

PowerShell 또는 Terminal에서:

```bash
cd backend
copy .env.example .env       # Mac/Linux: cp .env.example .env
docker compose up --build
```

처음에는 5~10분 걸립니다. 다음과 같은 줄이 나오면 성공:
```
api-1  | INFO:     Uvicorn running on http://0.0.0.0:8000
```

브라우저에서 http://localhost:8000/docs 를 열면 **Swagger UI** 가 보입니다.
이게 API 목록 + 테스트 도구입니다.

### 1.3 데모 데이터 만들기

다른 터미널 창에서:
```bash
docker compose exec api python -m scripts.seed_demo
```

출력 예시:
```
Provider ID  : pr_8f3a9b2c4d
Email        : demo.doctor@example.com
Password     : DemoPassword!2026
TOTP secret  : JBSWY3DPEHPK3PXP
TOTP URI     : otpauth://totp/...

Patient ID   : p_xyz12345
Reg code     : K7M3X9P2
Suggested PIN: 482917
```

이걸로 환자 등록과 의료진 로그인을 둘 다 테스트할 수 있습니다.

### 1.4 정지/재시작
- 정지: 터미널에서 `Ctrl+C`, 또는 다른 창에서 `docker compose down`
- 코드를 바꾸면 → 자동으로 재시작됨 (uvicorn `--reload`)
- DB 초기화: `docker compose down -v` (`-v` 는 볼륨 삭제. 데이터가 다 날아갑니다.)

---

## 2. 프로젝트 한 바퀴 둘러보기

```
backend/
├── app/                      ← 우리가 작업하는 본체
│   ├── main.py               ← FastAPI 앱 (시니어가 작성)
│   ├── config.py             ← 환경변수 설정 (수정 X)
│   ├── database.py           ← DB 연결 (수정 X)
│   ├── deps.py               ← 의존성 (CurrentPatient 등, 사용만 함)
│   ├── security.py           ← 비밀번호 해싱 (수정 X)
│   ├── ids.py                ← ID 생성기 (사용만 함)
│   ├── exceptions.py         ← 에러 헬퍼 (사용만 함)
│   ├── middleware.py         ← (수정 X)
│   ├── models/               ← DB 테이블 정의 (수정 X — 시니어와 상의)
│   ├── schemas/              ← 요청/응답 형식 (수정 X — openapi.yaml 미러)
│   ├── services/             ← LLM·안전·세션 로직 (절대 수정 X)
│   └── routers/              ← ★ 본인이 작업하는 곳
│       ├── patient_checkin.py   ← 모범 라우터 (읽고 따라하기)
│       ├── patient_home.py      ← 본인 작업 o
│       ├── patient_progress.py  ← 본인 작업 o
│       ├── patient_safety.py    ← 본인 작업 
│       ├── patient_settings.py  ← 본인 작업
│       ├── provider_profile.py  ← 본인 작업 (완성됨)
│       ├── provider_d2_list.py  ← 본인 작업 (완성됨)
│       └── provider_d4.py       ← 본인 작업 (완성됨)
├── alembic/                  ← DB 마이그레이션 (수정 X)
├── scripts/seed_demo.py      ← 데모 시드
├── tests/                    ← 테스트 (지금은 비어있음)
├── docker-compose.yml        ← Docker 설정
└── ONBOARDING.md             ← ★ 지금 이 파일
```

요약: **`app/routers/` 안의 7개 파일만 바꾸면 됩니다.** 다른 폴더는 import만 합니다.

---

## 3. 핵심 개념 5가지

### 3.1 FastAPI
Python으로 API 서버를 만드는 도구. 함수 위에 `@router.get("/...")` 같은 줄을 붙이면
그 함수가 그 주소의 핸들러가 됩니다.

```python
@router.get("/me/progress")
def get_progress():
    return {"hello": "world"}   # 자동으로 JSON으로 변환됨
```

### 3.2 Pydantic — 요청/응답 형식
"이 요청 본문은 이런 필드를 가진 JSON이어야 한다"를 클래스로 선언합니다.
타입이 안 맞으면 FastAPI가 자동으로 400 에러를 줍니다.

```python
class CheckinSubmit(BaseModel):
    mood_nrs: int = Field(ge=0, le=10)    # 0~10 정수
    free_note: str | None = None          # 있어도 되고 없어도 됨
```

### 3.3 SQLAlchemy — DB 조작
파이썬 객체로 DB 테이블을 다룹니다. SQL을 직접 안 써도 됩니다.

```python
# 한 줄 가져오기
patient = db.get(Patient, "p_xyz12345")
print(patient.name)

# 조건으로 여러 줄 가져오기
rows = db.execute(
    select(DailyCheckin).where(DailyCheckin.patient_id == "p_xyz")
).scalars().all()

# 저장
new_row = DailyCheckin(checkin_id="ci_1", patient_id="p_xyz", ...)
db.add(new_row)
db.commit()     # ← 이걸 안 부르면 저장 안 됨!
```

### 3.4 Dependency (의존성 주입)
함수 인자에 타입을 적으면 FastAPI가 알아서 채워주는 마법.

```python
def my_handler(patient: CurrentPatient, db: DbSession):
    # patient: 토큰에서 추출한 환자 객체 (로그인 안 되어 있으면 401 자동 반환)
    # db: DB 세션
    return patient.name
```

`patient: CurrentPatient` 한 줄로 인증 + DB 조회까지 다 끝납니다. 외워두면 됩니다.

### 3.5 JWT (토큰)
사용자가 로그인하면 서버가 긴 문자열(JWT)을 줍니다. 이후 모든 요청 헤더에
`Authorization: Bearer <jwt>` 를 붙여 보냅니다. 서버는 그걸 보고 "아, 이건 p_xyz12345 환자구나" 파악합니다.

본인은 JWT 자체를 다루지 않습니다. `CurrentPatient` 가 다 해줍니다.

---

## 4. 본인이 맡을 7개 파일

| 파일 | 상태 | 본인이 할 일 |
|---|---|---|
| `patient_home.py` | TODO | `GET /me/patient` 채우기 — 단주일수·다음세션·오늘할일 계산 |
| `patient_progress.py` | TODO | `GET /me/progress` 채우기 — sobriety_days, weeks_completed |
| `patient_safety.py` | 절반 완성 | `list_events` 의 페이지네이션 채우기 |
| `patient_settings.py` | 틀 완성 | 코드 읽고 동작 확인. 부족하면 보강. |
| `provider_profile.py` | 완성됨 | 읽고 동작 확인 (학습용) |
| `provider_d2_list.py` | 완성됨 | 읽고 동작 확인 (학습용) |
| `provider_d4.py` | 완성됨 | 읽고 동작 확인 (학습용) |

권장 순서: 9장 실습부터 보세요. 첫 라우터(progress)를 같이 만들어봅니다.

---

## 5. 모범 라우터 한 줄씩 해설 — `patient_checkin.py`

이 파일이 모든 패턴을 담고 있습니다. 한 번 정독하면 다른 라우터는 복사·변형만 하면 됩니다.

### 5.1 파일 맨 위 — import

```python
from datetime import date, datetime, timedelta, timezone
```
시간 다루는 표준 라이브러리. `date.today()`, `datetime.now(timezone.utc)` 자주 씁니다.

```python
from fastapi import APIRouter, Path, Query, status
```
- `APIRouter`: 라우터(엔드포인트 묶음)를 만드는 클래스.
- `Query`: URL 쿼리 파라미터 (예: `?page=2`).
- `Path`: URL 경로 파라미터 (예: `/checkins/{checkin_id}` 의 checkin_id).
- `status`: 상태 코드 상수 (예: `status.HTTP_201_CREATED` = 201).

```python
from sqlalchemy import func, select
```
SQL을 파이썬으로 짤 때 쓰는 함수들. `select(...)` 가 SELECT 문, `func.count(...)` 가 COUNT(*).

```python
from app.deps import CurrentPatient, DbSession
```
★ 마법의 두 줄. 이걸 함수 인자에 쓰면 인증 + DB 세션이 자동으로 들어옵니다.

```python
from app.exceptions import conflict, not_found
```
에러를 던질 때 씁니다. `raise not_found("환자 없음")` 한 줄로 404 반환 + JSON 에러 형식 자동 변환.

### 5.2 라우터 객체 만들기

```python
router = APIRouter(prefix="/me/checkins", tags=["Patient - Checkin"])
```
- `prefix="/me/checkins"`: 이 파일의 모든 엔드포인트는 `/me/checkins`로 시작.
- `tags=["..."]`: Swagger UI에서 그룹핑되는 이름.

### 5.3 첫 핸들러 — POST `/me/checkins`

```python
@router.post(
    "",                                     # prefix 뒤에 붙는 경로 (여기는 빈 문자열)
    response_model=CheckinResponse,         # 응답 형식 — FastAPI가 자동으로 변환·검증
    status_code=status.HTTP_201_CREATED,    # 성공 시 상태 코드 (201 = Created)
)
def submit_checkin(
    body: CheckinSubmit,        # 요청 본문 JSON을 CheckinSubmit 객체로 받음
    patient: CurrentPatient,    # 토큰에서 추출한 환자 (자동)
    db: DbSession,              # DB 세션 (자동)
) -> CheckinResponse:
    today = _today()

    # 1. 오늘 이미 제출했는지 확인
    existing = db.execute(
        select(DailyCheckin).where(
            DailyCheckin.patient_id == patient.patient_id,
            DailyCheckin.date == today,
        )
    ).scalar_one_or_none()    # 결과가 한 줄이면 객체, 없으면 None

    if existing is not None:
        raise conflict(
            "Today's check-in already submitted",
            code="CHECKIN_ALREADY_SUBMITTED",
        )

    # 2. 새 체크인 만들기
    checkin = DailyCheckin(
        checkin_id=new_checkin_id(),                    # 고유 ID 생성
        patient_id=patient.patient_id,
        date=today,
        mood_nrs=body.mood_nrs,
        # ... 필드들 ...
    )

    # 3. DB에 추가
    db.add(checkin)              # 메모리에 추가
    db.commit()                  # 실제로 DB에 저장 ← 이걸 빼먹으면 안 됨!
    db.refresh(checkin)          # DB에서 다시 읽어와 객체 동기화

    # 4. 응답 반환 — Pydantic이 알아서 JSON으로 변환
    return CheckinResponse(checkin=CheckinOut.model_validate(checkin), ...)
```

여기 패턴을 외우세요. 거의 모든 POST 핸들러가 이 흐름입니다:
**(1) 검증 → (2) 객체 생성 → (3) add+commit+refresh → (4) 응답**

### 5.4 두 번째 핸들러 — GET 리스트 + 페이지네이션

```python
@router.get("", response_model=PaginatedEnvelope[CheckinOut])
def list_checkins(
    patient: CurrentPatient,
    db: DbSession,
    page: int = Query(1, ge=1),                    # ?page=2 (기본 1, 1 이상)
    page_size: int = Query(20, ge=1, le=100),      # ?page_size=50 (1~100)
):
    # 1. 조건이 들어간 SELECT 쿼리
    stmt = select(DailyCheckin).where(DailyCheckin.patient_id == patient.patient_id)

    # 2. 전체 개수 (페이지 계산용)
    total = int(db.execute(
        select(func.count(DailyCheckin.checkin_id))
        .where(DailyCheckin.patient_id == patient.patient_id)
    ).scalar() or 0)

    # 3. 현재 페이지의 데이터만 가져오기
    rows = db.execute(
        stmt.order_by(DailyCheckin.date.desc())     # 최신순
            .offset((page - 1) * page_size)         # 스킵 개수
            .limit(page_size)                       # 가져올 개수
    ).scalars().all()

    # 4. 응답 봉투 구성
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

페이지네이션이 필요한 모든 라우터(예: `patient_safety.list_events`)에서 이 형태를 복붙하고 모델만 바꾸면 됩니다.

### 5.5 정리
다른 라우터도 패턴은 거의 같습니다. 이 한 파일을 닫고 9장 실습으로 가도 됩니다.

---

## 6. Swagger UI 사용법

http://localhost:8000/docs 를 열면 모든 엔드포인트가 나옵니다.

테스트 흐름 (체크인 제출 예시):
1. 먼저 **로그인** — `POST /v1/auth/patient/register` 또는 `/login` 펼치기 → "Try it out" → 등록 코드/PIN 입력 → "Execute" → 응답에서 `access_token` 복사.
2. 페이지 우측 상단 **Authorize** 버튼 → `Bearer <복사한 토큰>` 붙여넣기 → Authorize.
3. 이제 다른 엔드포인트(`POST /v1/me/checkins` 등)를 "Try it out" 으로 호출 → 200/201이 나오면 성공.
4. 응답이 이상하면 같은 페이지의 "Schemas" 섹션에서 모델 모양을 확인.

---

## 7. 자주 쓰는 코드 치트시트

### 7.1 import 묶음 (대부분의 라우터에 필요)

```python
from datetime import date, datetime, timedelta, timezone
from fastapi import APIRouter, Path, Query, Response, status
from sqlalchemy import desc, func, select

from app.deps import CurrentPatient, CurrentProvider, DbSession
from app.exceptions import conflict, forbidden, not_found, validation_error
```

### 7.2 DB 한 줄 가져오기 (PK로)
```python
patient = db.get(Patient, patient_id)
if patient is None:
    raise not_found("Patient not found")
```

### 7.3 DB 조건 검색 (한 줄)
```python
row = db.execute(
    select(DailyCheckin).where(DailyCheckin.patient_id == "p_xyz")
).scalar_one_or_none()    # 없으면 None
```

### 7.4 DB 조건 검색 (여러 줄)
```python
rows = db.execute(
    select(DailyCheckin)
    .where(DailyCheckin.patient_id == "p_xyz")
    .order_by(DailyCheckin.date.desc())
    .limit(10)
).scalars().all()
```

### 7.5 INSERT
```python
new_row = DailyCheckin(checkin_id="ci_xxx", ...)
db.add(new_row)
db.commit()
db.refresh(new_row)    # 자동 생성된 필드(예: 시간)를 다시 읽어옴
```

### 7.6 UPDATE
```python
patient.current_week = 3
db.commit()
```

### 7.7 DELETE
```python
db.delete(sso)
db.commit()
```

### 7.8 에러 던지기
```python
raise not_found("환자 없음")
raise conflict("이미 제출됨", code="CHECKIN_ALREADY_SUBMITTED")
raise forbidden("권한 없음")
raise validation_error("날짜가 과거")
```

### 7.9 오늘 날짜
```python
today = datetime.now(timezone.utc).date()      # date 객체
now = datetime.now(timezone.utc)               # datetime 객체
```

### 7.10 날짜 차이 (단주 일수)
```python
days = (today - patient.discharge_date).days
sobriety_days = max(0, days)                    # 음수 방지
```

---

## 8. 절대 하지 말 것

- ❌ **토큰을 직접 디코드하지 말 것.** `CurrentPatient` 쓰면 끝.
- ❌ **`db = SessionLocal()` 직접 만들지 말 것.** `DbSession` 쓰면 끝.
- ❌ **`app/services/` 안의 함수를 수정하지 말 것.** 호출만 OK. 수정은 시니어 영역.
- ❌ **`app/models/` 수정하지 말 것.** DB 구조 바꾸려면 시니어와 상의 → Alembic 마이그레이션 추가가 필요함.
- ❌ **`alembic/` 마이그레이션 파일 직접 수정 금지.**
- ❌ **비밀번호/PIN을 그대로 저장 금지.** `hash_secret()` 함수 사용.
- ❌ **`db.commit()` 빼먹지 말 것.** 빠뜨리면 저장이 안 됩니다. (가장 흔한 실수)
- ❌ **본인 토큰을 코드에 하드코딩 금지.** 환경변수나 Swagger Authorize로만.

---

## 9. 실습 — 첫 라우터 채우기 (patient_progress.py)

가장 단순한 것부터 같이 만들어봅니다. **단주 일수만 계산해서 응답하는 엔드포인트**입니다.

### 9.1 목표 확인
[openapi.yaml](../docs/openapi.yaml) 의 `/me/progress` 부분을 보면:

```yaml
GET /me/progress
응답:
  sobriety_days: 단주 일수 (0 이상 정수)
  weeks_completed: 완료한 주 수 (0~12)
  current_week: 현재 Week (1~12)
  next_session_date: 다음 세션 날짜 (없으면 null)
```

### 9.2 파일 열기
`backend/app/routers/patient_progress.py` 를 엽니다. 현재 코드:

```python
@router.get("/me/progress", response_model=ProgressResponse)
def get_progress(patient: CurrentPatient) -> ProgressResponse:
    # TODO(junior): docstring대로 계산.
    return ProgressResponse(
        sobriety_days=0,
        weeks_completed=max(0, patient.current_week - 1),
        current_week=patient.current_week,
        next_session_date=None,
    )
```

`sobriety_days=0` 만 진짜 값으로 바꾸면 됩니다.

### 9.3 한 줄씩 채우기

**Step 1.** 오늘 날짜를 구합니다.

```python
from datetime import datetime, timezone   # 파일 맨 위에 추가

today = datetime.now(timezone.utc).date()
```

**Step 2.** 환자의 퇴원일과 빼서 일수를 구합니다.

```python
days = (today - patient.discharge_date).days
```

`patient.discharge_date` 는 어디서 왔을까요? `app/models/patient.py` 를 열어보면 `discharge_date: Mapped[date]` 가 있습니다. `CurrentPatient` 가 자동으로 가져온 객체이므로 점(`.`)으로 모든 필드에 접근 가능.

**Step 3.** 음수면 0으로 (퇴원일이 미래일 수 있음).

```python
sobriety_days = max(0, days)
```

**Step 4.** 완성된 함수:

```python
from datetime import datetime, timezone

from fastapi import APIRouter

from app.deps import CurrentPatient
from app.schemas.patient import ProgressResponse

router = APIRouter(tags=["Patient - Progress"])


@router.get("/me/progress", response_model=ProgressResponse)
def get_progress(patient: CurrentPatient) -> ProgressResponse:
    today = datetime.now(timezone.utc).date()
    sobriety_days = max(0, (today - patient.discharge_date).days)
    return ProgressResponse(
        sobriety_days=sobriety_days,
        weeks_completed=max(0, patient.current_week - 1),
        current_week=patient.current_week,
        next_session_date=None,
    )
```

### 9.4 동작 확인

1. 파일 저장 → uvicorn이 자동 재시작 (콘솔에 `Reloading...` 뜸).
2. Swagger UI에서 로그인 → Authorize.
3. `GET /v1/me/progress` 펼치기 → Try it out → Execute.
4. 응답에 `"sobriety_days": 7` (시드가 7일 전 퇴원으로 설정) 이 나오면 성공.

### 9.5 다음 라우터로

같은 방식으로 `patient_home.py` 를 채워보세요.
- `sobriety_days`: 위와 동일하게 계산
- `days_to_next_session`: 환자의 `session_day_of_week`(0=월요일)와 오늘 요일을 비교
- `today_tasks.checkin_pending`: 오늘 `DailyCheckin` 이 있는지 DB 조회

힌트:
```python
# 오늘 체크인이 있는지
exists = db.execute(
    select(DailyCheckin).where(
        DailyCheckin.patient_id == patient.patient_id,
        DailyCheckin.date == today,
    )
).scalar_one_or_none() is not None
```

---

## 10. 자주 보는 에러와 해결법

### 10.1 `422 Unprocessable Entity`
요청 본문이 스키마와 안 맞음. 응답 JSON 안의 `details` 필드에 어느 필드가 잘못됐는지 적혀있음.
→ Swagger UI의 "Schema" 보고 모양 확인.

### 10.2 `401 Unauthorized`
토큰이 없거나 만료됨.
→ 다시 로그인해서 토큰 받기 → Swagger의 Authorize 버튼.

### 10.3 `500 Internal Server Error`
서버 코드가 터졌음.
→ `docker compose logs -f api` 실행 → 빨간 스택트레이스 보기 → 어느 줄에서 무엇 때문에 터졌는지 확인.

### 10.4 `sqlalchemy.exc.IntegrityError ... duplicate key`
이미 있는 PK로 INSERT 시도.
→ ID 생성 함수(`new_checkin_id()` 등)를 매번 호출하는지 확인.

### 10.5 `sqlalchemy.exc.PendingRollbackError`
직전 트랜잭션에 에러가 났는데 commit/rollback을 안 함.
→ try/except로 감싸고 `db.rollback()` 호출. (대부분은 미들웨어가 자동 처리해줌)

### 10.6 변경했는데 DB에 안 들어감
`db.commit()` 빼먹음. 가장 흔한 실수.

### 10.7 ImportError: cannot import name 'X'
파일 위치 또는 이름 오타. 다른 라우터의 import 줄을 보고 비교.

### 10.8 `uvicorn` 이 자동 재시작 안 됨
컨테이너 안에서 파일 변경 감지가 안 되는 경우. `docker compose restart api` 한 번.

---

## 11. PR 워크플로

1. **브랜치 만들기**:
   ```bash
   git checkout -b feat/patient-progress
   ```
2. **한 PR = 한 라우터** 원칙. 작게 자주 머지.
3. **커밋 메시지** 예시:
   ```
   feat(patient): GET /me/progress 단주일수 계산 구현
   ```
4. **PR 본문**에 적을 것:
   - 무엇을 했는지 (한 줄)
   - Swagger에서 호출한 응답 스크린샷
   - 모르겠는 부분 (있으면 적기 — 리뷰가 더 빨라짐)
5. **시니어 리뷰** → 수정 → 머지.

---

## 12. 막혔을 때

먼저 혼자 5분만 시도:
1. `patient_checkin.py` 다시 보기.
2. Swagger UI에서 응답 모양 확인.
3. `docker compose logs -f api` 로 에러 로그 보기.

5분이 지나도 모르겠으면 시니어에게 물어보기. 이렇게 적으세요:

> **나쁜 질문**: "안 돼요"
>
> **좋은 질문**: "POST /me/checkins 호출하면 500 에러가 나는데, 로그에 `AttributeError: 'NoneType' object has no attribute 'discharge_date'` 가 떠요. seed_demo 실행은 했고, Swagger에서 토큰도 Authorize에 넣었습니다. patient_checkin.py 의 41번 줄에서 터지는 것 같은데, patient 가 None인 이유를 모르겠습니다."

답변을 5배 빨리 받습니다.

---

## 마지막 한마디

처음엔 다 어렵습니다. **patient_checkin.py 한 파일만 외우면 나머지는 전부 변형**이에요.
3일이면 7개 라우터 다 할 수 있습니다. 화이팅.
