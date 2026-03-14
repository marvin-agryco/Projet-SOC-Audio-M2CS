import uuid
import enum
from datetime import datetime
from sqlalchemy.dialects.postgresql import UUID, JSONB
from sqlalchemy.orm.attributes import flag_modified
from app import db


class PlaybookStatus(enum.Enum):
    ACTIVE = 'active'
    DRAFT = 'draft'
    ARCHIVED = 'archived'


class PlaybookTrigger(enum.Enum):
    MANUAL = 'manual'
    ALERT_RULE = 'alert_rule'
    SCHEDULED = 'scheduled'


class PlaybookCategory(enum.Enum):
    INCIDENT = 'incident'
    INVESTIGATION = 'investigation'
    REMEDIATION = 'remediation'
    COMPLIANCE = 'compliance'


class ExecutionStatus(enum.Enum):
    IN_PROGRESS = 'in_progress'
    COMPLETED = 'completed'
    ABORTED = 'aborted'
    FAILED = 'failed'


class Playbook(db.Model):
    """Security response playbook template."""
    __tablename__ = 'playbooks'

    id = db.Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    name = db.Column(db.String(200), nullable=False)
    description = db.Column(db.Text, default='')

    status = db.Column(db.Enum(PlaybookStatus), nullable=False, default=PlaybookStatus.DRAFT)
    trigger = db.Column(db.Enum(PlaybookTrigger), nullable=False, default=PlaybookTrigger.MANUAL)
    trigger_config = db.Column(JSONB, default=dict)
    category = db.Column(db.Enum(PlaybookCategory), nullable=False, default=PlaybookCategory.INCIDENT)

    # Steps stored as JSONB array
    # Each step: {id, order, name, type, description, config}
    steps = db.Column(JSONB, default=list)

    created_at = db.Column(db.DateTime, default=datetime.utcnow)
    updated_at = db.Column(db.DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)

    # Denormalized stats — updated on execute/complete to avoid O(N) queries on every GET
    run_count = db.Column(db.Integer, default=0, nullable=False)
    last_run_at = db.Column(db.DateTime, nullable=True)
    avg_duration_seconds = db.Column(db.Float, nullable=True)

    # Relationship to executions
    executions = db.relationship('PlaybookExecution', backref='playbook', lazy='dynamic')

    @property
    def triggered_count(self):
        return self.run_count or 0

    @property
    def last_run(self):
        return self.last_run_at

    @property
    def avg_duration(self):
        if not self.avg_duration_seconds:
            return None
        s = self.avg_duration_seconds
        if s < 60:
            return f"{int(s)}s"
        elif s < 3600:
            return f"{int(s / 60)}m"
        else:
            return f"{int(s / 3600)}h"

    def to_dict(self) -> dict:
        return {
            'id': str(self.id),
            'name': self.name,
            'description': self.description,
            'status': self.status.value,
            'trigger': self.trigger.value,
            'triggerConfig': self.trigger_config or {},
            'category': self.category.value,
            'steps': self.steps or [],
            'triggeredCount': self.triggered_count,
            'avgDuration': self.avg_duration,
            'lastRun': self.last_run.isoformat() if self.last_run else None,
            'createdAt': self.created_at.isoformat() if self.created_at else None,
        }


class PlaybookExecution(db.Model):
    """Individual execution/run of a playbook."""
    __tablename__ = 'playbook_executions'

    id = db.Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    playbook_id = db.Column(UUID(as_uuid=True), db.ForeignKey('playbooks.id'), nullable=False)

    # Optional link to triggering alert/event
    triggered_by_alert_id = db.Column(UUID(as_uuid=True), nullable=True)
    triggered_by_event_id = db.Column(UUID(as_uuid=True), nullable=True)

    status = db.Column(db.Enum(ExecutionStatus), nullable=False, default=ExecutionStatus.IN_PROGRESS)

    # Who started this execution
    started_by = db.Column(db.String(100), default='system')

    # Steps data with execution status for each step
    # Each step: {id, order, name, type, description, config, status, started_at, completed_at, result}
    steps_data = db.Column(JSONB, default=list)

    # Current step index (for resuming)
    current_step = db.Column(db.Integer, default=0)

    started_at = db.Column(db.DateTime, default=datetime.utcnow)
    completed_at = db.Column(db.DateTime, nullable=True)

    # Execution result/notes
    result = db.Column(db.Text, nullable=True)

    def to_dict(self) -> dict:
        return {
            'id': str(self.id),
            'playbookId': str(self.playbook_id),
            'playbookName': self.playbook.name if self.playbook else None,
            'triggeredByAlertId': str(self.triggered_by_alert_id) if self.triggered_by_alert_id else None,
            'triggeredByEventId': str(self.triggered_by_event_id) if self.triggered_by_event_id else None,
            'status': self.status.value,
            'startedBy': self.started_by,
            'stepsData': self.steps_data or [],
            'currentStep': self.current_step,
            'startedAt': self.started_at.isoformat() if self.started_at else None,
            'completedAt': self.completed_at.isoformat() if self.completed_at else None,
            'result': self.result,
        }

    def update_step(self, step_index: int, status: str, result: str = None):
        """Update a specific step's status."""
        if self.steps_data and 0 <= step_index < len(self.steps_data):
            self.steps_data[step_index]['status'] = status
            if status == 'running':
                self.steps_data[step_index]['started_at'] = datetime.utcnow().isoformat()
            elif status in ('completed', 'failed', 'skipped'):
                self.steps_data[step_index]['completed_at'] = datetime.utcnow().isoformat()
            if result:
                self.steps_data[step_index]['result'] = result
            self.current_step = step_index
            flag_modified(self, 'steps_data')
