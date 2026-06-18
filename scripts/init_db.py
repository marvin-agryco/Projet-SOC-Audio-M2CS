#!/usr/bin/env python3
"""
Database initialization script.
Creates tables and optionally seeds with demo data.
"""

import sys
import os

# Add backend to path
sys.path.insert(0, os.path.join(os.path.dirname(__file__), '..', 'backend'))

from app import create_app, db
from app.models import Event, AlertRule, User, UserRole, AlertAction


def init_database():
    """Initialize database tables."""
    app = create_app()

    with app.app_context():
        print("Creating database tables...")
        db.create_all()
        print("Database tables created successfully!")


def seed_demo_data():
    """Seed database with demo data."""
    app = create_app()

    with app.app_context():
        print("Seeding demo data...")

        # Create demo users
        # Create demo users
        users = [
            {"username": "admin", "email": "admin@audiopro.fr", "password": "admin123", "role": UserRole.ADMIN},
            {"username": "analyst", "email": "analyst@audiopro.fr", "password": "analyst123", "role": UserRole.ANALYST},
            {"username": "supervisor", "email": "supervisor@audiopro.fr", "password": "supervisor123", "role": UserRole.SUPERVISOR},
        ]

        for user_data in users:
            existing = User.query.filter_by(username=user_data["username"]).first()
            if not existing:
                user = User(
                    username=user_data["username"],
                    email=user_data["email"],
                    role=user_data["role"]
                )
                user.set_password(user_data["password"])
                db.session.add(user)
                print(f"  Created user: {user_data['username']}")

        # Create demo alert rules
        rules = [
            {
                "name": "Multiple Failed Logins",
                "description": "Alert when 5+ authentication failures in 10 minutes",
                "condition": {"event_type": "auth_failure", "count": 5, "timeframe": "10m"},
                "action": AlertAction.LOG,
                "severity": "high"
            },
            {
                "name": "Malware Detection",
                "description": "Immediate alert on malware detection",
                "condition": {"event_type": "malware_detected", "count": 1, "timeframe": "1h"},
                "action": AlertAction.EMAIL,
                "severity": "critical"
            },
            {
                "name": "Privilege Escalation",
                "description": "Alert on privilege escalation attempts",
                "condition": {"event_type": "privilege_escalation", "count": 1, "timeframe": "1h"},
                "action": AlertAction.WEBHOOK,
                "severity": "critical"
            },
            {
                "name": "Port Scan Detection",
                "description": "Alert when port scanning detected",
                "condition": {"event_type": "port_scan", "count": 3, "timeframe": "5m"},
                "action": AlertAction.LOG,
                "severity": "high"
            },
            {
                "name": "USB Device Alert",
                "description": "Alert on unauthorized USB device connections",
                "condition": {"event_type": "usb_device", "count": 1, "timeframe": "24h", "source": "endpoint"},
                "action": AlertAction.LOG,
                "severity": "medium"
            },
        ]

        for rule_data in rules:
            existing = AlertRule.query.filter_by(name=rule_data["name"]).first()
            if not existing:
                rule = AlertRule(**rule_data)
                db.session.add(rule)
                print(f"  Created rule: {rule_data['name']}")

        db.session.commit()
        print("Demo data seeded successfully!")


if __name__ == "__main__":
    init_database()

    if len(sys.argv) > 1 and sys.argv[1] == "--seed":
        seed_demo_data()
