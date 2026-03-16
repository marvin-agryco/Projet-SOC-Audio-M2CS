"""Integration tests for POST /api/events/:id/explain."""

import uuid
import pytest
from unittest.mock import patch, MagicMock

from app import db
from app.models.event import Event, EventStatus, EventSeverity, EventSource


# ── Fixtures ──────────────────────────────────────────────────────────────────

@pytest.fixture
def event_with_raw_log(app):
    with app.app_context():
        e = Event(
            source=EventSource.FIREWALL,
            event_type='port_scan',
            severity=EventSeverity.HIGH,
            description='Port scan detected',
            raw_log='IN=eth0 SRC=185.220.101.45 DST=10.0.0.5 PROTO=TCP DPT=22 SYN',
            status=EventStatus.NEW,
            metadata={},
        )
        db.session.add(e)
        db.session.commit()
        yield e


@pytest.fixture
def event_no_log(app):
    with app.app_context():
        e = Event(
            source=EventSource.ENDPOINT,
            event_type='auth_failure',
            severity=EventSeverity.MEDIUM,
            description='',
            raw_log=None,
            status=EventStatus.NEW,
            metadata={},
        )
        db.session.add(e)
        db.session.commit()
        yield e


def _mock_ollama(text='This is a port scan.'):
    mock = MagicMock()
    mock.json.return_value = {'message': {'content': text}}
    mock.raise_for_status = MagicMock()
    return mock


# ── Tests ──────────────────────────────────────────────────────────────────────

def test_explain_endpoint_returns_explanation(client, app, event_with_raw_log):
    with app.app_context():
        event_id = str(event_with_raw_log.id)
    with patch('app.routes.events.req.post', return_value=_mock_ollama('An SSH connection attempt.')):
        resp = client.post(f'/api/events/{event_id}/explain')
    assert resp.status_code == 200
    data = resp.get_json()
    assert 'explanation' in data
    assert data['explanation'] == 'An SSH connection attempt.'


def test_explain_endpoint_404_for_missing_event(client):
    resp = client.post(f'/api/events/{uuid.uuid4()}/explain')
    assert resp.status_code == 404


def test_explain_endpoint_400_when_no_log_content(client, app, event_no_log):
    with app.app_context():
        event_id = str(event_no_log.id)
    resp = client.post(f'/api/events/{event_id}/explain')
    assert resp.status_code == 400
    assert 'error' in resp.get_json()


def test_explain_endpoint_503_when_ollama_down(client, app, event_with_raw_log):
    import requests as req_lib
    with app.app_context():
        event_id = str(event_with_raw_log.id)
    with patch('app.routes.events.req.post', side_effect=req_lib.exceptions.ConnectionError('refused')):
        resp = client.post(f'/api/events/{event_id}/explain')
    assert resp.status_code == 503
    assert 'unavailable' in resp.get_json()['error'].lower()


def test_explain_endpoint_504_on_timeout(client, app, event_with_raw_log):
    import requests as req_lib
    with app.app_context():
        event_id = str(event_with_raw_log.id)
    with patch('app.routes.events.req.post', side_effect=req_lib.exceptions.Timeout()):
        resp = client.post(f'/api/events/{event_id}/explain')
    assert resp.status_code == 504
    assert 'timed out' in resp.get_json()['error'].lower()
