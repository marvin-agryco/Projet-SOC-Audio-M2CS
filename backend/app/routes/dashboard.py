from flask import Blueprint, jsonify, request
from sqlalchemy import func, case
from datetime import datetime, timedelta
import os
import requests as http_requests
from app import db
from app.models import (
    Event,
    EventStatus,
    EventSeverity,
    EventSource,
    Incident,
    IncidentStatus,
    AlertRule,
)

dashboard_bp = Blueprint("dashboard", __name__)

# ── GLPI reachability cache ────────────────────────────────────────────────────
# Cached so the blocking HTTP call only runs once every 30 s, not on every request.
_glpi_cache: dict = {"alive": False, "checked_at": None}
_GLPI_CACHE_TTL = 30  # seconds


def _glpi_alive() -> bool:
    """Return True if GLPI is reachable, using a 30-second TTL cache."""
    now = datetime.utcnow()
    if _glpi_cache["checked_at"] is not None:
        age = (now - _glpi_cache["checked_at"]).total_seconds()
        if age < _GLPI_CACHE_TTL:
            return _glpi_cache["alive"]
    # Probe GLPI
    alive = False
    try:
        glpi_url = os.environ.get("GLPI_URL", "http://glpi-crm/apirest.php")
        app_token = os.environ.get("GLPI_APP_TOKEN", "")
        resp = http_requests.get(
            f"{glpi_url}/initSession",
            headers={"App-Token": app_token},
            timeout=2,  # short timeout — cached result used most of the time
        )
        alive = resp.status_code < 500
    except Exception:
        alive = False
    _glpi_cache["alive"] = alive
    _glpi_cache["checked_at"] = now
    return alive


@dashboard_bp.route("/dashboard/stats", methods=["GET"])
def get_stats():
    """Get dashboard statistics."""
    now = datetime.utcnow()
    last_24h = now - timedelta(hours=24)
    last_7d = now - timedelta(days=7)

    # Base filter: exclude keepalive heartbeats from all stats
    security_events = Event.query.filter(Event.event_type != 'keepalive')

    # Total events
    total_events = security_events.count()

    # Events in last 24h
    events_24h = security_events.filter(Event.timestamp >= last_24h).count()

    # Events in previous 24h (for trend comparison)
    prev_24h_start = last_24h - timedelta(hours=24)
    events_prev_24h = security_events.filter(
        Event.timestamp >= prev_24h_start, Event.timestamp < last_24h
    ).count()

    # Critical open in previous 24h (for trend comparison)
    critical_prev_24h = security_events.filter(
        Event.severity == EventSeverity.CRITICAL,
        Event.status.in_([EventStatus.NEW, EventStatus.INVESTIGATING]),
        Event.created_at >= prev_24h_start,
        Event.created_at < last_24h,
    ).count()

    # Events by status
    status_counts = dict(
        db.session.query(Event.status, func.count(Event.id))
        .filter(Event.event_type != 'keepalive')
        .group_by(Event.status)
        .all()
    )

    # Events by severity
    severity_counts = dict(
        db.session.query(Event.severity, func.count(Event.id))
        .filter(Event.event_type != 'keepalive')
        .group_by(Event.severity)
        .all()
    )

    # Critical events not resolved
    critical_open = security_events.filter(
        Event.severity == EventSeverity.CRITICAL,
        Event.status.in_([EventStatus.NEW, EventStatus.INVESTIGATING]),
    ).count()

    # All unresolved events (any severity)
    active_alerts = security_events.filter(
        Event.status.in_([EventStatus.NEW, EventStatus.INVESTIGATING])
    ).count()

    # Events by source
    source_counts = dict(
        db.session.query(Event.source, func.count(Event.id))
        .filter(Event.event_type != 'keepalive')
        .group_by(Event.source)
        .all()
    )

    # Unique sites
    total_sites = (
        db.session.query(func.count(func.distinct(Event.site_id)))
        .filter(Event.event_type != 'keepalive')
        .scalar() or 0
    )

    # Total alert rule triggers (sum of trigger_count across all rules)
    total_rule_triggers = db.session.query(
        func.coalesce(func.sum(AlertRule.trigger_count), 0)
    ).scalar()

    # Open incidents
    open_incidents = Incident.query.filter(
        Incident.status.in_(
            [IncidentStatus.NEW, IncidentStatus.OPEN, IncidentStatus.INVESTIGATING]
        )
    ).count()

    return jsonify(
        {
            "total_events": total_events,
            "events_last_24h": events_24h,
            "events_prev_24h": events_prev_24h,
            "critical_open": critical_open,
            "critical_prev_24h": critical_prev_24h,
            "total_rule_triggers": total_rule_triggers,
            "active_alerts": active_alerts,
            "total_sites": total_sites,
            "open_incidents": open_incidents,
            "by_status": {
                status.value if hasattr(status, "value") else str(status): count
                for status, count in status_counts.items()
            },
            "by_severity": {
                sev.value if hasattr(sev, "value") else str(sev): count
                for sev, count in severity_counts.items()
            },
            "by_source": {
                **{src.value: 0 for src in EventSource},
                **{
                    (src.value if hasattr(src, "value") else str(src)): count
                    for src, count in source_counts.items()
                },
            },
        }
    )


@dashboard_bp.route("/dashboard/trends", methods=["GET"])
def get_trends():
    """Get event trends over time.

    Query params:
        timeframe: '5m', '15m', '30m', '1h', '6h', '24h', '7d', '30d' (default: '24h')
    """
    now = datetime.utcnow()
    timeframe = request.args.get("timeframe", "24h")

    # Define timeframe configurations
    # interval_minutes: for custom minute-based grouping (0 means use trunc directly)
    timeframe_config = {
        "5m": {"delta": timedelta(minutes=5), "trunc": "minute", "interval_minutes": 0},
        "15m": {
            "delta": timedelta(minutes=15),
            "trunc": "minute",
            "interval_minutes": 0,
        },
        "30m": {"delta": timedelta(minutes=30), "interval_minutes": 2},
        "1h": {"delta": timedelta(hours=1), "interval_minutes": 5},
        "6h": {"delta": timedelta(hours=6), "interval_minutes": 30},
        "24h": {"delta": timedelta(hours=24), "trunc": "hour", "interval_minutes": 0},
        "7d": {"delta": timedelta(days=7), "trunc": "hour", "interval_minutes": 0},
        "30d": {"delta": timedelta(days=30), "trunc": "day", "interval_minutes": 0},
    }

    config = timeframe_config.get(timeframe, timeframe_config["24h"])
    start_time = now - config["delta"]
    interval_minutes = config.get("interval_minutes", 0)
    trunc_unit = config.get("trunc")

    # Get event counts grouped by time unit
    if interval_minutes > 0:
        # Custom interval grouping using epoch-based rounding
        interval_seconds = interval_minutes * 60
        time_bucket = func.to_timestamp(
            func.floor(func.extract("epoch", Event.timestamp) / interval_seconds)
            * interval_seconds
        )
        time_counts = (
            db.session.query(
                time_bucket.label("time_bucket"), func.count(Event.id).label("count")
            )
            .filter(Event.timestamp >= start_time, Event.event_type != 'keepalive')
            .group_by(time_bucket)
            .order_by(time_bucket)
            .all()
        )
    else:
        # Standard date_trunc grouping
        time_counts = (
            db.session.query(
                func.date_trunc(trunc_unit, Event.timestamp).label("time_bucket"),
                func.count(Event.id).label("count"),
            )
            .filter(Event.timestamp >= start_time, Event.event_type != 'keepalive')
            .group_by("time_bucket")
            .order_by("time_bucket")
            .all()
        )

    # Format results based on timeframe
    hourly = []
    for t, c in time_counts:
        if trunc_unit == "day":
            hourly.append({"hour": t.strftime("%Y-%m-%d"), "count": c})
        elif trunc_unit == "hour" and timeframe == "7d":
            hourly.append({"hour": t.strftime("%m-%d %H:%M"), "count": c})
        else:
            hourly.append({"hour": t.strftime("%H:%M"), "count": c})

    # Daily counts by severity (for longer timeframes)
    daily = {}
    if timeframe in ["7d", "30d"]:
        daily_severity = (
            db.session.query(
                func.date_trunc("day", Event.timestamp).label("day"),
                Event.severity,
                func.count(Event.id).label("count"),
            )
            .filter(Event.timestamp >= start_time, Event.event_type != 'keepalive')
            .group_by("day", Event.severity)
            .order_by("day")
            .all()
        )

        for day, severity, count in daily_severity:
            day_str = day.isoformat()[:10]
            if day_str not in daily:
                daily[day_str] = {
                    "date": day_str,
                    "critical": 0,
                    "high": 0,
                    "medium": 0,
                    "low": 0,
                }
            daily[day_str][severity.value] = count

    return jsonify(
        {"hourly": hourly, "daily": list(daily.values()), "timeframe": timeframe}
    )


@dashboard_bp.route("/dashboard/heatmap", methods=["GET"])
def get_heatmap():
    """Get event activity heatmap — count by date × hour-of-day."""
    days = request.args.get("days", 30, type=int)

    # We want to get the last N days including today, starting at midnight
    now = datetime.utcnow()
    since = now - timedelta(days=days - 1)
    since = since.replace(hour=0, minute=0, second=0, microsecond=0)

    # Note: EventSeverity values are typically lowercase like 'critical', 'high'
    results = (
        db.session.query(
            func.date_trunc("day", Event.timestamp).label("date"),
            func.extract("hour", Event.timestamp).label("hour"),
            func.count(Event.id).label("count"),
            func.sum(
                case((Event.severity == EventSeverity.CRITICAL, 1), else_=0)
            ).label("critical"),
            func.sum(case((Event.severity == EventSeverity.HIGH, 1), else_=0)).label(
                "high"
            ),
            func.sum(case((Event.severity == EventSeverity.MEDIUM, 1), else_=0)).label(
                "medium"
            ),
            func.sum(case((Event.severity == EventSeverity.LOW, 1), else_=0)).label(
                "low"
            ),
        )
        .filter(Event.timestamp >= since, Event.event_type != 'keepalive')
        .group_by("date", "hour")
        .all()
    )

    data = [
        {
            "date": r.date.strftime("%Y-%m-%d"),
            "hour": int(r.hour),
            "count": r.count,
            "critical": int(r.critical) if r.critical else 0,
            "high": int(r.high) if r.high else 0,
            "medium": int(r.medium) if r.medium else 0,
            "low": int(r.low) if r.low else 0,
        }
        for r in results
    ]
    return jsonify({"heatmap": data, "days": days})


@dashboard_bp.route("/dashboard/top-ips", methods=["GET"])
def get_top_ips():
    """Get top source IPs by event count (from JSONB metadata)."""
    hours = request.args.get("hours", 24, type=int)
    since = datetime.utcnow() - timedelta(hours=hours)

    ip_field = Event.event_metadata["source_ip"].astext

    results = (
        db.session.query(
            ip_field.label("ip"),
            func.count(Event.id).label("count"),
            func.sum(
                case((Event.severity == EventSeverity.CRITICAL, 1), else_=0)
            ).label("critical"),
            func.sum(case((Event.severity == EventSeverity.HIGH, 1), else_=0)).label(
                "high"
            ),
        )
        .filter(
            Event.timestamp >= since,
            Event.event_type != 'keepalive',
            ip_field.isnot(None),
            ip_field != "null",
            ip_field != "",
        )
        .group_by(ip_field)
        .order_by(func.count(Event.id).desc())
        .limit(10)
        .all()
    )

    return jsonify(
        {
            "top_ips": [
                {
                    "ip": r.ip,
                    "count": r.count,
                    "critical": int(r.critical),
                    "high": int(r.high),
                }
                for r in results
            ]
        }
    )


@dashboard_bp.route("/dashboard/source-details", methods=["GET"])
def get_source_details():
    """Per-source live stats: last signal, EPS, 24h count, top event type, active sites."""
    now = datetime.utcnow()
    last_24h = now - timedelta(hours=24)
    last_60s = now - timedelta(seconds=60)
    active_sources = [
        EventSource.FIREWALL,
        EventSource.IDS,
        EventSource.ENDPOINT,
        EventSource.APPLICATION,
    ]

    # GLPI reachability check — uses 30-second cache to avoid blocking on every request
    glpi_alive = _glpi_alive()

    result = {}
    for src in active_sources:
        # Last security event timestamp (keepalives excluded)
        last_row = (
            db.session.query(func.max(Event.timestamp))
            .filter(Event.source == src, Event.event_type != 'keepalive')
            .scalar()
        )
        # Last keepalive timestamp
        keepalive_row = (
            db.session.query(func.max(Event.timestamp))
            .filter(Event.source == src, Event.event_type == 'keepalive')
            .scalar()
        )
        # For GLPI: override keepalive with real-time HTTP check
        if src == EventSource.APPLICATION:
            keepalive_row = now if glpi_alive else None

        # Security events in last 60s (keepalives excluded)
        eps_count = (
            db.session.query(func.count(Event.id))
            .filter(Event.source == src, Event.timestamp >= last_60s, Event.event_type != 'keepalive')
            .scalar()
            or 0
        )
        # Security events in last 24h (keepalives excluded)
        count_24h = (
            db.session.query(func.count(Event.id))
            .filter(Event.source == src, Event.timestamp >= last_24h, Event.event_type != 'keepalive')
            .scalar()
            or 0
        )
        # Most common security event_type in last 24h (keepalives excluded)
        top_type_row = (
            db.session.query(Event.event_type, func.count(Event.id).label("n"))
            .filter(Event.source == src, Event.timestamp >= last_24h, Event.event_type != 'keepalive')
            .group_by(Event.event_type)
            .order_by(func.count(Event.id).desc())
            .first()
        )
        top_event_type = top_type_row[0] if top_type_row else None
        # Active sites (distinct) in last 24h (keepalives excluded)
        active_sites = (
            db.session.query(func.count(func.distinct(Event.site_id)))
            .filter(Event.source == src, Event.timestamp >= last_24h, Event.event_type != 'keepalive')
            .scalar()
            or 0
        )

        result[src.value] = {
            "last_event_at": (last_row.isoformat() + 'Z') if last_row else None,
            "last_keepalive_at": (keepalive_row.isoformat() + 'Z') if keepalive_row else None,
            "events_last_60s": eps_count,
            "events_24h": count_24h,
            "top_event_type": top_event_type,
            "active_sites": active_sites,
        }

    return jsonify({"sources": result})


@dashboard_bp.route("/dashboard/sites", methods=["GET"])
def get_sites_summary():
    """Get summary by site (for multi-site audioprothésistes network)."""
    last_24h = datetime.utcnow() - timedelta(hours=24)

    # Only unresolved events in the last 24h — used to derive endpoint status
    site_stats = (
        db.session.query(
            Event.site_id, Event.severity, func.count(Event.id).label("count")
        )
        .filter(
            Event.site_id.isnot(None),
            Event.timestamp >= last_24h,
            Event.event_type != 'keepalive',
            Event.status.in_([EventStatus.NEW, EventStatus.INVESTIGATING]),
        )
        .group_by(Event.site_id, Event.severity)
        .all()
    )

    # Organize by site
    sites = {}
    for site_id, severity, count in site_stats:
        if site_id not in sites:
            sites[site_id] = {
                "site_id": site_id,
                "total": 0,
                "critical": 0,
                "high": 0,
                "medium": 0,
                "low": 0,
            }
        sites[site_id][severity.value] = count
        sites[site_id]["total"] += count

    # Sort by total events descending
    sorted_sites = sorted(sites.values(), key=lambda x: x["total"], reverse=True)

    return jsonify({"sites": sorted_sites})
