import os
import sys

from app import create_app, db


def apply_migrations():
    """
    Manually create new tables and run ALTER TABLE statements.
    This avoids needing Alembic for the prototype phase.
    """
    app = create_app()
    with app.app_context():
        # 1. Create missing tables (e.g. incidents)
        print("Creating any missing database tables...")
        db.create_all()

        # 2. Safely add incident_id to the events table
        from sqlalchemy import text
        from sqlalchemy.exc import ProgrammingError

        print("Checking if 'events' table needs 'incident_id' column...")
        with db.engine.connect() as conn:
            try:
                # Add the column and the foreign key relationship
                conn.execute(
                    text(
                        "ALTER TABLE events ADD COLUMN incident_id UUID REFERENCES incidents(id) ON DELETE SET NULL;"
                    )
                )
                # Add an index on the new column
                conn.execute(
                    text("CREATE INDEX ix_events_incident_id ON events (incident_id);")
                )
                conn.commit()
                print("Successfully added 'incident_id' column to 'events' table.")
            except ProgrammingError as e:
                # If column already exists, this throws an error.
                if "already exists" in str(e) or "DuplicateColumn" in str(e):
                    print(
                        "'incident_id' column already exists on 'events' table. Skipping."
                    )
                else:
                    print(f"Error checking/adding column: {e}")
                conn.rollback()

        print("Checking if 'playbooks' table needs denormalized stats columns...")
        with db.engine.connect() as conn:
            for col, definition in [
                ("run_count", "INTEGER NOT NULL DEFAULT 0"),
                ("last_run_at", "TIMESTAMP"),
                ("avg_duration_seconds", "FLOAT"),
            ]:
                try:
                    conn.execute(text(f"ALTER TABLE playbooks ADD COLUMN {col} {definition};"))
                    conn.commit()
                    print(f"Successfully added '{col}' column to 'playbooks' table.")
                except ProgrammingError as e:
                    if "already exists" in str(e) or "DuplicateColumn" in str(e):
                        print(f"'{col}' column already exists on 'playbooks' table. Skipping.")
                    else:
                        print(f"Error adding column '{col}': {e}")
                    conn.rollback()

        # Backfill run_count from actual executions for pre-existing playbooks
        print("Backfilling playbook run_count from execution history...")
        with db.engine.connect() as conn:
            try:
                conn.execute(text(
                    "UPDATE playbooks SET run_count = ("
                    "  SELECT COUNT(*) FROM playbook_executions"
                    "  WHERE playbook_executions.playbook_id = playbooks.id"
                    ") WHERE run_count = 0;"
                ))
                conn.commit()
                print("Backfilled playbook run_count.")
            except Exception as e:
                print(f"run_count backfill skipped: {e}")
                conn.rollback()


if __name__ == "__main__":
    apply_migrations()
