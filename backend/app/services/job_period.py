"""Job application periods: a job accepts applications from ``opens_on`` through ``closes_on`` (inclusive),
evaluated in the organisation's timezone (default Asia/Jakarta), so a deadline lasts until 23:59 local time."""

from __future__ import annotations

from datetime import date, datetime
from zoneinfo import ZoneInfo

from flask import current_app

from ..models import Job


def today() -> date:
    return datetime.now(ZoneInfo(current_app.config["TIMEZONE"])).date()


def window(job: Job) -> str | None:
    """'upcoming' (before opens_on), 'open' (within the period), 'ended' (after closes_on), or None (no dates)."""
    if job.opens_on is None and job.closes_on is None:
        return None
    current = today()
    if job.opens_on and current < job.opens_on:
        return "upcoming"
    if job.closes_on and current > job.closes_on:
        return "ended"
    return "open"


def days_left(job: Job) -> int | None:
    """Days until the deadline (0 = closes today); None without a deadline or once it has passed."""
    if job.closes_on is None:
        return None
    remaining = (job.closes_on - today()).days
    return remaining if remaining >= 0 else None
