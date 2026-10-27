"""Security headers on API responses, the Swagger UI and the interviewer audio."""

from app.services import tts
from tests.test_interviews import invite, setup_interview

API = "/api/v1/talent"


def test_api_json_headers(client, hr):
    res = client.get(f"{API}/jobs", headers=hr)
    assert res.status_code == 200
    h = res.headers
    assert h["X-Content-Type-Options"] == "nosniff"
    assert h["X-Frame-Options"] == "DENY"
    assert h["Referrer-Policy"] == "no-referrer"
    assert h["Permissions-Policy"] == "camera=(self), microphone=(self), geolocation=()"
    assert h["Cross-Origin-Opener-Policy"] == "same-origin"
    assert h["Content-Security-Policy"] == "default-src 'none'; frame-ancestors 'none'"
    assert h["Cache-Control"] == "no-store"
    assert h["Server"] == "XORCA"
    assert "Strict-Transport-Security" not in h


def test_error_responses_get_headers_too(client):
    res = client.get(f"{API}/candidate-interview")  # candidate endpoints still need a valid invitation token
    assert res.status_code == 401
    assert res.headers["Cache-Control"] == "no-store" and res.headers["X-Frame-Options"] == "DENY"


def test_cors_restricted_to_frontend_and_allows_actor_headers(app, client):
    origin = app.config["FRONTEND_URL"]
    pre = client.options(f"{API}/jobs", headers={"Origin": origin, "Access-Control-Request-Method": "POST",
                                                 "Access-Control-Request-Headers": "X-Actor-Name, Content-Type"})
    assert pre.headers["Access-Control-Allow-Origin"] == origin
    assert "x-actor-name" in pre.headers["Access-Control-Allow-Headers"].lower()
    other = client.get(f"{API}/jobs", headers={"Origin": "https://evil.example"})
    assert "Access-Control-Allow-Origin" not in other.headers


def test_hsts_only_over_https_or_when_enabled(app, client, hr):
    res = client.get(f"{API}/jobs", headers=hr, base_url="https://localhost")
    assert res.headers["Strict-Transport-Security"].startswith("max-age=31536000")
    app.config["HSTS_ENABLED"] = True
    try:
        assert "Strict-Transport-Security" in client.get(f"{API}/jobs", headers=hr).headers
    finally:
        app.config["HSTS_ENABLED"] = False


def test_swagger_ui_still_works(client):
    res = client.get(f"{API}/docs")
    assert res.status_code == 200 and b"swagger-ui" in res.data
    csp = res.headers["Content-Security-Policy"]
    assert "script-src 'self' 'unsafe-inline'" in csp and "default-src 'none'" not in csp
    assert "frame-ancestors 'none'" in csp
    assert res.headers.get("Cache-Control") != "no-store"
    spec = client.get(f"{API}/swagger.json")
    assert spec.status_code == 200 and "/settings/data-retention" in spec.json["paths"]
    static = client.get("/swaggerui/swagger-ui-bundle.js")
    assert static.status_code == 200 and "default-src 'none'" not in static.headers["Content-Security-Policy"]
    static.close()


def test_audio_keeps_private_cache(client, hr, job, monkeypatch):
    app_id, tid = setup_interview(client, hr, job)
    _, headers, _ = invite(client, hr, app_id, tid)
    start = client.post(f"{API}/candidate-interview/start", json={"consent": True}, headers=headers)
    assert start.status_code == 200, start.json
    monkeypatch.setattr(tts, "synthesize", lambda text, lang: b"RIFF0000WAVE")
    msg_id = next(m["id"] for m in client.get(f"{API}/candidate-interview", headers=headers).json["messages"]
                  if m["role"] == "assistant")
    res = client.get(f"{API}/candidate-interview/messages/{msg_id}/audio", headers=headers)
    assert res.status_code == 200, res.data[:200]
    assert res.headers["Cache-Control"] == "private, max-age=3600"
    assert res.headers["X-Content-Type-Options"] == "nosniff"
