from __future__ import annotations

from typing import Any


class ApiError(Exception):
    """Error rendered as ``{"error": {"code", "message", "details"}}`` with the given HTTP status."""

    def __init__(self, status: int, code: str, message: str, details: Any = None):
        super().__init__(message)
        self.status = status
        self.code = code
        self.message = message
        self.details = details

    def to_dict(self) -> dict:
        body: dict[str, Any] = {"code": self.code, "message": self.message}
        if self.details is not None:
            body["details"] = self.details
        return {"error": body}


def not_found(entity: str) -> ApiError:
    return ApiError(404, "not_found", f"{entity} not found.")


def bad_request(message: str, details: Any = None, code: str = "validation_error") -> ApiError:
    return ApiError(400, code, message, details)


def forbidden(message: str = "You do not have permission to perform this action.") -> ApiError:
    return ApiError(403, "forbidden", message)


def conflict(message: str, code: str = "conflict", details: Any = None) -> ApiError:
    return ApiError(409, code, message, details)
