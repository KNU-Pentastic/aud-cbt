"""HTTP 레이트리밋 (slowapi, in-메모리).

단일 인스턴스 배포를 전제로 in-메모리 저장소를 쓴다. 복제(replicas)나 워커를
2개 이상으로 늘리면 한도가 프로세스마다 따로 카운트되므로, 그때는 Limiter 의
storage_uri 를 Redis(settings.redis_url)로 바꿔야 한다.

키 전략: 인증된 요청은 JWT subject(환자/의료진)별로, 비인증 요청(로그인·가입 등)은
클라이언트 IP 별로 센다. Railway 같은 프록시 뒤에서 실제 IP 를 보려면 uvicorn 을
`--proxy-headers --forwarded-allow-ips=*` 로 띄워야 한다(railway.json 참고).
"""

from __future__ import annotations

import logging
import time

from fastapi import Request
from fastapi.responses import JSONResponse
from slowapi import Limiter
from slowapi.errors import RateLimitExceeded
from slowapi.util import get_remote_address

from app.middleware import _error_envelope
from app.security import decode_token

log = logging.getLogger("app.ratelimit")


def _client_key(request: Request) -> str:
    """인증 요청은 사용자(sub)별, 비인증 요청은 IP별 키."""
    auth = request.headers.get("authorization", "")
    if auth.lower().startswith("bearer "):
        token = auth[7:].strip()
        try:
            sub = decode_token(token).get("sub")
            if sub:
                return f"user:{sub}"
        except Exception:
            # 만료/위조 토큰은 신원으로 못 쓰니 IP 로 폴백한다.
            pass
    return get_remote_address(request)


# headers_enabled=False 로 둔다(중요): True 면 slowapi 데코레이터가 '성공' 응답에도
# 레이트리밋 헤더를 주입하려고 endpoint 의 `response: Response` 파라미터를 찾는데,
# 우리 핸들러들은 그 파라미터가 없어서 매 요청이 예외로 깨진다. 429 의 Retry-After 는
# 아래 핸들러에서 직접 계산해 붙인다.
limiter = Limiter(
    key_func=_client_key,
    default_limits=["120/minute"],
    headers_enabled=False,
)


def _retry_after_seconds(request: Request) -> int:
    """현재 한도 창이 리셋될 때까지 남은 초. 계산 실패 시 60 으로 폴백."""
    try:
        item, args = request.state.view_rate_limit
        reset_at, _remaining = request.app.state.limiter.limiter.get_window_stats(item, *args)
        return max(1, int(reset_at - time.time()))
    except Exception:
        return 60


def rate_limit_handler(request: Request, exc: RateLimitExceeded) -> JSONResponse:
    """429 를 프로젝트 표준 에러 봉투로 변환(+Retry-After).

    동기 함수로 둔다: 라우트별 한도(ExceptionMiddleware 경로)뿐 아니라 전역 기본
    한도(SlowAPIMiddleware 의 동기 경로)에서도 이 핸들러가 직접 호출되어야 동일한
    에러 봉투가 나간다. 핸들러가 async 면 SlowAPIMiddleware 가 slowapi 기본 응답으로
    폴백해 봉투 형식이 깨진다.
    """
    rid = getattr(request.state, "request_id", "")
    body = _error_envelope(
        "RATE_LIMITED",
        "요청이 너무 많습니다. 잠시 후 다시 시도해주세요.",
        None,
        rid,
    )
    return JSONResponse(
        status_code=429,
        content=body,
        headers={"X-Request-ID": rid, "Retry-After": str(_retry_after_seconds(request))},
    )
