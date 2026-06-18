from flask import Blueprint, request, jsonify
from functools import wraps
from datetime import datetime, timedelta
import jwt
import os

from app import db
from app.models.user import User, UserRole

auth_bp = Blueprint('auth', __name__)

# JWT Configuration
JWT_SECRET = os.getenv('JWT_SECRET', 'audiosoc-secret-key-change-in-production')
JWT_ALGORITHM = 'HS256'
JWT_EXPIRATION_HOURS = 24


def generate_token(user: User) -> str:
    """Generate JWT token for user."""
    payload = {
        'user_id': str(user.id),
        'username': user.username,
        'role': user.role.value,
        'exp': datetime.utcnow() + timedelta(hours=JWT_EXPIRATION_HOURS),
        'iat': datetime.utcnow()
    }
    return jwt.encode(payload, JWT_SECRET, algorithm=JWT_ALGORITHM)


def decode_token(token: str) -> dict:
    """Decode and validate JWT token."""
    try:
        return jwt.decode(token, JWT_SECRET, algorithms=[JWT_ALGORITHM])
    except jwt.ExpiredSignatureError:
        return None
    except jwt.InvalidTokenError:
        return None


def token_required(f):
    """Decorator to require valid JWT token."""
    @wraps(f)
    def decorated(*args, **kwargs):
        token = None

        # Get token from header
        if 'Authorization' in request.headers:
            auth_header = request.headers['Authorization']
            if auth_header.startswith('Bearer '):
                token = auth_header.split(' ')[1]

        if not token:
            return jsonify({'error': 'Token is missing'}), 401

        payload = decode_token(token)
        if not payload:
            return jsonify({'error': 'Token is invalid or expired'}), 401

        # Get user from database
        user = User.query.get(payload['user_id'])
        if not user or not user.is_active:
            return jsonify({'error': 'User not found or inactive'}), 401

        # Add user to request context
        request.current_user = user
        return f(*args, **kwargs)

    return decorated


def role_required(*roles):
    """Decorator to require specific roles."""
    def decorator(f):
        @wraps(f)
        def decorated(*args, **kwargs):
            if not hasattr(request, 'current_user'):
                return jsonify({'error': 'Authentication required'}), 401

            user_role = request.current_user.role
            if user_role not in [UserRole(r) for r in roles]:
                return jsonify({'error': 'Insufficient permissions'}), 403

            return f(*args, **kwargs)
        return decorated
    return decorator


@auth_bp.route('/auth/login', methods=['POST'])
def login():
    """Authenticate user and return JWT token."""
    data = request.get_json()

    if not data:
        return jsonify({'error': 'No data provided'}), 400

    username = data.get('username')
    password = data.get('password')

    if not username or not password:
        return jsonify({'error': 'Username and password required'}), 400

    # Find user
    user = User.query.filter_by(username=username).first()

    if not user or not user.check_password(password):
        return jsonify({'error': 'Invalid credentials'}), 401

    if not user.is_active:
        return jsonify({'error': 'Account is disabled'}), 401

    # Update last login
    user.last_login = datetime.utcnow()
    db.session.commit()

    # Generate token
    token = generate_token(user)

    return jsonify({
        'token': token,
        'user': user.to_dict(),
        'expires_in': JWT_EXPIRATION_HOURS * 3600
    })


@auth_bp.route('/auth/register', methods=['POST'])
def register():
    """Register a new user (admin only in production, open for demo)."""
    data = request.get_json()

    if not data:
        return jsonify({'error': 'No data provided'}), 400

    username = data.get('username')
    email = data.get('email')
    password = data.get('password')
    role = data.get('role', 'analyst')

    if not username or not email or not password:
        return jsonify({'error': 'Username, email, and password required'}), 400

    # Check if user exists
    if User.query.filter_by(username=username).first():
        return jsonify({'error': 'Username already exists'}), 409

    if User.query.filter_by(email=email).first():
        return jsonify({'error': 'Email already exists'}), 409

    # Create user
    try:
        user_role = UserRole(role)
    except ValueError:
        user_role = UserRole.ANALYST

    user = User(
        username=username,
        email=email,
        role=user_role
    )
    user.set_password(password)

    db.session.add(user)
    db.session.commit()

    return jsonify({
        'message': 'User created successfully',
        'user': user.to_dict()
    }), 201


@auth_bp.route('/auth/me', methods=['GET'])
@token_required
def get_current_user():
    """Get current authenticated user."""
    return jsonify(request.current_user.to_dict())


@auth_bp.route('/auth/refresh', methods=['POST'])
@token_required
def refresh_token():
    """Refresh JWT token."""
    token = generate_token(request.current_user)
    return jsonify({
        'token': token,
        'expires_in': JWT_EXPIRATION_HOURS * 3600
    })


@auth_bp.route('/auth/logout', methods=['POST'])
@token_required
def logout():
    """Logout user (client should discard token)."""
    return jsonify({'message': 'Logged out successfully'})


# Demo endpoint to create initial admin user
@auth_bp.route('/auth/init-demo', methods=['POST'])
def init_demo_users():
    """Initialize demo users (for development only)."""
    demo_users = [
        {'username': 'admin', 'email': 'admin@audiopro.fr', 'password': 'admin123', 'role': 'admin'},
        {'username': 'analyst', 'email': 'analyst@audiopro.fr', 'password': 'analyst123', 'role': 'analyst'},
        {'username': 'supervisor', 'email': 'supervisor@audiopro.fr', 'password': 'supervisor123', 'role': 'supervisor'},
    ]

    created = []
    for user_data in demo_users:
        if not User.query.filter_by(username=user_data['username']).first():
            user = User(
                username=user_data['username'],
                email=user_data['email'],
                role=UserRole(user_data['role'])
            )
            user.set_password(user_data['password'])
            db.session.add(user)
            created.append(user_data['username'])

    db.session.commit()

    return jsonify({
        'message': f'Created {len(created)} demo users',
        'users': created,
        'credentials': [
            {'username': 'admin', 'password': 'admin123'},
            {'username': 'analyst', 'password': 'analyst123'},
            {'username': 'supervisor', 'password': 'supervisor123'},
        ]
    })
