import csv
import io
from datetime import datetime

import requests as req
from flask import Blueprint, Response, request, jsonify, stream_with_context
from sqlalchemy import desc
from app import db
from app.models import Event, EventStatus, EventSeverity, EventSource

events_bp = Blueprint('events', __name__)


def _build_event_query(args):
    """Shared query builder used by list_events and export_events."""
    query = Event.query.filter(Event.event_type != 'keepalive')

    if status := args.get('status'):
        statuses = [s.strip() for s in status.split(',')]
        valid = []
        for s in statuses:
            try:
                valid.append(EventStatus(s))
            except ValueError:
                pass
        if valid:
            query = query.filter(Event.status.in_(valid))

    if severity := args.get('severity'):
        severities = [s.strip() for s in severity.split(',')]
        valid = []
        for s in severities:
            try:
                valid.append(EventSeverity(s))
            except ValueError:
                pass
        if valid:
            query = query.filter(Event.severity.in_(valid))

    if source := args.get('source'):
        sources = [s.strip() for s in source.split(',')]
        valid = []
        for s in sources:
            try:
                valid.append(EventSource(s))
            except ValueError:
                pass
        if valid:
            query = query.filter(Event.source.in_(valid))

    if event_type := args.get('event_type'):
        query = query.filter(Event.event_type == event_type)

    if site_id := args.get('site_id'):
        query = query.filter(Event.site_id == site_id)

    if search := args.get('search'):
        query = query.filter(Event.description.ilike(f'%{search}%'))

    if start := args.get('start'):
        try:
            dt = datetime.fromisoformat(start.replace('Z', '+00:00')).replace(tzinfo=None)
            query = query.filter(Event.timestamp >= dt)
        except ValueError:
            pass

    if end := args.get('end'):
        try:
            dt = datetime.fromisoformat(end.replace('Z', '+00:00')).replace(tzinfo=None)
            query = query.filter(Event.timestamp <= dt)
        except ValueError:
            pass

    return query.order_by(desc(Event.timestamp))


@events_bp.route('/events', methods=['GET'])
def list_events():
    """List events with filtering and pagination."""
    page = request.args.get('page', 1, type=int)
    limit = request.args.get('limit', type=int)
    per_page = limit if limit else request.args.get('per_page', 50, type=int)
    per_page = min(per_page, 500)

    query = _build_event_query(request.args)
    pagination = query.paginate(page=page, per_page=per_page, error_out=False)

    return jsonify({
        'events': [e.to_dict() for e in pagination.items],
        'total': pagination.total,
        'page': page,
        'per_page': per_page,
        'pages': pagination.pages
    })


@events_bp.route('/events/export', methods=['GET'])
def export_events():
    """Export filtered events.

    Query params: same filters as /events, plus:
      - format: 'csv' (default) or 'json'
      - start, end: ISO timestamps for date range
      - max_rows: safety cap (default 50000)
    """
    fmt = request.args.get('format', 'csv').lower()
    max_rows = min(request.args.get('max_rows', 50000, type=int), 100000)

    query = _build_event_query(request.args).limit(max_rows)

    if fmt == 'json':
        events = [e.to_dict() for e in query.all()]
        return jsonify({
            'events': events,
            'total': len(events),
            'exported_at': datetime.utcnow().isoformat() + 'Z',
            'filters': {k: v for k, v in request.args.items() if k not in ('format', 'max_rows')},
        })

    # CSV streaming
    def generate():
        buf = io.StringIO()
        writer = csv.writer(buf, quoting=csv.QUOTE_ALL)
        writer.writerow([
            'Event ID', 'Timestamp (UTC)', 'Severity', 'Source', 'Event Type',
            'Description', 'Status', 'Assigned To', 'Site ID', 'Raw Log'
        ])
        yield buf.getvalue()
        buf.seek(0); buf.truncate()

        for event in query.yield_per(500):
            writer.writerow([
                str(event.id),
                event.timestamp.isoformat() + 'Z',
                event.severity.value,
                event.source.value,
                event.event_type,
                event.description or '',
                event.status.value,
                event.assigned_to or '',
                event.site_id or '',
                (event.raw_log or '').replace('\n', ' ').replace('\r', ' '),
            ])
            yield buf.getvalue()
            buf.seek(0); buf.truncate()

    filename = f"audiosoc-events-{datetime.utcnow().strftime('%Y%m%d-%H%M%S')}.csv"
    return Response(
        stream_with_context(generate()),
        mimetype='text/csv; charset=utf-8',
        headers={
            'Content-Disposition': f'attachment; filename="{filename}"',
            'X-Content-Type-Options': 'nosniff',
        },
    )


@events_bp.route('/events/export/summary', methods=['GET'])
def export_summary():
    """Return aggregate counts for the compliance PDF cover page (no row data)."""
    query = _build_event_query(request.args)
    total = query.count()

    by_sev = {'critical': 0, 'high': 0, 'medium': 0, 'low': 0}
    by_status = {'new': 0, 'investigating': 0, 'resolved': 0, 'false_positive': 0}
    by_source = {}

    # Per-severity / per-status / per-source counts in one pass
    for row in query.with_entities(
        Event.severity, Event.status, Event.source
    ).all():
        by_sev[row[0].value] = by_sev.get(row[0].value, 0) + 1
        by_status[row[1].value] = by_status.get(row[1].value, 0) + 1
        by_source[row[2].value] = by_source.get(row[2].value, 0) + 1

    # Time range of matching events (clear inherited desc ordering)
    base = query.order_by(None)
    first_ts = base.with_entities(Event.timestamp).order_by(Event.timestamp.asc()).first()
    last_ts = base.with_entities(Event.timestamp).order_by(Event.timestamp.desc()).first()

    return jsonify({
        'total': total,
        'by_severity': by_sev,
        'by_status': by_status,
        'by_source': by_source,
        'first_event': first_ts[0].isoformat() + 'Z' if first_ts else None,
        'last_event': last_ts[0].isoformat() + 'Z' if last_ts else None,
        'generated_at': datetime.utcnow().isoformat() + 'Z',
        'filters': {k: v for k, v in request.args.items()},
    })


@events_bp.route('/events/<uuid:event_id>', methods=['GET'])
def get_event(event_id):
    """Get a single event by ID."""
    event = Event.query.get_or_404(event_id)
    return jsonify(event.to_dict())


@events_bp.route('/events/<uuid:event_id>/status', methods=['PATCH'])
def update_event_status(event_id):
    """Update event status and assignment."""
    event = Event.query.get_or_404(event_id)
    data = request.get_json()

    if 'status' in data:
        try:
            event.status = EventStatus(data['status'])
        except ValueError:
            return jsonify({'error': f"Invalid status: {data['status']}"}), 400

    if 'assigned_to' in data:
        event.assigned_to = data['assigned_to']

    db.session.commit()

    # Emit WebSocket event for real-time update
    from app import socketio
    socketio.emit('event_updated', event.to_dict())

    return jsonify(event.to_dict())


@events_bp.route('/events/<uuid:event_id>', methods=['DELETE'])
def delete_event(event_id):
    """Delete an event (admin only in production)."""
    event = Event.query.get_or_404(event_id)
    db.session.delete(event)
    db.session.commit()
    return '', 204


@events_bp.route('/events/<uuid:event_id>/explain', methods=['POST'])
def explain_event(event_id):
    """Call the local LLM to explain a raw log entry in plain English."""
    from app.services.triage_service import build_explain_prompt
    from flask import current_app

    event = Event.query.get_or_404(event_id)
    if not event.raw_log and not event.description:
        return jsonify({'error': 'No log content to explain'}), 400

    prompt = build_explain_prompt(event.to_dict())
    ollama_url = current_app.config.get('OLLAMA_URL', 'http://ollama:11434')
    model = current_app.config.get('OLLAMA_MODEL', 'qwen2.5:1.5b')

    try:
        resp = req.post(
            f'{ollama_url}/api/chat',
            json={'model': model, 'messages': [{'role': 'user', 'content': prompt}], 'stream': False},
            timeout=30,
        )
        resp.raise_for_status()
        explanation = resp.json()['message']['content'].strip()
    except req.exceptions.Timeout:
        return jsonify({'error': 'LLM timed out — try again'}), 504
    except req.exceptions.ConnectionError:
        return jsonify({'error': 'LLM service unavailable'}), 503
    except Exception as e:
        return jsonify({'error': f'Failed to generate explanation: {str(e)[:100]}'}), 500

    return jsonify({'explanation': explanation})


# In-memory storage for comments (for demo purposes)
# In production, this would be a database table
_event_comments = {}


@events_bp.route('/events/<uuid:event_id>/comments', methods=['GET'])
def get_event_comments(event_id):
    """Get comments for an event."""
    # Ensure event exists
    Event.query.get_or_404(event_id)

    comments = _event_comments.get(str(event_id), [])
    return jsonify({'comments': comments})


@events_bp.route('/events/<uuid:event_id>/comments', methods=['POST'])
def add_event_comment(event_id):
    """Add a comment to an event."""
    from datetime import datetime
    import uuid as uuid_lib

    # Ensure event exists
    Event.query.get_or_404(event_id)

    data = request.get_json()
    if not data or not data.get('content'):
        return jsonify({'error': 'Content is required'}), 400

    comment = {
        'id': str(uuid_lib.uuid4()),
        'event_id': str(event_id),
        'author': data.get('author', 'Demo User'),
        'content': data['content'],
        'created_at': datetime.utcnow().isoformat(),
    }

    event_id_str = str(event_id)
    if event_id_str not in _event_comments:
        _event_comments[event_id_str] = []
    _event_comments[event_id_str].append(comment)

    return jsonify(comment), 201
