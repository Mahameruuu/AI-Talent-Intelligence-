from __future__ import annotations

from flask import request
from flask_restx import Namespace, Resource, fields

from ..errors import bad_request
from ..security import current_actor, hr_endpoint
from ..services import retention, scoring_settings
from . import schemas as s

ns = Namespace("Settings", description="Organisation-wide settings (scoring weights, data retention)", path="/", decorators=[hr_endpoint])

WeightRow = ns.model("ScoringWeightRow", {
    "no": fields.Integer(example=1),
    "key": fields.String(example="required_skills"),
    "label": fields.String(example="Skill wajib"),
    "description": fields.String(example="Skill wajib lowongan yang ditemukan di CV"),
    "weight": fields.Float(example=40),
})
WeightSettings = ns.model("ScoringWeightSettings", {
    "items": fields.List(fields.Nested(WeightRow)),
    "total": fields.Float(example=100),
    "is_default": fields.Boolean(example=True, description="True until HR saves custom weights"),
    "updated_at": fields.DateTime(),
    "updated_by": fields.String(example="Rani Recruiter"),
    "affected_applications": fields.Integer(example=34, description="Applications of open jobs re-scored on change"),
    "rescreen_queued": fields.Integer(example=34, description="Only in the PUT response"),
})
WeightInput = ns.model("ScoringWeightInput", {
    "weights": fields.Raw(required=True, example={"required_skills": 45, "preferred_skills": 15, "experience": 25,
                                                  "education": 10, "certifications": 5, "semantic": 0}),
})


@ns.route("/settings/scoring-weights")
class ScoringWeights(Resource):
    @ns.response(200, "Current weights (percentages, total 100)", WeightSettings)
    def get(self):
        """Scoring weights used for every job's CV screening."""
        return scoring_settings.describe()

    @ns.expect(WeightInput)
    @ns.response(200, "Saved; applications of open jobs are re-scored in the background", WeightSettings)
    @ns.response(400, "Invalid values or total is not 100%", s.Error)
    def put(self):
        """Update the organisation-wide weights (must total 100%). Open jobs' applications are re-screened so
        all candidates of a job are ranked with the same weights; earlier results remain in history."""
        data = request.get_json(silent=True)
        if not isinstance(data, dict):
            raise bad_request("Request body must be a JSON object.")
        return scoring_settings.save(data.get("weights"), current_actor())


RetentionPreview = ns.model("DataRetentionPreview", {
    "eligible_applications": fields.Integer(example=12, description="Applications that would be deleted now"),
    "eligible_candidates": fields.Integer(example=9, description="Candidates removed completely (no other applications)"),
    "next_run_at": fields.String(example="2026-10-28T02:00:00+07:00",
                                 description="Next automatic run (local time); null when disabled"),
})
RetentionSettings = ns.model("DataRetentionSettings", {
    "enabled": fields.Boolean(example=False, description="Automatically delete applicant data"),
    "months_after_close": fields.Integer(example=12, min=1, max=36),
    "keep_hired": fields.Boolean(example=True, description="Keep data of hired candidates"),
    "is_default": fields.Boolean(example=True),
    "updated_at": fields.DateTime(),
    "updated_by": fields.String(example="Ari Admin"),
    "last_run_at": fields.String(example="2026-10-27T19:00:02+00:00"),
    "last_run_result": fields.Raw(example={"applications": 3, "candidates": 2, "documents": 3,
                                           "interview_sessions": 1}),
    "preview": fields.Nested(RetentionPreview),
})
RetentionInput = ns.model("DataRetentionInput", {
    "enabled": fields.Boolean(example=True),
    "months_after_close": fields.Integer(example=12, min=1, max=36),
    "keep_hired": fields.Boolean(example=True),
})
RetentionRunResult = ns.model("DataRetentionRunResult", {
    "trigger": fields.String(example="manual"),
    "months_after_close": fields.Integer(example=12),
    "keep_hired": fields.Boolean(example=True),
    "applications": fields.Integer(example=3),
    "candidates": fields.Integer(example=2),
    "documents": fields.Integer(example=3),
    "interview_sessions": fields.Integer(example=1),
})


@ns.route("/settings/data-retention")
class DataRetention(Resource):
    @ns.response(200, "Current retention rules and what they would delete now", RetentionSettings)
    def get(self):
        """Data retention: applicant data is deleted automatically N months after the job closes (when enabled).
        An application is eligible when its job closed more than N months ago, it is not hired (if hired data is
        kept) and it has no AI interview in progress. Candidates are removed once no applications remain."""
        return retention.describe()

    @ns.expect(RetentionInput)
    @ns.response(200, "Saved", RetentionSettings)
    @ns.response(400, "Invalid values", s.Error)
    def put(self):
        """Update the retention rules. Partial updates are allowed."""
        return retention.save(request.get_json(silent=True), current_actor())


@ns.route("/settings/data-retention/run")
class DataRetentionRun(Resource):
    @ns.response(200, "Deleted counts (no personal data)", RetentionRunResult)
    @ns.response(409, "Automatic deletion is turned off", s.Error)
    def post(self):
        """Apply the retention rules now — permanently deletes eligible applicant data with the same
        cascade as a manual delete. Recorded in the audit log as `data_retention.run` with counts only."""
        return retention.run(trigger="manual")
