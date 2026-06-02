from datetime import datetime, timedelta

from flask import Blueprint, request, jsonify
from sqlalchemy import desc, func
from app import db
from app.models import AlertRule, AlertAction, Event, EventSeverity, EventSource, Incident
from app.services.alert_engine import AlertEngine

alerts_bp = Blueprint('alerts', __name__)


@alerts_bp.route('/alerts/rules', methods=['GET'])
def list_rules():
    """List all alert rules."""
    rules = AlertRule.query.order_by(AlertRule.created_at.desc()).all()
    return jsonify({
        'rules': [r.to_dict() for r in rules],
        'total': len(rules)
    })


@alerts_bp.route('/alerts/rules', methods=['POST'])
def create_rule():
    """
    Create a new alert rule.

    Expected payload:
    {
        "name": "Multiple Failed Logins",
        "description": "Alert when 5+ auth failures in 10 minutes",
        "condition": {
            "event_type": "auth_failure",
            "count": 5,
            "timeframe": "10m",
            "source": "any"
        },
        "action": "email",
        "action_config": {"recipients": ["admin@example.com"]},
        "severity": "high"
    }
    """
    data = request.get_json()

    if not data:
        return jsonify({'error': 'No JSON payload provided'}), 400

    # Validate required fields
    required = ['name', 'condition']
    missing = [f for f in required if f not in data]
    if missing:
        return jsonify({'error': f'Missing required fields: {missing}'}), 400

    # Validate action
    action = data.get('action', 'log')
    try:
        action_enum = AlertAction(action)
    except ValueError:
        return jsonify({
            'error': f"Invalid action: {action}. Must be one of: {[a.value for a in AlertAction]}"
        }), 400

    rule = AlertRule(
        name=data['name'],
        description=data.get('description'),
        condition=data['condition'],
        action=action_enum,
        action_config=data.get('action_config', {}),
        severity=data.get('severity', 'high'),
        enabled=data.get('enabled', True)
    )

    db.session.add(rule)
    db.session.commit()

    return jsonify(rule.to_dict()), 201


@alerts_bp.route('/alerts/rules/<uuid:rule_id>', methods=['GET'])
def get_rule(rule_id):
    """Get a single alert rule."""
    rule = AlertRule.query.get_or_404(rule_id)
    return jsonify(rule.to_dict())


@alerts_bp.route('/alerts/rules/<uuid:rule_id>', methods=['PATCH'])
def update_rule(rule_id):
    """Update an alert rule."""
    rule = AlertRule.query.get_or_404(rule_id)
    data = request.get_json()

    if 'name' in data:
        rule.name = data['name']
    if 'description' in data:
        rule.description = data['description']
    if 'condition' in data:
        rule.condition = data['condition']
    if 'action' in data:
        try:
            rule.action = AlertAction(data['action'])
        except ValueError:
            return jsonify({'error': f"Invalid action: {data['action']}"}), 400
    if 'action_config' in data:
        rule.action_config = data['action_config']
    if 'severity' in data:
        rule.severity = data['severity']
    if 'enabled' in data:
        rule.enabled = data['enabled']

    db.session.commit()
    return jsonify(rule.to_dict())


@alerts_bp.route('/alerts/rules/<uuid:rule_id>', methods=['DELETE'])
def delete_rule(rule_id):
    """Delete an alert rule."""
    rule = AlertRule.query.get_or_404(rule_id)
    db.session.delete(rule)
    db.session.commit()
    return '', 204


@alerts_bp.route('/alerts/rules/<uuid:rule_id>/toggle', methods=['POST'])
def toggle_rule(rule_id):
    """Enable or disable an alert rule."""
    rule = AlertRule.query.get_or_404(rule_id)
    rule.enabled = not rule.enabled
    db.session.commit()
    return jsonify(rule.to_dict())


def _apply_condition_to_query(query, condition: dict, hours: int):
    """Apply a rule condition to an Event query (used by /test and /triggered).

    Mirrors AlertEngine.evaluate_rule filters but does NOT require
    incident_id IS NULL — we want to count ALL matching events for dry-run.
    """
    query = query.filter(Event.event_type != 'keepalive')

    if event_type := condition.get('event_type'):
        if event_type != 'any':
            query = query.filter(Event.event_type == event_type)

    if source := condition.get('source'):
        if source != 'any':
            try:
                query = query.filter(Event.source == EventSource(source))
            except ValueError:
                pass

    if severity := condition.get('severity'):
        if severity != 'any':
            try:
                query = query.filter(Event.severity == EventSeverity(severity))
            except ValueError:
                pass

    if site_id := condition.get('site_id'):
        if site_id != 'any':
            query = query.filter(Event.site_id == site_id)

    since = datetime.utcnow() - timedelta(hours=hours)
    query = query.filter(Event.timestamp >= since)
    return query


@alerts_bp.route('/alerts/rules/<uuid:rule_id>/test', methods=['POST'])
def test_rule(rule_id):
    """Dry-run a rule's condition against last N hours of events.

    Returns: how many events WOULD match, sample of 5, and whether
    threshold would have been crossed.
    """
    rule = AlertRule.query.get_or_404(rule_id)
    return _test_condition(rule.condition or {})


@alerts_bp.route('/alerts/rules/test', methods=['POST'])
def test_condition():
    """Dry-run an arbitrary condition payload (used by rule form preview)."""
    data = request.get_json() or {}
    return _test_condition(data.get('condition') or {})


def _test_condition(condition: dict):
    hours = int(request.args.get('hours', 24))
    hours = max(1, min(hours, 168))  # 1h – 7d
    threshold = int(condition.get('count', 1))

    query = _apply_condition_to_query(Event.query, condition, hours)
    matched = query.count()
    samples = (
        query.order_by(desc(Event.timestamp))
        .limit(5)
        .all()
    )

    return jsonify({
        'hours': hours,
        'threshold': threshold,
        'matched': matched,
        'would_fire': matched >= threshold,
        'samples': [
            {
                'id': str(e.id),
                'timestamp': e.timestamp.isoformat() + 'Z',
                'severity': e.severity.value,
                'source': e.source.value,
                'event_type': e.event_type,
                'description': e.description,
                'site_id': e.site_id,
            } for e in samples
        ],
    })


@alerts_bp.route('/alerts/triggered', methods=['GET'])
def list_triggered():
    """List incidents grouped by alert rule (i.e. rule-trigger history).

    Query params:
      - hours: lookback window (default 24, max 720)
      - rule_id: optional filter
      - limit: max incidents to return (default 100, max 500)
    """
    hours = max(1, min(int(request.args.get('hours', 24)), 720))
    limit = max(1, min(int(request.args.get('limit', 100)), 500))
    rule_id = request.args.get('rule_id')

    since = datetime.utcnow() - timedelta(hours=hours)
    query = (
        Incident.query
        .filter(Incident.alert_rule_id.isnot(None))
        .filter(Incident.created_at >= since)
    )
    if rule_id:
        query = query.filter(Incident.alert_rule_id == rule_id)

    incidents = query.order_by(desc(Incident.created_at)).limit(limit).all()

    # Build rule_id -> rule_name + severity map
    rule_ids = {i.alert_rule_id for i in incidents if i.alert_rule_id}
    rules_map = {
        r.id: {'name': r.name, 'severity': r.severity, 'enabled': r.enabled}
        for r in AlertRule.query.filter(AlertRule.id.in_(rule_ids)).all()
    } if rule_ids else {}

    items = []
    for inc in incidents:
        meta = rules_map.get(inc.alert_rule_id, {})
        items.append({
            'incident_id': str(inc.id),
            'rule_id': str(inc.alert_rule_id),
            'rule_name': meta.get('name', '(deleted rule)'),
            'rule_severity': meta.get('severity'),
            'rule_enabled': meta.get('enabled', True),
            'incident_title': inc.title,
            'incident_status': inc.status.value,
            'incident_severity': inc.severity.value,
            'event_count': inc.event_count,
            'created_at': inc.created_at.isoformat() + 'Z' if inc.created_at else None,
            'updated_at': inc.updated_at.isoformat() + 'Z' if inc.updated_at else None,
        })

    # Per-rule aggregates over the same window
    per_rule_counts = (
        db.session.query(
            Incident.alert_rule_id,
            func.count(Incident.id),
            func.max(Incident.created_at),
        )
        .filter(Incident.alert_rule_id.isnot(None))
        .filter(Incident.created_at >= since)
        .group_by(Incident.alert_rule_id)
        .all()
    )
    summary = [
        {
            'rule_id': str(rid),
            'rule_name': rules_map.get(rid, {}).get('name', '(deleted rule)'),
            'fired_count': int(cnt),
            'last_fired': last.isoformat() + 'Z' if last else None,
        }
        for rid, cnt, last in per_rule_counts
    ]

    return jsonify({
        'hours': hours,
        'total': len(items),
        'instances': items,
        'summary': summary,
    })
