import uuid
import enum
from datetime import datetime
from sqlalchemy.dialects.postgresql import UUID, JSONB
from app import db


class AlertAction(enum.Enum):
    EMAIL = 'email'
    WEBHOOK = 'webhook'
    LOG = 'log'


class AlertRule(db.Model):
    """Alert rule for automated detection and notification."""
    __tablename__ = 'alert_rules'

    id = db.Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    name = db.Column(db.String(200), nullable=False)
    description = db.Column(db.Text)
    enabled = db.Column(db.Boolean, default=True)

    # Condition configuration
    condition = db.Column(JSONB, nullable=False)
    # Example: {"event_type": "auth_failure", "count": 5, "timeframe": "10m", "source": "any"}

    # Action configuration
    action = db.Column(db.Enum(AlertAction), nullable=False, default=AlertAction.LOG)
    action_config = db.Column(JSONB, default={})
    # Example for email: {"recipients": ["admin@example.com"]}
    # Example for webhook: {"url": "https://hooks.slack.com/..."}

    severity = db.Column(db.String(20), nullable=False, default='high')
    created_at = db.Column(db.DateTime, default=datetime.utcnow)
    updated_at = db.Column(db.DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)
    last_triggered = db.Column(db.DateTime)
    trigger_count = db.Column(db.Integer, default=0)

    def to_dict(self) -> dict:
        """Serialize rule to dictionary."""
        return {
            'id': str(self.id),
            'name': self.name,
            'description': self.description,
            'enabled': self.enabled,
            'condition': self.condition,
            'action': self.action.value,
            'action_config': self.action_config,
            'severity': self.severity,
            'created_at': self.created_at.isoformat() + 'Z' if self.created_at else None,
            'last_triggered': self.last_triggered.isoformat() + 'Z' if self.last_triggered else None,
            'trigger_count': self.trigger_count
        }
