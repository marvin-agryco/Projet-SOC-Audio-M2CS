"""Tests for the alert_rule_id filter on GET /api/incidents."""
import uuid
import pytest
from app import db
from app.models import Incident, IncidentStatus, IncidentSeverity


def make_incident(alert_rule_id=None, title="Test Incident"):
    return Incident(
        id=uuid.uuid4(),
        title=title,
        status=IncidentStatus.NEW,
        severity=IncidentSeverity.HIGH,
        alert_rule_id=uuid.UUID(str(alert_rule_id)) if alert_rule_id else None,
    )


def test_alert_rule_id_filter_returns_matching(client, app):
    """Only incidents with the matching alert_rule_id are returned."""
    rule_id = uuid.uuid4()
    other_id = uuid.uuid4()

    with app.app_context():
        i1 = make_incident(alert_rule_id=rule_id, title="Match 1")
        i2 = make_incident(alert_rule_id=rule_id, title="Match 2")
        i3 = make_incident(alert_rule_id=other_id, title="No match")
        db.session.add_all([i1, i2, i3])
        db.session.commit()

    resp = client.get(f"/api/incidents?alert_rule_id={rule_id}")
    assert resp.status_code == 200
    data = resp.get_json()
    titles = {i["title"] for i in data["incidents"]}
    assert titles == {"Match 1", "Match 2"}
    assert "No match" not in titles


def test_alert_rule_id_filter_unknown_returns_empty(client, app):
    """An unknown alert_rule_id returns an empty list, not a 404."""
    with app.app_context():
        i = make_incident(title="Unrelated")
        db.session.add(i)
        db.session.commit()

    resp = client.get(f"/api/incidents?alert_rule_id={uuid.uuid4()}")
    assert resp.status_code == 200
    data = resp.get_json()
    assert data["incidents"] == []
    assert data["total"] == 0
