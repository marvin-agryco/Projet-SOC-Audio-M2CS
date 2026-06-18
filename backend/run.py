#!/usr/bin/env python3
"""Entry point for running the SOC Dashboard backend."""

from app import create_app, socketio, init_demo_users, init_demo_alert_rules, init_demo_playbooks

app = create_app()

if __name__ == "__main__":
    from migrate_db import apply_migrations

    apply_migrations()

    with app.app_context():
        init_demo_users()
        init_demo_alert_rules()
        init_demo_playbooks()

    socketio.run(
        app,
        host="0.0.0.0",
        port=5000,
        debug=app.config["DEBUG"],
        allow_unsafe_werkzeug=True,  # enables threaded Werkzeug dev server
    )
