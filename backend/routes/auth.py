"""
NADSOC — Auth API Routes
Handles login, password verification, session management.
Uses Supabase Auth for JWT-based authentication.
"""

import os
import requests
from flask import Blueprint, request, jsonify, g
from middleware.auth import require_auth, get_current_user

auth_bp = Blueprint('auth', __name__)

SUPABASE_URL = os.environ.get('SUPABASE_URL', '')
SUPABASE_ANON_KEY = os.environ.get('SUPABASE_ANON_KEY', '')


@auth_bp.route('/login', methods=['POST'])
def login():
    """
    Login with email + password via Supabase Auth.
    Returns JWT session + user profile with role.
    """
    data = request.get_json()
    if not data:
        return jsonify({'error': 'Request body required'}), 400

    email = (data.get('email') or '').strip().lower()
    password = data.get('password') or ''

    if not email or not password:
        return jsonify({'error': 'Email and password are required'}), 400

    # Authenticate with Supabase
    try:
        resp = requests.post(
            f"{SUPABASE_URL}/auth/v1/token?grant_type=password",
            json={'email': email, 'password': password},
            headers={
                'apikey': SUPABASE_ANON_KEY,
                'Content-Type': 'application/json'
            },
            timeout=10
        )

        if resp.status_code != 200:
            error_data = resp.json()
            msg = error_data.get('error_description') or error_data.get('msg') or 'Invalid credentials'
            return jsonify({'error': msg}), 401

        auth_data = resp.json()
    except requests.RequestException as e:
        return jsonify({'error': 'Authentication service unavailable'}), 503

    # Get user profile from our users table
    from utils.db import execute_query
    user = execute_query(
        """SELECT user_id, username, email, full_name, role, member_gen_no, status
           FROM users WHERE auth_uid = %s""",
        (auth_data.get('user', {}).get('id'),),
        fetch_one=True
    )

    if not user:
        return jsonify({'error': 'User account not set up. Contact admin.'}), 403

    if user['status'] != 'active':
        return jsonify({'error': 'Account is disabled. Contact admin.'}), 403

    # Log login action
    from services.audit_service import log_action
    from flask import g
    g.current_user = dict(user)
    log_action('auth', 'LOGIN', reference_id=user['username'], details={
        'email': email,
        'role': user['role']
    })

    return jsonify({
        'session': {
            'access_token': auth_data.get('access_token'),
            'refresh_token': auth_data.get('refresh_token'),
            'expires_in': auth_data.get('expires_in'),
            'token_type': 'bearer'
        },
        'user': {
            'user_id': user['user_id'],
            'username': user['username'],
            'email': user['email'],
            'full_name': user['full_name'],
            'role': user['role'],
            'member_gen_no': user['member_gen_no']
        }
    }), 200


@auth_bp.route('/me', methods=['GET'])
@require_auth
def get_profile():
    """Get current user's profile."""
    user = get_current_user()
    return jsonify({
        'user': {
            'user_id': user['user_id'],
            'username': user['username'],
            'email': user['email'],
            'full_name': user['full_name'],
            'role': user['role'],
            'member_gen_no': user['member_gen_no']
        }
    }), 200


@auth_bp.route('/verify-password', methods=['POST'])
@require_auth
def verify_password():
    """
    Verify user's password for financial transaction confirmation.
    SRS 4.12.2: Every financial transaction requires password re-entry.
    """
    data = request.get_json()
    if not data or not data.get('password'):
        return jsonify({'error': 'Password required'}), 400

    user = get_current_user()

    # Re-authenticate with Supabase to verify password
    try:
        resp = requests.post(
            f"{SUPABASE_URL}/auth/v1/token?grant_type=password",
            json={'email': user['email'], 'password': data['password']},
            headers={
                'apikey': SUPABASE_ANON_KEY,
                'Content-Type': 'application/json'
            },
            timeout=10
        )

        if resp.status_code != 200:
            return jsonify({'error': 'Incorrect password'}), 401

    except requests.RequestException:
        return jsonify({'error': 'Verification service unavailable'}), 503

    return jsonify({'verified': True}), 200


@auth_bp.route('/refresh', methods=['POST'])
def refresh_token():
    """Refresh an expired access token using the refresh token."""
    data = request.get_json()
    refresh_token = data.get('refresh_token') if data else None

    if not refresh_token:
        return jsonify({'error': 'Refresh token required'}), 400

    try:
        resp = requests.post(
            f"{SUPABASE_URL}/auth/v1/token?grant_type=refresh_token",
            json={'refresh_token': refresh_token},
            headers={
                'apikey': SUPABASE_ANON_KEY,
                'Content-Type': 'application/json'
            },
            timeout=10
        )

        if resp.status_code != 200:
            return jsonify({'error': 'Token refresh failed'}), 401

        auth_data = resp.json()
        return jsonify({
            'session': {
                'access_token': auth_data.get('access_token'),
                'refresh_token': auth_data.get('refresh_token'),
                'expires_in': auth_data.get('expires_in'),
                'token_type': 'bearer'
            }
        }), 200

    except requests.RequestException:
        return jsonify({'error': 'Auth service unavailable'}), 503


@auth_bp.route('/change-password', methods=['POST'])
@require_auth
def change_password():
    """Change current user's password."""
    data = request.get_json()
    if not data:
        return jsonify({'error': 'Request body required'}), 400

    current_pw = data.get('current_password', '')
    new_pw = data.get('new_password', '')

    if not current_pw or not new_pw:
        return jsonify({'error': 'Current and new passwords are required'}), 400

    if len(new_pw) < 8:
        return jsonify({'error': 'Password must be at least 8 characters'}), 400

    user = get_current_user()

    # Verify current password first
    try:
        verify_resp = requests.post(
            f"{SUPABASE_URL}/auth/v1/token?grant_type=password",
            json={'email': user['email'], 'password': current_pw},
            headers={'apikey': SUPABASE_ANON_KEY, 'Content-Type': 'application/json'},
            timeout=10
        )
        if verify_resp.status_code != 200:
            return jsonify({'error': 'Current password is incorrect'}), 401

        access_token = verify_resp.json().get('access_token')
    except requests.RequestException:
        return jsonify({'error': 'Service unavailable'}), 503

    # Update password via Supabase
    try:
        update_resp = requests.put(
            f"{SUPABASE_URL}/auth/v1/user",
            json={'password': new_pw},
            headers={
                'apikey': SUPABASE_ANON_KEY,
                'Authorization': f'Bearer {access_token}',
                'Content-Type': 'application/json'
            },
            timeout=10
        )
        if update_resp.status_code != 200:
            return jsonify({'error': 'Password update failed'}), 500

    except requests.RequestException:
        return jsonify({'error': 'Service unavailable'}), 503

    from services.audit_service import log_action
    log_action('auth', 'PASSWORD_CHANGE', reference_id=user['username'])

    return jsonify({'message': 'Password changed successfully'}), 200
