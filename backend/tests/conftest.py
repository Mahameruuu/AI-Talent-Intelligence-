import io
import sys
from pathlib import Path

import pytest
from sqlalchemy import text

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

from app import create_app  # noqa: E402
from app.config import TestConfig  # noqa: E402
from app.extensions import db  # noqa: E402
from app.llm.adapter import LLMAdapter, set_llm  # noqa: E402
from scripts.sample_cvs import SAMPLE_CVS, render  # noqa: E402


@pytest.fixture(scope="session")
def app(tmp_path_factory):
    TestConfig.DOCUMENT_STORAGE_DIR = str(tmp_path_factory.mktemp("docs"))
    TestConfig.TTS_CACHE_DIR = str(tmp_path_factory.mktemp("tts"))
    application = create_app(TestConfig)
    with application.app_context():
        db.drop_all()
        db.create_all()
    yield application
    with application.app_context():
        db.session.remove()
        db.drop_all()


@pytest.fixture(autouse=True)
def clean_db(app):
    with app.app_context():
        tables = ", ".join(t.name for t in db.metadata.sorted_tables)
        db.session.execute(text(f"TRUNCATE {tables} RESTART IDENTITY CASCADE"))
        db.session.commit()
        set_llm(LLMAdapter())
        yield
        db.session.remove()
        set_llm(LLMAdapter())


@pytest.fixture()
def client(app):
    return app.test_client()


@pytest.fixture()
def hr():
    """Headers for HR requests. There is no login: the API is open (protected by the central system's gateway)."""
    return {}


def sample_bytes(prefix: str) -> tuple[str, bytes]:
    sample = next(s for s in SAMPLE_CVS if s["file"].startswith(prefix))
    return sample["file"], render(sample)


JOB_PAYLOAD = {
    "title": "Data Scientist",
    "department": "Data & AI",
    "location": "Jakarta",
    "description": "Build machine learning models with Python and SQL; run A/B tests and deploy with Docker.",
    "required_skills": ["Python", "SQL", "Machine Learning", "scikit-learn", "Spark"],
    "preferred_skills": ["PyTorch", "Airflow"],
    "min_experience_years": 3,
    "education_level": "bachelor",
    "education_field": "Statistics",
    "required_certifications": [],
    "status": "open",
}


@pytest.fixture()
def job(client, hr):
    res = client.post("/api/v1/talent/jobs", json=JOB_PAYLOAD, headers=hr)
    assert res.status_code == 201, res.json
    return res.json


def upload(client, headers, job_id, prefix="rina"):
    name, data = sample_bytes(prefix)
    return client.post("/api/v1/talent/candidates/upload", headers=headers,
                       data={"job_id": str(job_id), "file": (io.BytesIO(data), name)},
                       content_type="multipart/form-data")
