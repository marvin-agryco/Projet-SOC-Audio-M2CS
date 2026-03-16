import uuid
import enum
from datetime import datetime
from sqlalchemy.dialects.postgresql import UUID, JSONB
from app import db


class TriageBriefStatus(enum.Enum):
    PENDING    = 'pending'
    GENERATING = 'generating'
    READY      = 'ready'
    ACCEPTED   = 'accepted'
    EDITED     = 'edited'
    DISMISSED  = 'dismissed'
    FAILED     = 'failed'


class TriageBrief(db.Model):
    """AI-generated triage brief for a security incident.

    State machine:
        PENDING → GENERATING → READY → ACCEPTED / EDITED / DISMISSED
                             └──────→ FAILED (Regenerate → new PENDING brief)

    Multiple briefs per incident are allowed (history preserved on Regenerate).
    """
    __tablename__ = 'triage_briefs'

    id = db.Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    incident_id = db.Column(
        UUID(as_uuid=True),
        db.ForeignKey('incidents.id', ondelete='CASCADE'),
        nullable=False,
        index=True,
    )
    status = db.Column(
        db.Enum(TriageBriefStatus),
        nullable=False,
        default=TriageBriefStatus.PENDING,
        index=True,
    )

    # LLM output
    threat_hypothesis  = db.Column(db.Text, nullable=True)
    confidence         = db.Column(db.Integer, nullable=True)   # 0-100
    mitre_tactics      = db.Column(JSONB, default=list)          # list[str] stored as JSON
    recommended_action = db.Column(db.Text, nullable=True)

    # Raw IP enrichment data (VT + AbuseIPDB) — stored for future IP reputation card
    ip_enrichment = db.Column(JSONB, default=dict)

    # Analyst interaction
    analyst_notes  = db.Column(db.Text, nullable=True)
    analyst_action = db.Column(db.String(20), nullable=True)   # 'accepted'|'edited'|'dismissed'
    reviewed_by    = db.Column(db.String(100), nullable=True)
    reviewed_at    = db.Column(db.DateTime, nullable=True)

    # Generation metadata
    model_used         = db.Column(db.String(100), default='qwen2.5:1.5b')
    generation_seconds = db.Column(db.Float, nullable=True)
    error_message      = db.Column(db.Text, nullable=True)
    generated_at       = db.Column(db.DateTime, nullable=True)
    created_at         = db.Column(db.DateTime, default=datetime.utcnow)

    incident = db.relationship(
        'Incident',
        backref=db.backref('triage_briefs', lazy='dynamic'),
    )

    def to_dict(self) -> dict:
        return {
            'id':                 str(self.id),
            'incident_id':        str(self.incident_id),
            'status':             self.status.value,
            'threat_hypothesis':  self.threat_hypothesis,
            'confidence':         self.confidence,
            'mitre_tactics':      self.mitre_tactics or [],
            'recommended_action': self.recommended_action,
            'ip_enrichment':      self.ip_enrichment or {},
            'analyst_notes':      self.analyst_notes,
            'analyst_action':     self.analyst_action,
            'reviewed_by':        self.reviewed_by,
            'reviewed_at':        self.reviewed_at.isoformat() + 'Z' if self.reviewed_at else None,
            'model_used':         self.model_used,
            'generation_seconds': self.generation_seconds,
            'error_message':      self.error_message,
            'generated_at':       self.generated_at.isoformat() + 'Z' if self.generated_at else None,
            'created_at':         self.created_at.isoformat() + 'Z' if self.created_at else None,
        }
