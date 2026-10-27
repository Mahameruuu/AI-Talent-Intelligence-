"""Switch an interview template to conversational mode, keeping its approval.

Usage: .venv/bin/python -m scripts.make_template_conversational [template_id] [num_questions] [duration_minutes]
(defaults: 1, 5, 7). Validated with the same rules as the API. Sessions already created keep their own mode.
"""

from __future__ import annotations

import sys

from app import create_app
from app.extensions import db
from app.models import InterviewTemplate
from app.services import audit, interviews, serializers


def main(template_id: int = 1, num_questions: int = 5, duration: int = 7) -> None:
    app = create_app()
    with app.app_context():
        t = db.session.get(InterviewTemplate, template_id)
        if t is None:
            raise SystemExit(f"Template {template_id} not found.")
        data = {**serializers.template(t), "mode": "conversational", "num_questions": num_questions,
                "duration_minutes": duration}
        clean = interviews.validate_template_payload(data)
        for key, value in clean.items():
            setattr(t, key, value)  # status/approval left unchanged on purpose
        audit.record("interview_template.mode_changed", "interview_template", t.id,
                     {"mode": "conversational", "num_questions": num_questions, "duration_minutes": duration},
                     actor_label="script")
        db.session.commit()
        print(f"Template {t.id} '{t.name}' (job {t.job_id}): mode={t.mode}, num_questions={t.num_questions}, "
              f"duration={t.duration_minutes} min, status={t.status}")


if __name__ == "__main__":
    main(*(int(a) for a in sys.argv[1:4]))
