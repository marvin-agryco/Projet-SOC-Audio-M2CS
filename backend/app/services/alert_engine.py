import re
from datetime import datetime, timedelta
from typing import Optional
from sqlalchemy import func
from app import db
from app.models import Event, AlertRule, EventSeverity


class AlertEngine:
    """
    Engine for evaluating alert rules against incoming events.
    Supports threshold-based and pattern-based rules.
    """

    def __init__(self):
        self.timeframe_pattern = re.compile(r"^(\d+)([smhd])$")

    def parse_timeframe(self, timeframe: str) -> Optional[timedelta]:
        """Parse timeframe string (e.g., '10m', '1h', '24h') to timedelta."""
        match = self.timeframe_pattern.match(timeframe)
        if not match:
            return None

        value = int(match.group(1))
        unit = match.group(2)

        if unit == "s":
            return timedelta(seconds=value)
        elif unit == "m":
            return timedelta(minutes=value)
        elif unit == "h":
            return timedelta(hours=value)
        elif unit == "d":
            return timedelta(days=value)
        return None

    def evaluate_rule(self, rule: AlertRule) -> list[Event]:
        """
        Evaluate a single alert rule.
        Returns a list of unassigned Events that met the condition.
        """
        condition = rule.condition
        if not condition:
            return []

        # Build query based on condition, ONLY finding unassigned events
        query = Event.query.filter(Event.incident_id.is_(None))

        # Filter by event type
        if event_type := condition.get("event_type"):
            if event_type != "any":
                query = query.filter(Event.event_type == event_type)

        # Filter by source
        if source := condition.get("source"):
            if source != "any":
                from app.models import EventSource

                try:
                    query = query.filter(Event.source == EventSource(source))
                except ValueError:
                    pass

        # Filter by severity
        if severity := condition.get("severity"):
            if severity != "any":
                try:
                    query = query.filter(Event.severity == EventSeverity(severity))
                except ValueError:
                    pass

        # Filter by timeframe.
        # If no timeframe (or "any") is specified, default to 1h to avoid
        # sweeping all historical unassigned events into a single incident.
        timeframe = condition.get("timeframe")
        if timeframe and timeframe != "any":
            delta = self.parse_timeframe(timeframe)
        else:
            delta = timedelta(hours=1)
        if delta:
            since = datetime.utcnow() - delta
            query = query.filter(Event.timestamp >= since)

        # Filter by site
        if site_id := condition.get("site_id"):
            if site_id != "any":
                query = query.filter(Event.site_id == site_id)

        # Check threshold
        threshold = condition.get("count", 1)
        unassigned_events = query.all()

        if len(unassigned_events) >= threshold:
            return unassigned_events
        return []

    def evaluate_all_rules(self) -> list:
        """
        Evaluate all enabled alert rules.
        Returns list of triggered rules with event details.
        """
        triggered = []
        rules = AlertRule.query.filter_by(enabled=True).all()

        for rule in rules:
            matching_events = self.evaluate_rule(rule)
            if matching_events:
                # Group these events into an incident
                incident_title = f"{rule.name} Triggered"
                incident = self._create_or_update_incident(
                    rule, matching_events, incident_title
                )

                triggered.append(
                    {
                        "rule": rule.to_dict(),
                        "incident": incident.to_dict(),
                        "triggered_at": datetime.utcnow().isoformat(),
                    }
                )

                # Update rule trigger stats
                rule.last_triggered = datetime.utcnow()
                rule.trigger_count = (rule.trigger_count or 0) + 1

        if triggered:
            db.session.commit()

        return triggered

    def _create_or_update_incident(
        self, rule: AlertRule, events: list[Event], title: str
    ):
        from app.models import Incident, IncidentStatus, IncidentSeverity

        # Time-bound the merge: only reuse incidents updated recently.
        # Bound = max(rule timeframe, 30 min) so quick-burst attacks group together
        # but stale incidents from past days/months don't act as event magnets.
        timeframe_str = (rule.condition or {}).get("timeframe")
        delta = self.parse_timeframe(timeframe_str) if timeframe_str and timeframe_str != "any" else None
        merge_window = max(delta, timedelta(minutes=30)) if delta else timedelta(minutes=30)
        merge_cutoff = datetime.utcnow() - merge_window

        existing_incident = (
            Incident.query.filter(
                Incident.alert_rule_id == rule.id,
                Incident.status.in_(
                    [
                        IncidentStatus.NEW,
                        IncidentStatus.OPEN,
                        IncidentStatus.INVESTIGATING,
                    ]
                ),
                Incident.updated_at >= merge_cutoff,
            )
            .order_by(Incident.updated_at.desc())
            .first()
        )

        event_ids = [e.id for e in events]

        if existing_incident:
            # Bulk-assign events to existing incident (one UPDATE vs N)
            Event.query.filter(Event.id.in_(event_ids)).update(
                {"incident_id": existing_incident.id},
                synchronize_session="fetch",
            )
            existing_incident.updated_at = datetime.utcnow()
            incident = existing_incident
        else:
            # Create new incident
            severity_map = {
                "critical": IncidentSeverity.CRITICAL,
                "high": IncidentSeverity.HIGH,
                "medium": IncidentSeverity.MEDIUM,
                "low": IncidentSeverity.LOW,
            }
            mapped_severity = severity_map.get(rule.severity, IncidentSeverity.MEDIUM)

            incident = Incident()
            incident.title = title
            incident.description = rule.description or f"Triggered by rule: {rule.name}"
            incident.severity = mapped_severity
            incident.status = IncidentStatus.NEW
            incident.alert_rule_id = rule.id

            db.session.add(incident)
            db.session.flush()  # get incident.id before bulk UPDATE

            Event.query.filter(Event.id.in_(event_ids)).update(
                {"incident_id": incident.id},
                synchronize_session="fetch",
            )

        return incident

    def check_event_against_rules(self, event: Event) -> list:
        """
        Check a single new event against all rules.
        Useful for immediate alerting on ingestion.
        """
        triggered = []
        rules = AlertRule.query.filter_by(enabled=True).all()

        for rule in rules:
            condition = rule.condition

            # Check if event matches rule criteria
            if event_type := condition.get("event_type"):
                if event_type != "any" and event.event_type != event_type:
                    continue

            if source := condition.get("source"):
                if source != "any" and event.source.value != source:
                    continue

            if severity := condition.get("severity"):
                if severity != "any" and event.severity.value != severity:
                    continue

            if site_id := condition.get("site_id"):
                if site_id != "any" and event.site_id != site_id:
                    continue

            # If we get here, event matches rule criteria
            # Now check if threshold is met
            if self.evaluate_rule(rule):
                triggered.append(rule)

        return triggered
