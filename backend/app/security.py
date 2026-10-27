"""Actor attribution for HR requests and candidate interview tokens.

There is **no authentication** of HR users in this service: login, passwords and roles are handled by the central
system, and this API must only be reachable through it (private network / central API gateway).

The central system may send ``X-Actor-Name`` (and optionally ``X-Actor-Id``, free text, max 255 characters) with
HR requests. These headers are used **only for attribution** (audit log, stage history, decisions, reviews, settings,
template approval, evaluation review) and are never trusted for authorization. Without them the built-in actor
"HR" is used. Actors are stored in ``ti_users`` (kept as the actors table so existing history keeps its references).
"""

from __future__ import annotations

import hashlib
import re
import secrets
from functools import wraps

from flask import has_request_context, request
from sqlalchemy.exc import IntegrityError

from .extensions import db
from .models import Actor

ACTOR_NAME_HEADER = "X-Actor-Name"
ACTOR_ID_HEADER = "X-Actor-Id"
DEFAULT_ACTOR_NAME = "HR"
MAX_ACTOR_LENGTH = 255
_CONTROL_CHARS = re.compile(r"[\x00-\x1f\x7f]")
# Per-request state lives in the WSGI environ (not ``g``, which can outlive a request when an app context is reused).
_HR_FLAG = "xorca.hr_request"
_ACTOR_KEY = "xorca.actor"


def hr_endpoint(fn):
    """Mark the request as an HR request so audit entries are attributed to the request's actor.

    It does not require or check anything (there is no authentication in this service).
    """

    @wraps(fn)
    def wrapper(*args, **kwargs):
        request.environ[_HR_FLAG] = True
        return fn(*args, **kwargs)

    return wrapper


def _header(name: str) -> str | None:
    raw = request.headers.get(name)
    if raw is None:
        return None
    try:  # WSGI decodes headers as latin-1; recover UTF-8 names (e.g. "Dédé").
        raw = raw.encode("latin-1").decode("utf-8")
    except (UnicodeEncodeError, UnicodeDecodeError):
        pass
    value = " ".join(_CONTROL_CHARS.sub(" ", raw).split())[:MAX_ACTOR_LENGTH]
    return value or None


def find_or_create_actor(external_id: str | None, name: str) -> Actor:
    def lookup() -> Actor | None:
        if external_id:
            return Actor.query.filter_by(external_id=external_id).first()
        return Actor.query.filter(Actor.external_id.is_(None), Actor.full_name == name).order_by(Actor.id).first()

    actor = lookup()
    if actor is None:
        try:
            with db.session.begin_nested():
                actor = Actor(full_name=name, external_id=external_id)
                db.session.add(actor)
        except IntegrityError:  # created concurrently by another request
            actor = lookup()
            if actor is None:
                raise
    elif external_id and actor.full_name != name:
        actor.full_name = name  # the central system renamed the person
    return actor


def current_actor() -> Actor:
    """The actor for this HR request (found or created from the attribution headers; default "HR")."""
    actor = request.environ.get(_ACTOR_KEY)
    if actor is None:
        external_id = _header(ACTOR_ID_HEADER)
        name = _header(ACTOR_NAME_HEADER) or external_id or DEFAULT_ACTOR_NAME
        actor = find_or_create_actor(external_id, name)
        request.environ[_ACTOR_KEY] = actor
    return actor


def request_actor() -> Actor | None:
    """The actor when called inside an HR request, else None (candidate endpoints, background jobs, CLI)."""
    if has_request_context() and request.environ.get(_HR_FLAG):
        return current_actor()
    return None


# ---------------------------------------------------------------- interview invitation tokens


def new_invitation_token() -> tuple[str, str]:
    """Return (raw_token, sha256_hex). Only the hash is persisted."""
    raw = secrets.token_urlsafe(32)
    return raw, hash_token(raw)


def hash_token(raw: str) -> str:
    return hashlib.sha256(raw.encode()).hexdigest()
