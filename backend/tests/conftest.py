import pytest
import sys

# Eventlet is broken in Python 3.13 threading tests. We force socketio to run synchronously for tests.
sys.modules["eventlet"] = type("MockEventlet", (), {})()

from app import create_app, db
from app.models import User, UserRole

# Monkey-patch SQLAlchemy's PostgreSQL UUID and JSONB for SQLite compatibility during tests
from sqlalchemy.dialects.postgresql import UUID, JSONB
from sqlalchemy.types import TypeDecorator, CHAR, TEXT
import json
import uuid


class StringUUID(TypeDecorator):
    impl = CHAR
    cache_ok = True

    def load_dialect_impl(self, dialect):
        return dialect.type_descriptor(CHAR(36))

    def process_bind_param(self, value, dialect):
        if value is None:
            return value
        elif isinstance(value, uuid.UUID):
            return str(value)
        else:
            return str(uuid.UUID(value))

    def process_result_value(self, value, dialect):
        if value is None:
            return value
        else:
            if not isinstance(value, uuid.UUID):
                value = uuid.UUID(value)
            return value


class SQLiteJSON(TypeDecorator):
    impl = TEXT
    cache_ok = True

    def process_bind_param(self, value, dialect):
        if value is not None:
            value = json.dumps(value)
        return value

    def process_result_value(self, value, dialect):
        if value is not None:
            value = json.loads(value)
        return value


import sqlalchemy.dialects.sqlite.base

sqlalchemy.dialects.sqlite.base.SQLiteTypeCompiler.visit_UUID = (
    lambda self, type_, **kw: "CHAR(36)"
)
sqlalchemy.dialects.sqlite.base.SQLiteTypeCompiler.visit_JSONB = (
    lambda self, type_, **kw: "TEXT"
)


@pytest.fixture
def app():
    """Create and configure a new app instance for each test."""
    # Use testing config instead of whatever env we are in
    app = create_app("testing")

    # We must mock config specifically for testing
    app.config.update(
        {
            "TESTING": True,
            "SQLALCHEMY_DATABASE_URI": "sqlite:///:memory:",
            "WTF_CSRF_ENABLED": False,
            "SERVER_NAME": "localhost.localdomain",
        }
    )

    with app.app_context():
        db.create_all()
        yield app
        db.session.remove()
        db.drop_all()


@pytest.fixture
def client(app):
    """A test client for the app."""
    return app.test_client()


@pytest.fixture
def runner(app):
    """A test runner for the app's click commands."""
    return app.test_cli_runner()


@pytest.fixture
def init_database(app):
    """Initialize database with basic testing data."""
    user = User(username="testadmin", email="admin@test.local", role=UserRole.ADMIN)
    user.set_password("password123")
    db.session.add(user)
    db.session.commit()
    return db
