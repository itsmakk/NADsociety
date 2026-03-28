"""
NADSOC — Admin API Routes
User management, system configuration, backup (SRS 4.14).
"""

import os
import json
import requests
from flask import Blueprint, request, jsonify
from middleware.auth import require_auth, get_current_username
from middleware.rbac import require_permission
from utils.db import execute_query, get_transaction, set_app_user
from models.schemas import ValidationError, sanitize_string
from services.audit_service import log_action

admin_bp = Blueprint('admin', __name__)

SUPABASE_URL = os.environ.get('SUPABASE_URL', '')
SUPABASE_SERVICE_ROLE_KEY = os.environ.get('SUPABASE_SERVICE_ROLE_KEY', '')


# ============================================================
# SYSTEM CONFIG ENDPOINTS
# ============================================================

@admin_bp.route('/config', methods=['GET'])
@require_auth
@require_permission('admin', 'read')
def get_all_config():
    """GET /api/admin/config — Get all system configuration."""
    module = request.args.get('module')
    if module:
        configs = execute_query(
            "SELECT config_key, config_value, config_type, module, description FROM system_config WHERE module = %s ORDER BY config_key",
            (module,), fetch_all=True
        )
    else:
        configs = execute_query(
            "SELECT config_key, config_value, config_type, module, description FROM system_config ORDER BY module, config_key",
            fetch_all=True
        )
    return jsonify({'configs': [dict(c) for c in (configs or [])]}), 200


@admin_bp.route('/config/<config_key>', methods=['PUT'])
@require_auth
@require_permission('admin', 'write')
def update_config(config_key):
    """PUT /api/admin/config/:key — Update a system config value."""
    data = request.get_json()
    if not data or 'value' not in data:
        return jsonify({'error': 'Value is required'}), 400

    existing = execute_query(
        "SELECT config_id, config_value FROM system_config WHERE config_key = %s",
        (config_key,), fetch_one=True
    )
    if not existing:
        return jsonify({'error': f'Config key {config_key} not found'}), 404

    from flask import g
    user = g.current_user
    execute_query(
        "UPDATE system_config SET config_value = %s, updated_date = NOW(), updated_by = %s WHERE config_key = %s",
        (str(data['value']), user['user_id'], config_key)
    )

    log_action('system_config', 'UPDATE', config_key, {
        'old_value': existing['config_value'],
        'new_value': str(data['value'])
    })

    return jsonify({'message': f'Config {config_key} updated', 'key': config_key, 'value': str(data['value'])}), 200


# ============================================================
# USER MANAGEMENT ENDPOINTS
# ============================================================

@admin_bp.route('/users', methods=['GET'])
@require_auth
@require_permission('admin', 'user_mgmt')
def list_users():
    """GET /api/admin/users — List all system users."""
    users = execute_query(
        """SELECT user_id, username, email, full_name, role, member_gen_no, status, created_date
           FROM users WHERE role != 'superadmin' ORDER BY created_date DESC""",
        fetch_all=True
    ) or []

    result = []
    for u in users:
        ud = dict(u)
        ud['created_date'] = ud['created_date'].isoformat() if ud.get('created_date') else None
        result.append(ud)

    return jsonify({'users': result}), 200


@admin_bp.route('/users', methods=['POST'])
@require_auth
@require_permission('admin', 'user_mgmt')
def create_user():
    """POST /api/admin/users — Create a new system user (creates Supabase Auth user too)."""
    data = request.get_json()
    if not data:
        return jsonify({'error': 'Request body required'}), 400

    required = ['email', 'password', 'full_name', 'role']
    missing = [f for f in required if not data.get(f)]
    if missing:
        return jsonify({'error': f'Missing required fields: {", ".join(missing)}'}), 400

    email = data['email'].strip().lower()
    role = data['role']
    if role not in ('admin', 'operator', 'auditor', 'member'):
        return jsonify({'error': 'Invalid role'}), 400

    # Check duplicate email
    dup = execute_query("SELECT user_id FROM users WHERE email = %s", (email,), fetch_one=True)
    if dup:
        return jsonify({'error': 'Email already registered'}), 400

    # Create Supabase Auth user
    try:
        resp = requests.post(
            f"{SUPABASE_URL}/auth/v1/admin/users",
            json={
                'email': email,
                'password': data['password'],
                'email_confirm': True,
                'user_metadata': {'full_name': data['full_name'], 'role': role}
            },
            headers={
                'apikey': SUPABASE_SERVICE_ROLE_KEY,
                'Authorization': f'Bearer {SUPABASE_SERVICE_ROLE_KEY}',
                'Content-Type': 'application/json'
            },
            timeout=10
        )

        if resp.status_code not in (200, 201):
            err = resp.json()
            return jsonify({'error': err.get('msg') or 'Failed to create auth user'}), 500

        auth_user = resp.json()
        auth_uid = auth_user.get('id')
    except requests.RequestException as e:
        return jsonify({'error': 'Auth service unavailable'}), 503

    # Create local user record
    username = data.get('username') or email.split('@')[0]

    with get_transaction() as cur:
        set_app_user(cur, get_current_username())
        cur.execute("""
            INSERT INTO users (auth_uid, username, email, full_name, role, member_gen_no, status)
            VALUES (%s, %s, %s, %s, %s, %s, 'active')
            RETURNING user_id
        """, (
            auth_uid, sanitize_string(username), email,
            sanitize_string(data['full_name']),
            role, data.get('member_gen_no')
        ))
        new_user = cur.fetchone()

        log_action('users', 'CREATE', str(new_user['user_id']), {
            'email': email, 'role': role, 'full_name': data['full_name']
        }, cursor=cur)

    return jsonify({'message': 'User created', 'user_id': new_user['user_id']}), 201


@admin_bp.route('/users/<int:user_id>/reset-password', methods=['POST'])
@require_auth
@require_permission('admin', 'user_mgmt')
def reset_user_password(user_id):
    """POST /api/admin/users/:id/reset-password — Reset to DOB-based default."""
    user = execute_query(
        "SELECT u.user_id, u.auth_uid, u.email, m.dob FROM users u LEFT JOIN members m ON u.member_gen_no = m.gen_no WHERE u.user_id = %s",
        (user_id,), fetch_one=True
    )
    if not user:
        return jsonify({'error': 'User not found'}), 404

    # Default password = DOB (DDMMYYYY) or fallback
    dob = user.get('dob')
    new_password = dob.strftime('%d%m%Y') if dob else 'Nadsoc@123'

    try:
        resp = requests.put(
            f"{SUPABASE_URL}/auth/v1/admin/users/{user['auth_uid']}",
            json={'password': new_password},
            headers={
                'apikey': SUPABASE_SERVICE_ROLE_KEY,
                'Authorization': f'Bearer {SUPABASE_SERVICE_ROLE_KEY}',
                'Content-Type': 'application/json'
            },
            timeout=10
        )
        if resp.status_code != 200:
            return jsonify({'error': 'Password reset failed'}), 500
    except requests.RequestException:
        return jsonify({'error': 'Service unavailable'}), 503

    log_action('users', 'PASSWORD_RESET', str(user_id), {'email': user['email']})

    return jsonify({'message': 'Password reset to default'}), 200


# ============================================================
# EMPLOYEE TYPES & PARTS
# ============================================================

@admin_bp.route('/employee-types', methods=['GET'])
@require_auth
def get_employee_types():
    """GET /api/admin/employee-types — Get employee types and parts."""
    types = execute_query(
        "SELECT config_value FROM system_config WHERE config_key = 'employee_types'",
        fetch_one=True
    )
    parts_ind = execute_query(
        "SELECT config_value FROM system_config WHERE config_key = 'parts_industrial'",
        fetch_one=True
    )
    parts_non = execute_query(
        "SELECT config_value FROM system_config WHERE config_key = 'parts_non_industrial'",
        fetch_one=True
    )

    return jsonify({
        'employee_types': json.loads(types['config_value']) if types else [],
        'parts_industrial': json.loads(parts_ind['config_value']) if parts_ind else [],
        'parts_non_industrial': json.loads(parts_non['config_value']) if parts_non else []
    }), 200


@admin_bp.route('/parts', methods=['POST'])
@require_auth
@require_permission('admin', 'write')
def manage_parts():
    """POST /api/admin/parts — Add/remove parts for an employee type."""
    data = request.get_json()
    if not data:
        return jsonify({'error': 'Request body required'}), 400

    emp_type = data.get('employee_type', '')
    action = data.get('action', '')  # 'add' or 'remove'
    part_name = sanitize_string(data.get('part_name', ''))

    if emp_type not in ('Industrial', 'Non-Industrial'):
        return jsonify({'error': 'Invalid employee type'}), 400
    if action not in ('add', 'remove'):
        return jsonify({'error': 'Action must be add or remove'}), 400
    if not part_name:
        return jsonify({'error': 'Part name required'}), 400

    config_key = 'parts_industrial' if emp_type == 'Industrial' else 'parts_non_industrial'

    current = execute_query(
        "SELECT config_value FROM system_config WHERE config_key = %s",
        (config_key,), fetch_one=True
    )
    parts = json.loads(current['config_value']) if current else []

    if action == 'add':
        if part_name in parts:
            return jsonify({'error': f'Part "{part_name}" already exists'}), 400
        parts.append(part_name)
    elif action == 'remove':
        if part_name not in parts:
            return jsonify({'error': f'Part "{part_name}" not found'}), 404
        parts.remove(part_name)

    from flask import g
    execute_query(
        "UPDATE system_config SET config_value = %s, updated_date = NOW(), updated_by = %s WHERE config_key = %s",
        (json.dumps(parts), g.current_user['user_id'], config_key)
    )

    log_action('system_config', 'UPDATE_PARTS', config_key, {
        'action': action, 'part': part_name, 'employee_type': emp_type
    })

    return jsonify({'message': f'Part {action}ed', 'parts': parts}), 200
