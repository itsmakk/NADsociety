"""
NADSOC — JWT Authentication Middleware
Validates Supabase JWT tokens on every API request.
Zero-trust: no request passes without valid token.
"""

import os
import functools
from flask import request, jsonify, g
import jwt


SUPABASE_JWT_SECRET = os.environ.get('SUPABASE_JWT_SECRET', '')
SUPERADMIN_SECRET_KEY = os.environ.get('SUPERADMIN_SECRET_KEY', '')


def decode_token(token):
    """
    Decode and validate a Supabase JWT token.
    Returns the decoded payload or raises an exception.
    """
    try:
        payload = jwt.decode(
            token,
            SUPABASE_JWT_SECRET,
            algorithms=['HS256'],
            audience='authenticated'
        )
        return payload
    except jwt.ExpiredSignatureError:
        raise ValueError('Token has expired. Please login again.')
    except jwt.InvalidTokenError as e:
        raise ValueError(f'Invalid token: {str(e)}')


def require_auth(f):
    """
    Decorator: Requires a valid JWT token in the Authorization header.
    Sets g.current_user with user info from the database.
    """
    @functools.wraps(f)
    def decorated(*args, **kwargs):
        auth_header = request.headers.get('Authorization', '')
        if not auth_header.startswith('Bearer '):
            return jsonify({'error': 'Missing or invalid Authorization header'}), 401

        token = auth_header.split(' ', 1)[1]
        try:
            payload = decode_token(token)
        except ValueError as e:
            return jsonify({'error': str(e)}), 401

        # Fetch user from database
        from utils.db import execute_query
        user = execute_query(
            """SELECT user_id, username, email, full_name, role, member_gen_no, status
               FROM users WHERE auth_uid = %s AND status = 'active'""",
            (payload.get('sub'),),
            fetch_one=True
        )

        if not user:
            return jsonify({'error': 'User not found or account disabled'}), 401

        # Store user info in Flask's g context
        g.current_user = dict(user)
        g.auth_uid = payload.get('sub')

        return f(*args, **kwargs)
    return decorated


def get_current_user():
    """Get the current authenticated user from Flask's g context."""
    return getattr(g, 'current_user', None)


def get_current_username():
    """Get the current username for audit logging."""
    user = get_current_user()
    return user['username'] if user else 'system'


def get_current_role():
    """Get the current user's role."""
    user = get_current_user()
    return user['role'] if user else None
