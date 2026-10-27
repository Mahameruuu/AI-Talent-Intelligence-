from __future__ import annotations

from typing import Any

from ..extensions import db
from ..models import AuditLog
from ..security import request_actor


def record(action: str, entity_type: str, entity_id: int | None, details: dict[str, Any] | None = None,
           actor_label: str | None = None) -> None:
    """Add an audit entry to the current session (committed with the caller's transaction).

    Inside an HR request the entry is attributed to the request's actor (``X-Actor-Name`` header, default "HR";
    attribution only, never authorization). Never put CV text, tokens or other secrets in ``details``.
    """
    actor = request_actor()
    db.session.add(AuditLog(
        actor_id=actor.id if actor else None,
        actor_label=actor_label or (actor.full_name if actor else "system"),
        action=action,
        entity_type=entity_type,
        entity_id=entity_id,
        details=details or {},
    ))
