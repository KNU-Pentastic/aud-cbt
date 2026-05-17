import logging

from fastapi import FastAPI
from fastapi.exceptions import RequestValidationError
from fastapi.middleware.cors import CORSMiddleware
from starlette.exceptions import HTTPException as StarletteHTTPException

from app.config import settings
from app.middleware import (
    RequestIDMiddleware,
    http_exception_handler,
    unhandled_exception_handler,
    validation_exception_handler,
)

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
    docs_url="/docs",
    redoc_url="/redoc",
    openapi_url="/openapi.json",
)

# CORS
app.add_middleware(
    CORSMiddleware,
    allow_origins=settings.cors_origin_list,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
    expose_headers=["X-Request-ID"],
)
app.add_middleware(RequestIDMiddleware)

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


@app.get("/", tags=["meta"])
def root():
    return {
        "service": "aud-cbt-backend",
        "version": "3.0.0",
        "docs": "/docs",
        "openapi": "/openapi.json",
    }
