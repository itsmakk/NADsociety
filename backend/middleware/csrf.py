"""
NADSOC — CSRF Protection Middleware
Double-submit token pattern for defense-in-depth.
Even though JWT Bearer auth mitigates CSRF, this adds extra security (SRS Phase 5).
"""

import os
import hmac
import hashlib
import time
import secrets
from flask import request, jsonify, g, make_response
from functools import wraps


# CSRF secret — derived from app SECRET_KEY
CSRF_SECRET = os.environ.get('SECRET_KEY', 'dev-secret-change-me')
CSRF_TOKEN_EXPIRY = 3600  # 1 hour

# Methods that require CSRF validation
UNSAFE_METHODS = {'POST', 'PUT', 'PATCH', 'DELETE'}

# Endpoints exempt from CSRF (login, refresh — no prior token)
CSRF_EXEMPT_ENDPOINTS = {
    '/api/auth/login',
    '/api/auth/refresh',
    '/api/health',
}


def generate_csrf_token():
    """
    Generate a time-stamped, HMAC-signed CSRF token.
    Format: timestamp.nonce.signature
    """
    timestamp = str(int(time.time()))
    nonce = secrets.token_hex(16)
    payload = f"{timestamp}.{nonce}"
    signature = hmac.new(
        CSRF_SECRET.encode(),
        payload.encode(),
        hashlib.sha256
    ).hexdigest()
    return f"{payload}.{signature}"


def validate_csrf_token(token):
    """
    Validate a CSRF token: check signature and expiry.
    Returns True if valid, False otherwise.
    """
    if not token:
        return False

    parts = token.split('.')
    if len(parts) != 3:
        return False

    timestamp, nonce, signature = parts

    # Verify signature
    payload = f"{timestamp}.{nonce}"
    expected_sig = hmac.new(
        CSRF_SECRET.encode(),
        payload.encode(),
        hashlib.sha256
    ).hexdigest()

    if not hmac.compare_digest(signature, expected_sig):
        return False

    # Check expiry
    try:
        token_time = int(timestamp)
        if time.time() - token_time > CSRF_TOKEN_EXPIRY:
            return False
    except (ValueError, TypeError):
        return False

    return True


def init_csrf(app):
    """
    Register CSRF protection on the Flask app.
    - GET /api/auth/csrf-token → returns a fresh CSRF token
    - All unsafe methods require X-CSRF-Token header
    """

    @app.route('/api/auth/csrf-token', methods=['GET'])
    def get_csrf_token():
        """Issue a CSRF token to the client."""
        token = generate_csrf_token()
        response = make_response(jsonify({'csrf_token': token}))
        # Also set as a cookie for double-submit pattern
        response.set_cookie(
            'csrf_token',
            token,
            httponly=False,       # JS needs to read it
            secure=os.environ.get('FLASK_ENV') == 'production',
            samesite='Strict',
            max_age=CSRF_TOKEN_EXPIRY,
            path='/'
        )
        return response

    @app.before_request
    def csrf_protect():
        """Validate CSRF token on state-changing requests."""
        # Skip safe methods
        if request.method not in UNSAFE_METHODS:
            return None

        # Skip exempt endpoints
        if request.path in CSRF_EXEMPT_ENDPOINTS:
            return None

        # Skip if no Authorization header (unauthenticated — will fail auth anyway)
        if not request.headers.get('Authorization'):
            return None

        # In development mode, CSRF can be relaxed
        if os.environ.get('FLASK_ENV') != 'production':
            csrf_enforce = os.environ.get('CSRF_ENFORCE', 'false').lower()
            if csrf_enforce != 'true':
                return None

        # Check X-CSRF-Token header
        csrf_token = request.headers.get('X-CSRF-Token', '')

        if not validate_csrf_token(csrf_token):
            return jsonify({
                'error': 'CSRF validation failed. Please refresh and try again.'
            }), 403

        return None
