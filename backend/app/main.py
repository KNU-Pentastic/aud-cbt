import logging

from fastapi import FastAPI
from fastapi.exceptions import RequestValidationError
from fastapi.middleware.cors import CORSMiddleware
from starlette.exceptions import HTTPException as StarletteHTTPException

from slowapi.errors import RateLimitExceeded
from slowapi.middleware import SlowAPIMiddleware

from app.config import settings
from app.middleware import (
    MaxBodySizeMiddleware,
    RequestIDMiddleware,
    http_exception_handler,
    unhandled_exception_handler,
    validation_exception_handler,
)
from app.ratelimit import limiter, rate_limit_handler

# Routers (senior-owned)
from app.routers import auth as r_auth
from app.routers import patient_checkin as r_patient_checkin
from app.routers import patient_conversation as r_patient_conv
from app.routers import provider_d0 as r_provider_d0
from app.routers import provider_d2_dashboard as r_provider_d2_dash
from app.routers.internal import context as r_int_context
from app.routers.internal import health as r_int_health
from app.routers.internal import llm as r_int_llm
from app.routers.internal import output as r_int_output
from app.routers.internal import safety as r_int_safety
from app.routers.internal import session as r_int_session
from app.routers.internal import stage as r_int_stage
from app.routers.internal import trigger as r_int_trigger

# Routers (junior-owned, stubbed)
from app.routers import patient_home as r_patient_home
from app.routers import patient_progress as r_patient_progress
from app.routers import patient_safety as r_patient_safety
from app.routers import patient_settings as r_patient_settings
from app.routers import provider_d2_list as r_provider_d2_list
from app.routers import provider_d4 as r_provider_d4
from app.routers import provider_profile as r_provider_profile


logging.basicConfig(
    level=getattr(logging, settings.log_level, logging.INFO),
    format="%(asctime)s %(levelname)s %(name)s %(message)s",
)

app = FastAPI(
    title="AUD CBT Digital Therapeutic API",
    description="v3.0 (대회 데모) — openapi.yaml 정본 기반.",
    version="3.0.0",
    # 운영(APP_ENV=production)에서는 대화형 문서/스키마를 닫아 정찰 표면을 줄인다.
    docs_url=None if settings.is_production else "/docs",
    redoc_url=None if settings.is_production else "/redoc",
    openapi_url=None if settings.is_production else "/openapi.json",
)

# 레이트리밋(slowapi). 라우트별 @limiter.limit 데코레이터가 주 방어선이고,
# SlowAPIMiddleware 는 전역 기본 한도(120/min)를 적용한다.
app.state.limiter = limiter
app.add_exception_handler(RateLimitExceeded, rate_limit_handler)

# 미들웨어. Starlette 는 등록 역순으로 적용한다(마지막 등록 = 가장 바깥).
# 바깥→안쪽 순서를 CORS → SlowAPI → RequestID → MaxBodySize 로 둔다.
# CORS 가 가장 바깥이라야 429/413 같은 에러 응답에도 CORS 헤더가 실려
# 브라우저가 에러를 읽을 수 있다.
app.add_middleware(MaxBodySizeMiddleware)
app.add_middleware(RequestIDMiddleware)
app.add_middleware(SlowAPIMiddleware)
app.add_middleware(
    CORSMiddleware,
    allow_origins=settings.cors_origin_list,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
    expose_headers=["X-Request-ID"],
)

app.add_exception_handler(StarletteHTTPException, http_exception_handler)
app.add_exception_handler(RequestValidationError, validation_exception_handler)
app.add_exception_handler(Exception, unhandled_exception_handler)


API_PREFIX = "/v1"

for r in (
    r_auth.router,
    r_patient_home.router,
    r_patient_checkin.router,
    r_patient_conv.router,
    r_patient_safety.router,
    r_patient_progress.router,
    r_patient_settings.router,
    r_provider_profile.router,
    r_provider_d0.router,
    r_provider_d2_list.router,
    r_provider_d2_dash.router,
    r_provider_d4.router,
    r_int_safety.router,
    r_int_stage.router,
    r_int_session.router,
    r_int_output.router,
    r_int_llm.router,
    r_int_context.router,
    r_int_trigger.router,
    r_int_health.router,
):
    app.include_router(r, prefix=API_PREFIX)


@app.on_event("startup")
def _log_llm_mode() -> None:
    from app.services import llm_gateway

    mode = llm_gateway.effective_mode()
    log = logging.getLogger("app.startup")
    if mode["mode"] == "real":
        log.info("LLM mode=real model=%s", mode["model"])
    else:
        log.warning("LLM mode=MOCK model=%s reason=%s", mode["model"], mode["reason"])


@app.get("/", tags=["meta"])
def root():
    info = {
        "service": "aud-cbt-backend",
        "version": "3.0.0",
    }
    if not settings.is_production:
        info["docs"] = "/docs"
        info["openapi"] = "/openapi.json"
    return info
