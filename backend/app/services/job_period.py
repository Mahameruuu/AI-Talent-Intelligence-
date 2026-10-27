"""Job application periods, evaluated in the organisation's timezone (default Asia/Jakarta, WIB).

A job accepts applications from ``opens_on opens_time`` until ``closes_on closes_time``:

- ``opens_time`` null → the period opens at 00:00 on ``opens_on``;
- ``closes_time`` null → the period lasts the whole of ``closes_on`` (until 23:59:59, the behaviour before
  times existed); with a time it ends exactly at that minute (at 14:00 means 14:00:00 is already closed).

Functions accept any object with ``opens_on``/``opens_time``/``closes_on``/``closes_time`` attributes (a ``Job`` or a
SQL row selecting those columns).
"""

from __future__ import annotations

from datetime import date, datetime, time, timedelta
from typing import Any
from zoneinfo import ZoneInfo

from flask import current_app

END_OF_DAY = time(23, 59, 59)


def tz() -> ZoneInfo:
    return ZoneInfo(current_app.config["TIMEZONE"])


def now_local() -> datetime:
    return datetime.now(tz())


def today() -> date:
    return now_local().date()


def opens_at(job: Any) -> datetime | None:
    """The moment applications open (None without ``opens_on``)."""
    if job.opens_on is None:
        return None
    return datetime.combine(job.opens_on, job.opens_time or time.min, tzinfo=tz())


def closes_at(job: Any) -> datetime | None:
    """The displayed closing moment: ``closes_on closes_time``, or 23:59:59 that day without a time."""
    if job.closes_on is None:
        return None
    return datetime.combine(job.closes_on, job.closes_time or END_OF_DAY, tzinfo=tz())


def deadline(job: Any) -> datetime | None:
    """The first moment applications are no longer accepted (exclusive end of the period).

    Without ``closes_time`` this is 00:00 the day after ``closes_on``, so the whole closing day is open."""
    if job.closes_on is None:
        return None
    if job.closes_time is None:
        return datetime.combine(job.closes_on + timedelta(days=1), time.min, tzinfo=tz())
    return datetime.combine(job.closes_on, job.closes_time, tzinfo=tz())


def has_closed(job: Any, now: datetime | None = None) -> bool:
    end = deadline(job)
    return end is not None and (now or now_local()) >= end


def window(job: Any, now: datetime | None = None) -> str | None:
    """'upcoming' (before the opening moment), 'open' (within the period), 'ended' (from the closing moment on),
    or None (no dates)."""
    if job.opens_on is None and job.closes_on is None:
        return None
    now = now or now_local()
    start = opens_at(job)
    if start is not None and now < start:
        return "upcoming"
    if has_closed(job, now):
        return "ended"
    return "open"


def days_left(job: Any, now: datetime | None = None) -> int | None:
    """Calendar days until the closing day (0 = closes today); None without a deadline or once it has passed."""
    if job.closes_on is None:
        return None
    now = now or now_local()
    if has_closed(job, now):
        return None
    return (job.closes_on - now.astimezone(tz()).date()).days


def hhmm(value: time | None) -> str | None:
    return value.strftime("%H:%M") if value is not None else None


def iso(value: datetime | None) -> str | None:
    return value.isoformat() if value is not None else None
