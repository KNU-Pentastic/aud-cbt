from typing import Any

from fastapi import HTTPException, status


class APIError(HTTPException):
    """Use this anywhere we want to return the standard ErrorResponse envelope.

    The middleware in app.middleware translates `detail` into the
    `{"error": {code, message, details, request_id}}` shape from openapi.yaml.
    """

    def __init__(
        self,
        *,
        status_code: int,
        code: str,
        message: str,
        details: list[dict[str, Any]] | None = None,
        headers: dict[str, str] | None = None,
    ) -> None:
        super().__init__(
            status_code=status_code,
            detail={"code": code, "message": message, "details": details or []},
            headers=headers,
        )


def unauthorized(message: str = "Unauthorized", code: str = "UNAUTHORIZED") -> APIError:
    return APIError(status_code=status.HTTP_401_UNAUTHORIZED, code=code, message=message)


def forbidden(message: str = "Forbidden", code: str = "FORBIDDEN") -> APIError:
    return APIError(status_code=status.HTTP_403_FORBIDDEN, code=code, message=message)


def not_found(message: str = "Not found", code: str = "NOT_FOUND") -> APIError:
    return APIError(status_code=status.HTTP_404_NOT_FOUND, code=code, message=message)


def conflict(message: str, code: str = "CONFLICT") -> APIError:
    return APIError(status_code=status.HTTP_409_CONFLICT, code=code, message=message)


def gone(message: str, code: str = "GONE") -> APIError:
    return APIError(status_code=status.HTTP_410_GONE, code=code, message=message)


def locked(message: str = "Locked", code: str = "SAFETY_LOCKED") -> APIError:
    return APIError(status_code=status.HTTP_423_LOCKED, code=code, message=message)


def too_many(message: str, code: str = "RATE_LIMITED") -> APIError:
    return APIError(status_code=status.HTTP_429_TOO_MANY_REQUESTS, code=code, message=message)


def upstream_unavailable(
    message: str = "Upstream unavailable",
    code: str = "LLM_UPSTREAM_UNAVAILABLE",
    retry_after: int | None = None,
) -> APIError:
    details = [{"field": "retry_after_seconds", "issue": str(retry_after)}] if retry_after else None
    return APIError(
        status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
        code=code,
        message=message,
        details=details,
    )


def validation_error(message: str, details: list[dict[str, Any]] | None = None) -> APIError:
    return APIError(
        status_code=status.HTTP_400_BAD_REQUEST,
        code="VALIDATION_ERROR",
        message=message,
        details=details,
    )
