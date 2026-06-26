import logging
import uuid

from fastapi import Request
from fastapi.exceptions import RequestValidationError
from fastapi.responses import JSONResponse
from starlette.exceptions import HTTPException as StarletteHTTPException
from starlette.middleware.base import BaseHTTPMiddleware

log = logging.getLogger("aud_cbt")


def _request_id(request: Request) -> str:
    rid = request.headers.get("X-Request-ID") or getattr(request.state, "request_id", None)
    return rid or str(uuid.uuid4())


# 요청 본문 크기 상한. 환자 메시지(MessageIn.text)는 4000자 상한이라 512KB 는
# 정상 트래픽을 한참 상회한다. 내부 dialogue 페이로드가 커지면 상향한다.
MAX_BODY_BYTES = 512 * 1024

_SECURITY_HEADERS = {
    "X-Content-Type-Options": "nosniff",
    "X-Frame-Options": "DENY",
    "Referrer-Policy": "no-referrer",
    "Strict-Transport-Security": "max-age=63072000; includeSubDomains",
}


class RequestIDMiddleware(BaseHTTPMiddleware):
    async def dispatch(self, request: Request, call_next):
        rid = _request_id(request)
        request.state.request_id = rid
        response = await call_next(request)
        response.headers["X-Request-ID"] = rid
        for k, v in _SECURITY_HEADERS.items():
            response.headers.setdefault(k, v)
        return response


class MaxBodySizeMiddleware(BaseHTTPMiddleware):
    """Content-Length 가 상한을 넘으면 본문을 읽기 전에 413 으로 즉시 거절한다.

    요청만 검사하고 응답은 건드리지 않으므로 SSE 스트리밍과 호환된다.
    """

    async def dispatch(self, request: Request, call_next):
        cl = request.headers.get("content-length")
        if cl is not None:
            try:
                too_big = int(cl) > MAX_BODY_BYTES
            except ValueError:
                too_big = False
            if too_big:
                rid = _request_id(request)
                request.state.request_id = rid
                return JSONResponse(
                    status_code=413,
                    content=_error_envelope(
                        "PAYLOAD_TOO_LARGE",
                        "요청 본문이 너무 큽니다.",
                        None,
                        rid,
                    ),
                    headers={"X-Request-ID": rid},
                )
        return await call_next(request)


def _error_envelope(code: str, message: str, details, request_id: str) -> dict:
    return {
        "error": {
            "code": code,
            "message": message,
            "details": details or [],
            "request_id": request_id,
        }
    }


async def http_exception_handler(request: Request, exc: StarletteHTTPException):
    rid = getattr(request.state, "request_id", str(uuid.uuid4()))
    if isinstance(exc.detail, dict) and "code" in exc.detail:
        body = _error_envelope(
            code=exc.detail.get("code", "ERROR"),
            message=exc.detail.get("message", str(exc.detail)),
            details=exc.detail.get("details"),
            request_id=rid,
        )
    else:
        body = _error_envelope(
            code=_status_code_to_code(exc.status_code),
            message=str(exc.detail),
            details=None,
            request_id=rid,
        )
    headers = exc.headers or {}
    headers["X-Request-ID"] = rid
    return JSONResponse(status_code=exc.status_code, content=body, headers=headers)


async def validation_exception_handler(request: Request, exc: RequestValidationError):
    rid = getattr(request.state, "request_id", str(uuid.uuid4()))
    details = []
    for err in exc.errors():
        loc = ".".join(str(p) for p in err.get("loc", []) if p not in ("body", "query", "path"))
        details.append({"field": loc, "issue": err.get("msg", "invalid")})
    body = _error_envelope(
        code="VALIDATION_ERROR",
        message="Request validation failed",
        details=details,
        request_id=rid,
    )
    return JSONResponse(status_code=422, content=body, headers={"X-Request-ID": rid})


async def unhandled_exception_handler(request: Request, exc: Exception):
    rid = getattr(request.state, "request_id", str(uuid.uuid4()))
    log.exception("unhandled error rid=%s", rid)
    body = _error_envelope(
        code="INTERNAL_ERROR",
        message="Internal server error",
        details=None,
        request_id=rid,
    )
    return JSONResponse(status_code=500, content=body, headers={"X-Request-ID": rid})


def _status_code_to_code(status_code: int) -> str:
    return {
        400: "BAD_REQUEST",
        401: "UNAUTHORIZED",
        403: "FORBIDDEN",
        404: "NOT_FOUND",
        405: "METHOD_NOT_ALLOWED",
        409: "CONFLICT",
        410: "GONE",
        413: "PAYLOAD_TOO_LARGE",
        423: "SAFETY_LOCKED",
        429: "RATE_LIMITED",
        500: "INTERNAL_ERROR",
        503: "SERVICE_UNAVAILABLE",
    }.get(status_code, "ERROR")
