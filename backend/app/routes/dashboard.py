from flask import Blueprint, jsonify, request
from sqlalchemy import func
from datetime import datetime, timedelta
from app import db
from app.models import Event, EventStatus, EventSeverity, EventSource

dashboard_bp = Blueprint('dashboard', __name__)


@dashboard_bp.route('/dashboard/stats', methods=['GET'])
def get_stats():
    """Get dashboard statistics."""
    now = datetime.utcnow()
    last_24h = now - timedelta(hours=24)
    last_7d = now - timedelta(days=7)

    # Total events
    total_events = Event.query.count()

    # Events in last 24h
    events_24h = Event.query.filter(Event.timestamp >= last_24h).count()

    # Events by status
    status_counts = dict(
        db.session.query(Event.status, func.count(Event.id))
        .group_by(Event.status)
        .all()
    )

    # Events by severity
    severity_counts = dict(
        db.session.query(Event.severity, func.count(Event.id))
        .group_by(Event.severity)
        .all()
    )

    # Critical events not resolved
    critical_open = Event.query.filter(
        Event.severity == EventSeverity.CRITICAL,
        Event.status.in_([EventStatus.NEW, EventStatus.INVESTIGATING])
    ).count()

    # Events by source
    source_counts = dict(
        db.session.query(Event.source, func.count(Event.id))
        .group_by(Event.source)
        .all()
    )

    return jsonify({
        'total_events': total_events,
        'events_last_24h': events_24h,
        'critical_open': critical_open,
        'by_status': {
            status.value if hasattr(status, 'value') else str(status): count
            for status, count in status_counts.items()
        },
        'by_severity': {
            sev.value if hasattr(sev, 'value') else str(sev): count
            for sev, count in severity_counts.items()
        },
        'by_source': {
            src.value if hasattr(src, 'value') else str(src): count
            for src, count in source_counts.items()
        }
    })


@dashboard_bp.route('/dashboard/trends', methods=['GET'])
def get_trends():
    """Get event trends over time.

    Query params:
        timeframe: '5m', '15m', '30m', '1h', '6h', '24h', '7d', '30d' (default: '24h')
    """
    now = datetime.utcnow()
    timeframe = request.args.get('timeframe', '24h')

    # Define timeframe configurations
    # interval_minutes: for custom minute-based grouping (0 means use trunc directly)
    timeframe_config = {
        '5m': {'delta': timedelta(minutes=5), 'trunc': 'minute', 'interval_minutes': 0},
        '15m': {'delta': timedelta(minutes=15), 'trunc': 'minute', 'interval_minutes': 0},
        '30m': {'delta': timedelta(minutes=30), 'interval_minutes': 2},
        '1h': {'delta': timedelta(hours=1), 'interval_minutes': 5},
        '6h': {'delta': timedelta(hours=6), 'interval_minutes': 30},
        '24h': {'delta': timedelta(hours=24), 'trunc': 'hour', 'interval_minutes': 0},
        '7d': {'delta': timedelta(days=7), 'trunc': 'hour', 'interval_minutes': 0},
        '30d': {'delta': timedelta(days=30), 'trunc': 'day', 'interval_minutes': 0},
    }

    config = timeframe_config.get(timeframe, timeframe_config['24h'])
    start_time = now - config['delta']
    interval_minutes = config.get('interval_minutes', 0)
    trunc_unit = config.get('trunc')

    # Get event counts grouped by time unit
    if interval_minutes > 0:
        # Custom interval grouping using epoch-based rounding
        interval_seconds = interval_minutes * 60
        time_bucket = func.to_timestamp(
            func.floor(func.extract('epoch', Event.timestamp) / interval_seconds) * interval_seconds
        )
        time_counts = (
            db.session.query(
                time_bucket.label('time_bucket'),
                func.count(Event.id).label('count')
            )
            .filter(Event.timestamp >= start_time)
            .group_by(time_bucket)
            .order_by(time_bucket)
            .all()
        )
    else:
        # Standard date_trunc grouping
        time_counts = (
            db.session.query(
                func.date_trunc(trunc_unit, Event.timestamp).label('time_bucket'),
                func.count(Event.id).label('count')
            )
            .filter(Event.timestamp >= start_time)
            .group_by('time_bucket')
            .order_by('time_bucket')
            .all()
        )

    # Format results based on timeframe
    hourly = []
    for t, c in time_counts:
        if trunc_unit == 'day':
            hourly.append({'hour': t.strftime('%Y-%m-%d'), 'count': c})
        elif trunc_unit == 'hour' and timeframe == '7d':
            hourly.append({'hour': t.strftime('%m-%d %H:%M'), 'count': c})
        else:
            hourly.append({'hour': t.strftime('%H:%M'), 'count': c})

    # Daily counts by severity (for longer timeframes)
    daily = {}
    if timeframe in ['7d', '30d']:
        daily_severity = (
            db.session.query(
                func.date_trunc('day', Event.timestamp).label('day'),
                Event.severity,
                func.count(Event.id).label('count')
            )
            .filter(Event.timestamp >= start_time)
            .group_by('day', Event.severity)
            .order_by('day')
            .all()
        )

        for day, severity, count in daily_severity:
            day_str = day.isoformat()[:10]
            if day_str not in daily:
                daily[day_str] = {'date': day_str, 'critical': 0, 'high': 0, 'medium': 0, 'low': 0}
            daily[day_str][severity.value] = count

    return jsonify({
        'hourly': hourly,
        'daily': list(daily.values()),
        'timeframe': timeframe
    })


@dashboard_bp.route('/dashboard/sites', methods=['GET'])
def get_sites_summary():
    """Get summary by site (for multi-site audioprothésistes network)."""
    # Events by site with severity breakdown
    site_stats = (
        db.session.query(
            Event.site_id,
            Event.severity,
            func.count(Event.id).label('count')
        )
        .filter(Event.site_id.isnot(None))
        .group_by(Event.site_id, Event.severity)
        .all()
    )

    # Organize by site
    sites = {}
    for site_id, severity, count in site_stats:
        if site_id not in sites:
            sites[site_id] = {
                'site_id': site_id,
                'total': 0,
                'critical': 0,
                'high': 0,
                'medium': 0,
                'low': 0
            }
        sites[site_id][severity.value] = count
        sites[site_id]['total'] += count

    # Sort by total events descending
    sorted_sites = sorted(sites.values(), key=lambda x: x['total'], reverse=True)

    return jsonify({'sites': sorted_sites})
