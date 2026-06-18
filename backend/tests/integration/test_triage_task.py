"""Integration tests for triage task and API routes.

All external calls (Ollama, VT, AbuseIPDB) are mocked via unittest.mock.
The Celery task is called synchronously (no broker needed).
Task-level tests patch `app.tasks_triage.app` to redirect DB calls to the
test SQLite instance (the task uses a module-level create_app() otherwise).
"""

import json
import uuid
import pytest
from unittest.mock import patch, MagicMock

from app import db
from app.models.incident import Incident, IncidentSeverity
from app.models.triage import TriageBrief, TriageBriefStatus


# ── Fixtures ──────────────────────────────────────────────────────────────────

@pytest.fixture
def incident(app):
    with app.app_context():
        inc = Incident(title="Test Incident", severity=IncidentSeverity.HIGH)
        db.session.add(inc)
        db.session.commit()
        yield inc


def _good_llm_response():
    return json.dumps({
        "threat_hypothesis":  "Brute force attack detected",
        "confidence":         78,
        "mitre_tactics":      ["T1110"],
        "recommended_action": "Block source IP",
    })


# ── POST /incidents ───────────────────────────────────────────────────────────

def test_post_incidents_creates_incident_and_fires_task(client):
    with patch("app.tasks_triage.run_triage") as mock_task:
        mock_task.delay = MagicMock()
        resp = client.post(
            "/api/incidents",
            json={"title": "Brute force on GLPI", "severity": "high"},
            content_type="application/json",
        )
    assert resp.status_code == 201
    data = resp.get_json()
    assert data["title"] == "Brute force on GLPI"
    assert data["severity"] == "high"
    mock_task.delay.assert_called_once()


def test_post_incidents_missing_title_400(client):
    resp = client.post(
        "/api/incidents",
        json={"severity": "high"},
        content_type="application/json",
    )
    assert resp.status_code == 400
    assert "title" in resp.get_json()["error"].lower()


def test_post_incidents_invalid_severity_400(client):
    resp = client.post(
        "/api/incidents",
        json={"title": "Test", "severity": "supercritical"},
        content_type="application/json",
    )
    assert resp.status_code == 400


# ── run_triage task ───────────────────────────────────────────────────────────
# Each task test patches `app.tasks_triage.app` to use the test SQLite app
# instead of the module-level PostgreSQL app created at import time.

def test_run_triage_happy_path(app, incident):
    with app.app_context():
        brief = TriageBrief(incident_id=incident.id)
        db.session.add(brief)
        db.session.commit()
        brief_id = brief.id
        incident_id = str(incident.id)

    with patch("app.tasks_triage.app", new=app), \
         patch("app.tasks_triage._call_ollama_with_retry", return_value=_good_llm_response()), \
         patch("app.tasks_triage.enrich_ips", return_value={}), \
         patch("app.tasks_triage.socketio") as mock_socketio:

        from app.tasks_triage import run_triage
        run_triage(incident_id)

    with app.app_context():
        updated = TriageBrief.query.get(brief_id)
        assert updated.status == TriageBriefStatus.READY
        assert updated.confidence == 78
        assert updated.mitre_tactics == ["T1110"]
        assert updated.generation_seconds is not None

    mock_socketio.emit.assert_called_once_with(
        "triage_update",
        {"incident_id": incident_id, "brief_id": str(brief_id), "status": "ready"},
    )


def test_run_triage_ollama_down_sets_failed(app, incident):
    with app.app_context():
        brief = TriageBrief(incident_id=incident.id)
        db.session.add(brief)
        db.session.commit()
        brief_id = brief.id
        incident_id = str(incident.id)

    import requests as req_lib
    with patch("app.tasks_triage.app", new=app), \
         patch("app.tasks_triage._call_ollama_with_retry",
               side_effect=req_lib.exceptions.ConnectionError("refused")), \
         patch("app.tasks_triage.enrich_ips", return_value={}), \
         patch("app.tasks_triage.socketio") as mock_socketio:

        from app.tasks_triage import run_triage
        run_triage(incident_id)

    with app.app_context():
        updated = TriageBrief.query.get(brief_id)
        assert updated.status == TriageBriefStatus.FAILED
        assert updated.error_message is not None

    mock_socketio.emit.assert_called_once_with(
        "triage_update",
        {"incident_id": incident_id, "brief_id": str(brief_id), "status": "failed"},
    )


def test_run_triage_incident_deleted_returns_early(app):
    """Brief exists but incident doesn't → task sets FAILED ('Incident not found')."""
    with app.app_context():
        fake_uuid = uuid.uuid4()  # UUID object so bind processor can call .hex
        brief = TriageBrief(incident_id=fake_uuid)
        db.session.add(brief)
        db.session.commit()
        brief_id = brief.id

    with patch("app.tasks_triage.app", new=app), \
         patch("app.tasks_triage.socketio"):
        from app.tasks_triage import run_triage
        run_triage(str(fake_uuid))

    with app.app_context():
        updated = TriageBrief.query.get(brief_id)
        assert updated.status == TriageBriefStatus.FAILED
        assert "not found" in (updated.error_message or "").lower()


def test_run_triage_llm_retry_success(app, incident):
    """First JSON parse fails; retry with strict prompt succeeds."""
    with app.app_context():
        brief = TriageBrief(incident_id=incident.id)
        db.session.add(brief)
        db.session.commit()
        brief_id = brief.id
        incident_id = str(incident.id)

    call_count = {"n": 0}
    def fake_ollama(*args, **kwargs):
        call_count["n"] += 1
        if call_count["n"] == 1:
            return "this is not json"
        return _good_llm_response()

    with patch("app.tasks_triage.app", new=app), \
         patch("app.tasks_triage._call_ollama_with_retry", side_effect=fake_ollama), \
         patch("app.tasks_triage.enrich_ips", return_value={}), \
         patch("app.tasks_triage.socketio"):

        from app.tasks_triage import run_triage
        run_triage(incident_id)

    with app.app_context():
        updated = TriageBrief.query.get(brief_id)
        assert updated.status == TriageBriefStatus.READY
    assert call_count["n"] == 2


def test_run_triage_llm_both_attempts_fail_sets_failed(app, incident):
    with app.app_context():
        brief = TriageBrief(incident_id=incident.id)
        db.session.add(brief)
        db.session.commit()
        brief_id = brief.id
        incident_id = str(incident.id)

    with patch("app.tasks_triage.app", new=app), \
         patch("app.tasks_triage._call_ollama_with_retry", return_value="not json"), \
         patch("app.tasks_triage.enrich_ips", return_value={}), \
         patch("app.tasks_triage.socketio"):

        from app.tasks_triage import run_triage
        run_triage(incident_id)

    with app.app_context():
        updated = TriageBrief.query.get(brief_id)
        assert updated.status == TriageBriefStatus.FAILED


def test_run_triage_vt_429_partial_enrichment_succeeds(app, incident):
    """VT returns 429 → skip, AbuseIPDB ok → brief still generated."""
    with app.app_context():
        brief = TriageBrief(incident_id=incident.id)
        db.session.add(brief)
        db.session.commit()
        incident_id = str(incident.id)
        brief_id = brief.id

    with patch("app.tasks_triage.app", new=app), \
         patch("app.tasks_triage._call_ollama_with_retry", return_value=_good_llm_response()), \
         patch("app.tasks_triage.enrich_ips", return_value={"1.2.3.4": {"abuseipdb": {"score": 0}}}), \
         patch("app.tasks_triage.socketio"):

        from app.tasks_triage import run_triage
        run_triage(incident_id)

    with app.app_context():
        updated = TriageBrief.query.get(brief_id)
        assert updated.status == TriageBriefStatus.READY


def test_run_triage_zero_events_generates_anyway(app, incident):
    """Incident with no events → brief still generated (empty events_summary)."""
    with app.app_context():
        brief = TriageBrief(incident_id=incident.id)
        db.session.add(brief)
        db.session.commit()
        incident_id = str(incident.id)
        brief_id = brief.id

    with patch("app.tasks_triage.app", new=app), \
         patch("app.tasks_triage._call_ollama_with_retry", return_value=_good_llm_response()), \
         patch("app.tasks_triage.enrich_ips", return_value={}), \
         patch("app.tasks_triage.socketio"):

        from app.tasks_triage import run_triage
        run_triage(incident_id)

    with app.app_context():
        updated = TriageBrief.query.get(brief_id)
        assert updated.status == TriageBriefStatus.READY


# ── PATCH /triage-briefs ──────────────────────────────────────────────────────

def test_patch_triage_brief_accept(client, app, incident):
    with app.app_context():
        b = TriageBrief(
            incident_id=incident.id,
            status=TriageBriefStatus.READY,
            threat_hypothesis="Test",
            confidence=75,
        )
        db.session.add(b)
        db.session.commit()
        brief_id = str(b.id)

    resp = client.patch(
        f"/api/triage-briefs/{brief_id}",
        json={"action": "accept", "analyst": "testadmin"},
        content_type="application/json",
    )
    assert resp.status_code == 200
    data = resp.get_json()
    assert data["status"] == "accepted"
    assert data["analyst_action"] == "accept"
    assert data["reviewed_by"] == "testadmin"


def test_patch_triage_brief_edit_saves_notes(client, app, incident):
    with app.app_context():
        b = TriageBrief(incident_id=incident.id, status=TriageBriefStatus.READY)
        db.session.add(b)
        db.session.commit()
        brief_id = str(b.id)

    resp = client.patch(
        f"/api/triage-briefs/{brief_id}",
        json={"action": "edit", "notes": "Confirmed malicious actor"},
        content_type="application/json",
    )
    assert resp.status_code == 200
    data = resp.get_json()
    assert data["status"] == "edited"
    assert data["analyst_notes"] == "Confirmed malicious actor"


def test_patch_triage_brief_dismiss(client, app, incident):
    with app.app_context():
        b = TriageBrief(incident_id=incident.id, status=TriageBriefStatus.READY)
        db.session.add(b)
        db.session.commit()
        brief_id = str(b.id)

    resp = client.patch(
        f"/api/triage-briefs/{brief_id}",
        json={"action": "dismiss"},
        content_type="application/json",
    )
    assert resp.status_code == 200
    assert resp.get_json()["status"] == "dismissed"


def test_patch_triage_brief_wrong_state_400(client, app, incident):
    with app.app_context():
        b = TriageBrief(incident_id=incident.id, status=TriageBriefStatus.GENERATING)
        db.session.add(b)
        db.session.commit()
        brief_id = str(b.id)

    resp = client.patch(
        f"/api/triage-briefs/{brief_id}",
        json={"action": "accept"},
        content_type="application/json",
    )
    assert resp.status_code == 400


# ── POST /incidents/:id/retriage ──────────────────────────────────────────────

def test_post_retriage_creates_new_brief(client, app, incident):
    with patch("app.tasks_triage.run_triage") as mock_task:
        mock_task.delay = MagicMock()
        resp = client.post(
            f"/api/incidents/{incident.id}/retriage",
            content_type="application/json",
        )
    assert resp.status_code == 201
    data = resp.get_json()
    assert data["status"] == "pending"
    mock_task.delay.assert_called_once()


def test_post_retriage_blocked_if_already_generating_409(client, app, incident):
    with app.app_context():
        b = TriageBrief(incident_id=incident.id, status=TriageBriefStatus.GENERATING)
        db.session.add(b)
        db.session.commit()

    resp = client.post(
        f"/api/incidents/{incident.id}/retriage",
        content_type="application/json",
    )
    assert resp.status_code == 409
    assert "in progress" in resp.get_json()["error"].lower()


# ── GET /triage-briefs ────────────────────────────────────────────────────────

def test_get_triage_brief_by_incident_id(client, app, incident):
    with app.app_context():
        b = TriageBrief(incident_id=incident.id, status=TriageBriefStatus.READY)
        db.session.add(b)
        db.session.commit()

    resp = client.get(f"/api/triage-briefs?incident_id={incident.id}")
    assert resp.status_code == 200
    data = resp.get_json()
    assert data is not None
    assert data["status"] == "ready"


def test_get_triage_brief_no_brief_returns_null(client, app, incident):
    resp = client.get(f"/api/triage-briefs?incident_id={incident.id}")
    assert resp.status_code == 200
    assert resp.get_json() is None


def test_get_triage_brief_missing_param_400(client):
    resp = client.get("/api/triage-briefs")
    assert resp.status_code == 400
