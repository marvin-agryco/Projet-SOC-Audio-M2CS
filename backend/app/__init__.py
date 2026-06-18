import os
from flask import Flask
from flask_sqlalchemy import SQLAlchemy
from flask_migrate import Migrate
from flask_cors import CORS
from flask_socketio import SocketIO

from config import config

db = SQLAlchemy()
migrate = Migrate()
socketio = SocketIO(cors_allowed_origins="*", async_mode="threading")


def init_demo_users():
    """Create demo users if they don't exist."""
    from app.models.user import User, UserRole

    demo_users = [
        {
            "username": "admin",
            "email": "admin@audiopro.fr",
            "password": "admin123",
            "role": UserRole.ADMIN,
        },
        {
            "username": "analyst",
            "email": "analyst@audiopro.fr",
            "password": "analyst123",
            "role": UserRole.ANALYST,
        },
        {
            "username": "supervisor",
            "email": "supervisor@audiopro.fr",
            "password": "supervisor123",
            "role": UserRole.SUPERVISOR,
        },
    ]

    created = 0
    for user_data in demo_users:
        if not User.query.filter_by(username=user_data["username"]).first():
            user = User(
                username=user_data["username"],
                email=user_data["email"],
                role=user_data["role"],
            )
            user.set_password(user_data["password"])
            db.session.add(user)
            created += 1

    if created > 0:
        db.session.commit()
        print(f"✓ Created {created} demo users (admin, analyst, supervisor)")

    return created


def init_demo_alert_rules():
    """Seed default alert rules so correlation triggers incidents during the demo."""
    from app.models.alert_rule import AlertRule, AlertAction

    demo_rules = [
        {
            "name": "SSH Brute Force Detected",
            "description": "Multiple failed authentication attempts in a short window — likely brute force.",
            "condition": {"event_type": "auth_failure", "count": 2, "timeframe": "2m"},
            "severity": "high",
        },
        {
            "name": "Port Scan Detected",
            "description": "Repeated port scan activity from an external host.",
            "condition": {"event_type": "port_scan", "count": 2, "timeframe": "5m"},
            "severity": "high",
        },
        {
            "name": "Malware Detected",
            "description": "Malicious payload identified on a monitored host.",
            "condition": {"event_type": "malware_detected", "count": 1, "timeframe": "10m"},
            "severity": "critical",
        },
        {
            "name": "Privilege Escalation Attempt",
            "description": "Privilege escalation attempt detected on an endpoint.",
            "condition": {"event_type": "privilege_escalation", "count": 1, "timeframe": "10m"},
            "severity": "critical",
        },
        {
            "name": "Suspicious Outbound Traffic",
            "description": "Unusual outbound data transfer — possible C2 / exfiltration.",
            "condition": {"event_type": "intrusion_attempt", "count": 1, "timeframe": "10m"},
            "severity": "critical",
        },
    ]

    created = 0
    for rule_data in demo_rules:
        if not AlertRule.query.filter_by(name=rule_data["name"]).first():
            rule = AlertRule(
                name=rule_data["name"],
                description=rule_data["description"],
                condition=rule_data["condition"],
                severity=rule_data["severity"],
                action=AlertAction.LOG,
                action_config={},
                enabled=True,
            )
            db.session.add(rule)
            created += 1

    if created > 0:
        db.session.commit()
        print(f"✓ Created {created} demo alert rules")

    return created


def init_demo_playbooks():
    """Seed default response playbooks so analysts can trigger them from incidents."""
    from app.models.playbook import (
        Playbook,
        PlaybookStatus,
        PlaybookTrigger,
        PlaybookCategory,
    )

    demo_playbooks = [
        {
            "name": "Brute Force Response",
            "description": "Standard response for brute-force authentication attacks: identify, block, rotate, document.",
            "category": PlaybookCategory.INCIDENT,
            "steps": [
                {
                    "id": "step-1",
                    "order": 0,
                    "name": "Identify source IP",
                    "type": "manual",
                    "description": "Confirm the offending source IP from correlated events.",
                    "config": {},
                },
                {
                    "id": "step-2",
                    "order": 1,
                    "name": "Block IP at firewall",
                    "type": "manual",
                    "description": "Push a block rule for the source IP on the perimeter firewall.",
                    "config": {"action_type": "block_ip", "target": "{{alert.src_ip}}"},
                },
                {
                    "id": "step-3",
                    "order": 2,
                    "name": "Reset compromised user credentials",
                    "type": "manual",
                    "description": "Force a password reset for the targeted account and revoke active sessions.",
                    "config": {},
                },
                {
                    "id": "step-4",
                    "order": 3,
                    "name": "Notify SOC team",
                    "type": "manual",
                    "description": "Send a summary to the SOC channel with timeline and actions taken.",
                    "config": {},
                },
                {
                    "id": "step-5",
                    "order": 4,
                    "name": "Document and close",
                    "type": "manual",
                    "description": "Record the incident in the case file and close if no follow-up needed.",
                    "config": {},
                },
            ],
        },
        {
            "name": "Port Scan Response",
            "description": "Triage and contain reconnaissance activity from external scanners.",
            "category": PlaybookCategory.INCIDENT,
            "steps": [
                {
                    "id": "step-1",
                    "order": 0,
                    "name": "Confirm scan pattern",
                    "type": "manual",
                    "description": "Validate the scan is hostile (not a known vuln scanner).",
                    "config": {},
                },
                {
                    "id": "step-2",
                    "order": 1,
                    "name": "Block source at firewall",
                    "type": "manual",
                    "description": "Add the scanner's IP/range to the firewall blocklist.",
                    "config": {},
                },
                {
                    "id": "step-3",
                    "order": 2,
                    "name": "Review IDS alerts for follow-up activity",
                    "type": "manual",
                    "description": "Check Suricata for any successful follow-up exploitation attempts.",
                    "config": {},
                },
                {
                    "id": "step-4",
                    "order": 3,
                    "name": "Close incident",
                    "type": "manual",
                    "description": "Document and close if no follow-up.",
                    "config": {},
                },
            ],
        },
        {
            "name": "Malware Containment",
            "description": "Isolate the host, collect artefacts, and restore from a clean baseline.",
            "category": PlaybookCategory.INCIDENT,
            "steps": [
                {
                    "id": "step-1",
                    "order": 0,
                    "name": "Isolate affected endpoint",
                    "type": "manual",
                    "description": "Quarantine the host from the network.",
                    "config": {},
                },
                {
                    "id": "step-2",
                    "order": 1,
                    "name": "Collect artefacts",
                    "type": "manual",
                    "description": "Capture memory dump, process tree, and recent file changes.",
                    "config": {},
                },
                {
                    "id": "step-3",
                    "order": 2,
                    "name": "Full malware scan",
                    "type": "manual",
                    "description": "Run a full AV scan and review IOC matches.",
                    "config": {},
                },
                {
                    "id": "step-4",
                    "order": 3,
                    "name": "Restore from clean baseline",
                    "type": "manual",
                    "description": "Reimage the host or restore from a known-good snapshot.",
                    "config": {},
                },
                {
                    "id": "step-5",
                    "order": 4,
                    "name": "Notify user and document",
                    "type": "manual",
                    "description": "Inform the affected user and finalize the case file.",
                    "config": {},
                },
            ],
        },
    ]

    created = 0
    for pb_data in demo_playbooks:
        if not Playbook.query.filter_by(name=pb_data["name"]).first():
            playbook = Playbook(
                name=pb_data["name"],
                description=pb_data["description"],
                status=PlaybookStatus.ACTIVE,
                trigger=PlaybookTrigger.MANUAL,
                category=pb_data["category"],
                steps=pb_data["steps"],
            )
            db.session.add(playbook)
            created += 1

    if created > 0:
        db.session.commit()
        print(f"✓ Created {created} demo playbooks")

    return created


def create_app(config_name: str = None) -> Flask:
    """Application factory."""
    if config_name is None:
        config_name = os.getenv("FLASK_ENV", "development")

    app = Flask(__name__)
    app.config.from_object(config[config_name])

    # Initialize extensions
    db.init_app(app)
    migrate.init_app(app, db)
    CORS(app)
    socketio.init_app(app)

    # Register blueprints
    from app.routes.events import events_bp
    from app.routes.dashboard import dashboard_bp
    from app.routes.alerts import alerts_bp
    from app.routes.ingest import ingest_bp
    from app.routes.endpoints import endpoints_bp
    from app.routes.auth import auth_bp
    from app.routes.playbooks import playbooks_bp
    from app.routes.assets import assets_bp
    from app.routes.incidents import incidents_bp
    from app.routes.triage import triage_bp

    app.register_blueprint(events_bp, url_prefix="/api")
    app.register_blueprint(dashboard_bp, url_prefix="/api")
    app.register_blueprint(alerts_bp, url_prefix="/api")
    app.register_blueprint(ingest_bp, url_prefix="/api")
    app.register_blueprint(endpoints_bp, url_prefix="/api")
    app.register_blueprint(auth_bp, url_prefix="/api")
    app.register_blueprint(playbooks_bp, url_prefix="/api")
    app.register_blueprint(assets_bp, url_prefix="/api")
    app.register_blueprint(incidents_bp, url_prefix="/api")
    app.register_blueprint(triage_bp, url_prefix="/api")

    # Health check
    @app.route("/health")
    def health():
        return {"status": "healthy"}

    return app
