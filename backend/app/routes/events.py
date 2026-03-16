import requests as req
from flask import Blueprint, request, jsonify
from sqlalchemy import desc
from app import db
from app.models import Event, EventStatus, EventSeverity, EventSource

events_bp = Blueprint('events', __name__)


@events_bp.route('/events', methods=['GET'])
def list_events():
    """List events with filtering and pagination."""
    # Pagination - support both 'limit' and 'per_page'
    page = request.args.get('page', 1, type=int)
    limit = request.args.get('limit', type=int)
    per_page = limit if limit else request.args.get('per_page', 50, type=int)
    per_page = min(per_page, 500)  # Max 500 per page

    # Build query — always exclude keepalive heartbeats from event views
    query = Event.query.filter(Event.event_type != 'keepalive')

    # Filters - support comma-separated values for multiple selection
    if status := request.args.get('status'):
        statuses = [s.strip() for s in status.split(',')]
        if len(statuses) > 1:
            valid_statuses = []
            for s in statuses:
                try:
                    valid_statuses.append(EventStatus(s))
                except ValueError:
                    pass
            if valid_statuses:
                query = query.filter(Event.status.in_(valid_statuses))
        else:
            try:
                query = query.filter(Event.status == EventStatus(status))
            except ValueError:
                pass

    if severity := request.args.get('severity'):
        severities = [s.strip() for s in severity.split(',')]
        if len(severities) > 1:
            valid_severities = []
            for s in severities:
                try:
                    valid_severities.append(EventSeverity(s))
                except ValueError:
                    pass
            if valid_severities:
                query = query.filter(Event.severity.in_(valid_severities))
        else:
            try:
                query = query.filter(Event.severity == EventSeverity(severity))
            except ValueError:
                pass

    if source := request.args.get('source'):
        sources = [s.strip() for s in source.split(',')]
        if len(sources) > 1:
            valid_sources = []
            for s in sources:
                try:
                    valid_sources.append(EventSource(s))
                except ValueError:
                    pass
            if valid_sources:
                query = query.filter(Event.source.in_(valid_sources))
        else:
            try:
                query = query.filter(Event.source == EventSource(source))
            except ValueError:
                pass

    if event_type := request.args.get('event_type'):
        query = query.filter(Event.event_type == event_type)

    if site_id := request.args.get('site_id'):
        query = query.filter(Event.site_id == site_id)

    if search := request.args.get('search'):
        query = query.filter(Event.description.ilike(f'%{search}%'))

    # Sort by timestamp descending (most recent first)
    query = query.order_by(desc(Event.timestamp))

    # Paginate
    pagination = query.paginate(page=page, per_page=per_page, error_out=False)

    return jsonify({
        'events': [e.to_dict() for e in pagination.items],
        'total': pagination.total,
        'page': page,
        'per_page': per_page,
        'pages': pagination.pages
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
