import pytest
from datetime import datetime, timedelta
from app.models import Event, EventSeverity, EventSource, EventStatus, AlertRule
from app.services.alert_engine import AlertEngine


def test_parse_timeframe():
    engine = AlertEngine()

    assert engine.parse_timeframe("10s") == timedelta(seconds=10)
    assert engine.parse_timeframe("5m") == timedelta(minutes=5)
    assert engine.parse_timeframe("1h") == timedelta(hours=1)
    assert engine.parse_timeframe("2d") == timedelta(days=2)
    assert engine.parse_timeframe("invalid") is None


def test_evaluate_rule_threshold(app, init_database):
    """Test evaluating a rule based on event count threshold."""
    with app.app_context():
        # Setup data
        engine = AlertEngine()

        # Create a rule: trigger if 3+ auth_failure events in last 10m
        rule = AlertRule(
            name="Multiple Auth Failures",
            condition={"event_type": "auth_failure", "count": 3, "timeframe": "10m"},
        )
        init_database.session.add(rule)

        # Initially false (0 events)
        assert engine.evaluate_rule(rule) is False

        # Add 1 event (below threshold)
        ev1 = Event(
            source=EventSource.FIREWALL,
            event_type="auth_failure",
            severity=EventSeverity.LOW,
            description="Failed login",
        )
        init_database.session.add(ev1)
        init_database.session.commit()

        assert engine.evaluate_rule(rule) is False

        # Add 2 more events (hits threshold of 3)
        ev2 = Event(
            source=EventSource.FIREWALL,
            event_type="auth_failure",
            severity=EventSeverity.LOW,
            description="Fail 2",
        )
        ev3 = Event(
            source=EventSource.FIREWALL,
            event_type="auth_failure",
            severity=EventSeverity.LOW,
            description="Fail 3",
        )
        init_database.session.add_all([ev2, ev3])
        init_database.session.commit()

        assert engine.evaluate_rule(rule) is True


def test_evaluate_rule_timeframe(app, init_database):
    """Test evaluating a rule based on timeframe."""
    with app.app_context():
        engine = AlertEngine()

        rule = AlertRule(
            name="Recent Malware",
            condition={"event_type": "malware", "count": 1, "timeframe": "1m"},
        )
        init_database.session.add(rule)

        # Add event from 5 minutes ago (outside timeframe)
        old_time = datetime.utcnow() - timedelta(minutes=5)
        ev_old = Event(
            source=EventSource.ENDPOINT,
            event_type="malware",
            severity=EventSeverity.CRITICAL,
            description="Old malware",
            timestamp=old_time,
        )
        init_database.session.add(ev_old)
        init_database.session.commit()

        assert engine.evaluate_rule(rule) is False

        # Add recent event (inside timeframe)
        ev_recent = Event(
            source=EventSource.ENDPOINT,
            event_type="malware",
            severity=EventSeverity.CRITICAL,
            description="Recent malware",
            timestamp=datetime.utcnow(),
        )
        init_database.session.add(ev_recent)
        init_database.session.commit()

        assert engine.evaluate_rule(rule) is True
