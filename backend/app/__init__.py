import os
from flask import Flask
from flask_sqlalchemy import SQLAlchemy
from flask_migrate import Migrate
from flask_cors import CORS
from flask_socketio import SocketIO

from config import config

db = SQLAlchemy()
migrate = Migrate()
socketio = SocketIO(cors_allowed_origins="*")


def init_demo_users():
    """Create demo users if they don't exist."""
    from app.models.user import User, UserRole

    demo_users = [
        {'username': 'admin', 'email': 'admin@audiopro.fr', 'password': 'admin123', 'role': UserRole.ADMIN},
        {'username': 'analyst', 'email': 'analyst@audiopro.fr', 'password': 'analyst123', 'role': UserRole.ANALYST},
        {'username': 'supervisor', 'email': 'supervisor@audiopro.fr', 'password': 'supervisor123', 'role': UserRole.SUPERVISOR},
    ]

    created = 0
    for user_data in demo_users:
        if not User.query.filter_by(username=user_data['username']).first():
            user = User(
                username=user_data['username'],
                email=user_data['email'],
                role=user_data['role']
            )
            user.set_password(user_data['password'])
            db.session.add(user)
            created += 1

    if created > 0:
        db.session.commit()
        print(f"✓ Created {created} demo users (admin, analyst, supervisor)")

    return created


def create_app(config_name: str = None) -> Flask:
    """Application factory."""
    if config_name is None:
        config_name = os.getenv('FLASK_ENV', 'development')

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

    app.register_blueprint(events_bp, url_prefix='/api')
    app.register_blueprint(dashboard_bp, url_prefix='/api')
    app.register_blueprint(alerts_bp, url_prefix='/api')
    app.register_blueprint(ingest_bp, url_prefix='/api')
    app.register_blueprint(endpoints_bp, url_prefix='/api')
    app.register_blueprint(auth_bp, url_prefix='/api')

    # Health check
    @app.route('/health')
    def health():
        return {'status': 'healthy'}

    return app
