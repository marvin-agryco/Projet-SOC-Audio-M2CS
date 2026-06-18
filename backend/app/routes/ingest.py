from flask import Blueprint, request, jsonify
from app import db, socketio
from app.models import Event, EventSeverity, EventSource

ingest_bp = Blueprint('ingest', __name__)

# Valid values for validation
VALID_SEVERITIES = {s.value for s in EventSeverity}
VALID_SOURCES = {s.value for s in EventSource}


@ingest_bp.route('/ingest', methods=['POST'])
def ingest_event():
    """
    Ingest a new security event.

    Expected payload:
    {
        "timestamp": "2025-01-15T10:30:00Z",  # Optional, defaults to now
        "source": "firewall|ids|endpoint|network|email|active_directory|application",
        "event_type": "auth_failure|port_scan|malware_detected|...",
        "severity": "critical|high|medium|low",
        "description": "Human readable summary",
        "raw_log": "Original log entry",  # Optional
        "metadata": {},  # Optional
        "site_id": "site_001"  # Optional, for multi-site
    }
    """
    data = request.get_json()

    if not data:
        return jsonify({'error': 'No JSON payload provided'}), 400

    # Validate required fields
    required = ['source', 'event_type', 'severity', 'description']
    missing = [f for f in required if f not in data]
    if missing:
        return jsonify({'error': f'Missing required fields: {missing}'}), 400

    # Validate severity
    if data['severity'] not in VALID_SEVERITIES:
        return jsonify({
            'error': f"Invalid severity: {data['severity']}. Must be one of: {VALID_SEVERITIES}"
        }), 400

    # Validate source
    if data['source'] not in VALID_SOURCES:
        return jsonify({
            'error': f"Invalid source: {data['source']}. Must be one of: {VALID_SOURCES}"
        }), 400

    # Sanitize raw_log to prevent log injection
    if 'raw_log' in data:
        data['raw_log'] = sanitize_log(data['raw_log'])

    # Create event
    try:
        event = Event.from_dict(data)
        db.session.add(event)
        db.session.commit()

        event_dict = event.to_dict()

        # Broadcast to WebSocket clients (suppress keepalive heartbeats)
        if data['event_type'] != 'keepalive':
            socketio.emit('new_event', event_dict)
            if data['severity'] in ('critical', 'high'):
                socketio.emit('alert', {
                    'type': 'new_critical_event',
                    'event': event_dict
                })

        return jsonify(event_dict), 201

    except Exception as e:
        db.session.rollback()
        return jsonify({'error': str(e)}), 500


@ingest_bp.route('/ingest/batch', methods=['POST'])
def ingest_batch():
    """Ingest multiple events at once."""
    data = request.get_json()

    if not data or 'events' not in data:
        return jsonify({'error': 'Expected {"events": [...]}'}), 400

    events = data['events']
    if not isinstance(events, list):
        return jsonify({'error': 'events must be a list'}), 400

    created = []
    errors = []

    for i, event_data in enumerate(events):
        try:
            # Validate
            required = ['source', 'event_type', 'severity', 'description']
            missing = [f for f in required if f not in event_data]
            if missing:
                errors.append({'index': i, 'error': f'Missing fields: {missing}'})
                continue

            if event_data['severity'] not in VALID_SEVERITIES:
                errors.append({'index': i, 'error': f"Invalid severity"})
                continue

            if event_data['source'] not in VALID_SOURCES:
                errors.append({'index': i, 'error': f"Invalid source"})
                continue

            if 'raw_log' in event_data:
                event_data['raw_log'] = sanitize_log(event_data['raw_log'])

            event = Event.from_dict(event_data)
            db.session.add(event)
            created.append(event)

        except Exception as e:
            errors.append({'index': i, 'error': str(e)})

    if created:
        db.session.commit()

        # Broadcast batch to WebSocket
        for event in created:
            socketio.emit('new_event', event.to_dict())

    return jsonify({
        'created': len(created),
        'errors': errors
    }), 201 if created else 400


def sanitize_log(log: str) -> str:
    """
    Sanitize log entry to prevent injection attacks.
    Removes control characters and limits length.
    """
    if not log:
        return log

    # Remove control characters except newline and tab
    sanitized = ''.join(
        c for c in log
        if c.isprintable() or c in '\n\t'
    )

    # Limit length to 10KB
    return sanitized[:10240]
