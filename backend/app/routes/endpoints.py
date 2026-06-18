from flask import Blueprint, request, jsonify
from datetime import datetime, timedelta
from sqlalchemy import func, case

from app import db
from app.models import Event, EventSeverity, EventStatus
from app.models.user import User

endpoints_bp = Blueprint('endpoints', __name__)


@endpoints_bp.route('/endpoints', methods=['GET'])
def list_endpoints():
    """List monitored endpoints derived from real event data."""
    status_filter = request.args.get('status')
    limit = request.args.get('limit', type=int)

    now = datetime.utcnow()
    day_ago = now - timedelta(hours=24)

    # Get distinct site_ids that have security events (keepalives excluded)
    sites = db.session.query(
        Event.site_id,
        func.count(Event.id).label('total_events'),
        func.max(Event.timestamp).label('last_seen'),
    ).filter(
        Event.site_id.isnot(None),
        Event.site_id != '',
        Event.event_type != 'keepalive',
    ).group_by(Event.site_id).all()

    site_ids = [row[0] for row in sites]

    # Batch query 1: events in last 24h per site (one query instead of N)
    events_24h_rows = db.session.query(
        Event.site_id,
        func.count(Event.id).label('count'),
    ).filter(
        Event.site_id.in_(site_ids),
        Event.timestamp >= day_ago,
        Event.event_type != 'keepalive',
    ).group_by(Event.site_id).all()
    events_24h_map = {r.site_id: r.count for r in events_24h_rows}

    # Batch query 2: per-severity open counts per site (one query instead of 4N)
    sev_rows = db.session.query(
        Event.site_id,
        func.sum(case((Event.severity == EventSeverity.CRITICAL, 1), else_=0)).label('critical'),
        func.sum(case((Event.severity == EventSeverity.HIGH,     1), else_=0)).label('high'),
        func.sum(case((Event.severity == EventSeverity.MEDIUM,   1), else_=0)).label('medium'),
        func.sum(case((Event.severity == EventSeverity.LOW,      1), else_=0)).label('low'),
    ).filter(
        Event.site_id.in_(site_ids),
        Event.status.in_([EventStatus.NEW, EventStatus.INVESTIGATING]),
        Event.event_type != 'keepalive',
    ).group_by(Event.site_id).all()
    sev_map = {r.site_id: r for r in sev_rows}

    endpoints = []
    for site_id, total_events, last_seen in sites:
        events_24h   = events_24h_map.get(site_id, 0)
        sev          = sev_map.get(site_id)
        critical_open = int(sev.critical or 0) if sev else 0
        high_open     = int(sev.high     or 0) if sev else 0
        medium_open   = int(sev.medium   or 0) if sev else 0
        low_open      = int(sev.low      or 0) if sev else 0
        critical_alerts = critical_open + high_open

        if last_seen and (now - last_seen) < timedelta(hours=1):
            ep_status = 'online'
        elif last_seen and (now - last_seen) < timedelta(hours=24):
            ep_status = 'degraded'
        else:
            ep_status = 'offline'

        endpoint = {
            'id': f'endpoint-{site_id}',
            'site_id': site_id,
            'name': site_id,
            'status': ep_status,
            'last_seen': last_seen.isoformat() + 'Z' if last_seen else None,
            'event_count_24h': events_24h,
            'critical_alerts': critical_alerts,
            'critical_open': critical_open,
            'high_open': high_open,
            'medium_open': medium_open,
            'low_open': low_open,
            'total_events': total_events,
            'type': 'endpoint',
        }
        endpoints.append(endpoint)

    # Filter by status
    if status_filter:
        statuses = [s.strip() for s in status_filter.split(',')]
        endpoints = [e for e in endpoints if e['status'] in statuses]

    # Sort: online first, then by events desc
    status_order = {'online': 0, 'degraded': 1, 'offline': 2}
    endpoints.sort(key=lambda e: (status_order.get(e['status'], 3), -e['total_events']))

    if limit:
        endpoints = endpoints[:limit]

    return jsonify({
        'endpoints': endpoints,
        'total': len(endpoints),
    })


@endpoints_bp.route('/endpoints/<endpoint_id>', methods=['GET'])
def get_endpoint(endpoint_id):
    """Get a single endpoint by ID."""
    # endpoint_id is 'endpoint-SITE_ID'
    site_id = endpoint_id.replace('endpoint-', '', 1) if endpoint_id.startswith('endpoint-') else endpoint_id

    event = db.session.query(Event).filter(
        Event.site_id == site_id
    ).first()

    if not event:
        return jsonify({'error': 'Endpoint not found'}), 404

    now = datetime.utcnow()
    day_ago = now - timedelta(hours=24)
    last_seen = db.session.query(func.max(Event.timestamp)).filter(
        Event.site_id == site_id,
        Event.event_type != 'keepalive',
    ).scalar()

    events_24h = db.session.query(func.count(Event.id)).filter(
        Event.site_id == site_id,
        Event.timestamp >= day_ago,
        Event.event_type != 'keepalive',
    ).scalar() or 0

    if last_seen and (now - last_seen) < timedelta(hours=1):
        ep_status = 'online'
    elif last_seen and (now - last_seen) < timedelta(hours=24):
        ep_status = 'degraded'
    else:
        ep_status = 'offline'

    return jsonify({
        'id': f'endpoint-{site_id}',
        'site_id': site_id,
        'name': site_id,
        'status': ep_status,
        'last_seen': last_seen.isoformat() if last_seen else None,
        'event_count_24h': events_24h,
        'type': 'endpoint',
    })


@endpoints_bp.route('/analysts', methods=['GET'])
def list_analysts():
    """List available analysts from User model."""
    users = User.query.filter_by(is_active=True).all()
    analysts = [
        {
            'id': str(u.id),
            'name': u.username,
            'email': u.email,
            'role': u.role.value,
        }
        for u in users
    ]
    return jsonify({'analysts': analysts})
