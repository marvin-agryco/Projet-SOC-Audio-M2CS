import uuid
import enum
from datetime import datetime
from sqlalchemy.dialects.postgresql import UUID
from app import db


class IncidentStatus(enum.Enum):
    NEW = "new"
    OPEN = "open"
    INVESTIGATING = "investigating"
    RESOLVED = "resolved"
    FALSE_POSITIVE = "false_positive"


class IncidentSeverity(enum.Enum):
    CRITICAL = "critical"
    HIGH = "high"
    MEDIUM = "medium"
    LOW = "low"


class Incident(db.Model):
    """Correlated security incident grouping multiple events."""

    __tablename__ = "incidents"

    id = db.Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    title = db.Column(db.String(200), nullable=False)
    description = db.Column(db.Text)

    status = db.Column(
        db.Enum(IncidentStatus), nullable=False, default=IncidentStatus.NEW, index=True
    )
    severity = db.Column(db.Enum(IncidentSeverity), nullable=False, index=True)

    # Track the rule that originally grouped this (optional)
    alert_rule_id = db.Column(
        UUID(as_uuid=True), db.ForeignKey("alert_rules.id"), nullable=True
    )
    alert_rule = db.relationship("AlertRule", backref="incidents")

    # Assignee
    assigned_to = db.Column(db.String(100))

    # Relationship to events
    events = db.relationship("Event", backref="incident", lazy="dynamic")

    created_at = db.Column(db.DateTime, default=datetime.utcnow)
    updated_at = db.Column(
        db.DateTime, default=datetime.utcnow, onupdate=datetime.utcnow
    )
    resolved_at = db.Column(db.DateTime, nullable=True)

    @property
    def event_count(self):
        return self.events.count()

    @classmethod
    def from_dict(cls, data: dict) -> "Incident":
        """Create incident from dictionary (e.g. from API payload)."""
        incident = cls()
        incident.title = data["title"]
        incident.severity = IncidentSeverity(data["severity"])
        if "description" in data:
            incident.description = data["description"]
        if "status" in data:
            incident.status = IncidentStatus(data["status"])
        if "assigned_to" in data:
            incident.assigned_to = data["assigned_to"]
        if "alert_rule_id" in data:
            incident.alert_rule_id = data["alert_rule_id"]
        return incident

    def to_dict(self) -> dict:
        """Serialize incident to dictionary."""
        return {
            "id": str(self.id),
            "title": self.title,
            "description": self.description,
            "status": self.status.value,
            "severity": self.severity.value,
            "alert_rule_id": str(self.alert_rule_id) if self.alert_rule_id else None,
            "assigned_to": self.assigned_to,
            "event_count": self.event_count,
            "created_at": self.created_at.isoformat() + "Z" if self.created_at else None,
            "updated_at": self.updated_at.isoformat() + "Z" if self.updated_at else None,
            "resolved_at": self.resolved_at.isoformat() + "Z" if self.resolved_at else None,
        }
