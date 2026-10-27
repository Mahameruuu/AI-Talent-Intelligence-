"""Screening/matching logic (pure functions)."""

from app.nlp.matching import screen


def skill(name, original=None, in_taxonomy=True):
    return {"original": original or name, "normalized": name, "category": None, "in_taxonomy": in_taxonomy,
            "method": "dictionary", "evidence": [{"text": f"- {original or name}", "section": "skills", "line": 3}]}


JOB = {
    "title": "Data Engineer",
    "description": "Build pipelines with SQL and Spark.",
    "required_skills": ["Python", "SQL", "Spark"],
    "preferred_skills": [],
    "min_experience_years": 2,
    "education_level": None,
    "education_field": None,
    "required_certifications": [],
    "weights": {},
}


def profile(**kw):
    base = {"skills": [skill("Python"), skill("PostgreSQL", "Postgre SQL")], "experience": [], "education": [],
            "certifications": [], "total_experience_months": 36, "experience_calculation_note": "Calculated."}
    base.update(kw)
    return base


def by_key(result):
    return {r["key"]: r for r in result["requirements"]}


def test_statuses_and_explanations():
    result = screen(JOB, profile(), "Python\nPostgre SQL", [])
    reqs = by_key(result)
    assert reqs["required_skill:python"]["status"] == "matched"
    # SQL is not listed, but PostgreSQL is a related skill -> needs review, never auto-matched.
    assert reqs["required_skill:sql"]["status"] == "needs_review"
    assert reqs["required_skill:sql"]["matched_by"] == "related"
    assert reqs["required_skill:apache-spark"]["status"] == "not_found"
    assert reqs["required_skill:apache-spark"]["evidence"] == []
    assert any(f["code"] == "missing_required_skills" for f in result["flags"])


def test_unknown_experience_is_excluded_not_guessed():
    result = screen(JOB, profile(total_experience_months=None), "Python", [])
    comp = {c["component"]: c for c in result["components"]}
    assert comp["experience"]["score"] is None and comp["experience"]["effective_weight"] == 0
    assert by_key(result)["experience:min-years"]["status"] == "needs_review"
    active = [c for c in result["components"] if c["score"] is not None]
    assert round(sum(c["effective_weight"] for c in active)) == 100


def test_experience_below_minimum():
    result = screen(JOB, profile(total_experience_months=12), "Python", [])
    req = by_key(result)["experience:min-years"]
    assert req["status"] == "not_found" and "below" in req["explanation"]


def test_hr_added_skill_counts_with_explanation():
    p = profile()
    p["skills"].append({**skill("Apache Spark"), "evidence": [], "source": "hr"})
    req = by_key(screen(JOB, p, "Python", []))["required_skill:apache-spark"]
    assert req["status"] == "matched" and req["explanation"] == "Added by HR correction."


def test_weights_are_configurable():
    job = {**JOB, "weights": {"required_skills": 100, "preferred_skills": 0, "experience": 0, "education": 0,
                              "certifications": 0, "semantic": 0}}
    result = screen(job, profile(), "Python", [])
    # 1 matched + 1 needs review (half) of 3
    assert result["overall_score"] == 50.0


def test_education_field_synonyms():
    job = {**JOB, "education_level": "bachelor", "education_field": "Statistics"}
    edu = [{"level": "bachelor", "degree": "S1", "field": "Statistika", "institution": "Universitas Indonesia",
            "start_year": 2014, "end_year": 2018, "gpa": None, "evidence": []}]
    req = by_key(screen(job, profile(education=edu), "x", []))["education:level"]
    assert req["status"] == "matched"
