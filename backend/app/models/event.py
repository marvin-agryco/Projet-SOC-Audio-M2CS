import uuid
import enum
from datetime import datetime, timezone
from sqlalchemy.dialects.postgresql import UUID, JSONB
from app import db


def _utcnow() -> datetime:
    return datetime.now(timezone.utc).replace(tzinfo=None)


class EventSeverity(enum.Enum):
    CRITICAL = "critical"
    HIGH = "high"
    MEDIUM = "medium"
    LOW = "low"


class EventStatus(enum.Enum):
    NEW = "new"
    INVESTIGATING = "investigating"
    RESOLVED = "resolved"
    FALSE_POSITIVE = "false_positive"


class EventSource(enum.Enum):
    FIREWALL = "firewall"
    IDS = "ids"
    ENDPOINT = "endpoint"
    NETWORK = "network"
    EMAIL = "email"
    ACTIVE_DIRECTORY = "active_directory"
    APPLICATION = "application"


class Event(db.Model):
    """Security event model - core entity for SOC monitoring."""

    __tablename__ = "events"

    id = db.Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    timestamp = db.Column(db.DateTime, nullable=False, default=_utcnow)
    source = db.Column(db.Enum(EventSource), nullable=False, index=True)
    event_type = db.Column(db.String(100), nullable=False, index=True)
    severity = db.Column(db.Enum(EventSeverity), nullable=False, index=True)
    description = db.Column(db.Text, nullable=False)
    raw_log = db.Column(db.Text)
    event_metadata = db.Column("metadata", JSONB, default={})
    status = db.Column(
        db.Enum(EventStatus), nullable=False, default=EventStatus.NEW, index=True
    )
    assigned_to = db.Column(db.String(100))
    site_id = db.Column(db.String(50), index=True)  # For multi-site (audioprothésistes)
    created_at = db.Column(db.DateTime, default=_utcnow)
    updated_at = db.Column(
        db.DateTime, default=_utcnow, onupdate=_utcnow
    )
    incident_id = db.Column(
        UUID(as_uuid=True),
        db.ForeignKey("incidents.id", ondelete="SET NULL"),
        nullable=True,
        index=True,
    )

    def to_dict(self) -> dict:
        """Serialize event to dictionary."""
        return {
            "id": str(self.id),
            "timestamp": self.timestamp.isoformat() + "Z",
            "source": self.source.value,
            "event_type": self.event_type,
            "severity": self.severity.value,
            "description": self.description,
            "raw_log": self.raw_log,
            "metadata": self.event_metadata,
            "status": self.status.value,
            "assigned_to": self.assigned_to,
            "site_id": self.site_id,
            "incident_id": str(self.incident_id) if self.incident_id else None,
            "created_at": self.created_at.isoformat(),
            "updated_at": self.updated_at.isoformat() if self.updated_at else None,
        }

    @classmethod
    def from_dict(cls, data: dict) -> "Event":
        """Create event from dictionary."""
        event = cls()
        event.source = EventSource(data["source"])
        event.event_type = data["event_type"]
        event.severity = EventSeverity(data["severity"])
        event.description = data["description"]

        if "timestamp" in data:
            event.timestamp = datetime.fromisoformat(data["timestamp"])
        else:
            event.timestamp = _utcnow()

        if "raw_log" in data:
            event.raw_log = data["raw_log"]

        if "metadata" in data:
            event.event_metadata = data["metadata"]

        if "site_id" in data:
            event.site_id = data["site_id"]

        if "incident_id" in data:
            event.incident_id = data["incident_id"]

        return event
