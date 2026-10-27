from __future__ import annotations

from typing import Any, TypeVar

from flask import request
from flask_restx import reqparse
from pydantic import BaseModel, ValidationError

from ..errors import bad_request, not_found
from ..models import Application, Candidate

M = TypeVar("M", bound=BaseModel)



def ensure_application(application: Application | None) -> Application:
    if application is None:
        raise not_found("Application")
    return application


def ensure_candidate(candidate: Candidate | None) -> Candidate:
    if candidate is None:
        raise not_found("Candidate")
    return candidate


def parse_body(model: type[M], partial: bool = False) -> M:
    data = request.get_json(silent=True)
    if not isinstance(data, dict):
        raise bad_request("Request body must be a JSON object.")
    try:
        return model.model_validate(data)
    except ValidationError as exc:
        details = [{"field": ".".join(str(p) for p in e["loc"]), "message": e["msg"]} for e in exc.errors()]
        raise bad_request("Invalid request body.", details) from exc


def pagination_args() -> tuple[int, int]:
    try:
        page = max(1, int(request.args.get("page", 1)))
        size = max(1, min(100, int(request.args.get("page_size", 20))))
    except ValueError as exc:
        raise bad_request("page and page_size must be integers.") from exc
    return page, size


def paginate(query, serializer, page: int, size: int) -> dict[str, Any]:
    total = query.order_by(None).count()
    items = query.offset((page - 1) * size).limit(size).all()
    return {"items": [serializer(i) for i in items], "total": total, "page": page, "page_size": size}


def int_arg(name: str) -> int | None:
    value = request.args.get(name)
    if value in (None, ""):
        return None
    try:
        return int(value)
    except ValueError as exc:
        raise bad_request(f"Query parameter '{name}' must be an integer.") from exc


def float_arg(name: str) -> float | None:
    value = request.args.get(name)
    if value in (None, ""):
        return None
    try:
        return float(value)
    except ValueError as exc:
        raise bad_request(f"Query parameter '{name}' must be a number.") from exc


def page_parser() -> reqparse.RequestParser:
    parser = reqparse.RequestParser()
    parser.add_argument("page", type=int, location="args", default=1, help="1-based page number")
    parser.add_argument("page_size", type=int, location="args", default=20, help="Items per page (max 100)")
    return parser
