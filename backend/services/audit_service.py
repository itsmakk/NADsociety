"""
NADSOC — Audit Logging Service
Append-only audit log for every financial action (SRS 4.11).
Superadmin actions go to separate hidden log (SRS 4.12.1).
"""

from flask import request, g
from utils.db import execute_query, get_cursor


def log_action(module, action_type, reference_id=None, details=None, cursor=None):
    """
    Log an action to the audit trail.
    If cursor is provided, uses it (for transactional logging).
    Otherwise creates its own connection.

    Args:
        module: Table/module name (e.g., 'members', 'loan_master')
        action_type: Action performed (e.g., 'CREATE', 'UPDATE', 'LOGIN')
        reference_id: Related record ID (e.g., gen_no, loan_id)
        details: Dict of extra details (stored as JSONB)
        cursor: Optional database cursor for transactional logging
    """
    import json

    user = getattr(g, 'current_user', None)
    user_id = user['user_id'] if user else None
    username = user['username'] if user else 'system'
    role = user['role'] if user else None

    ip_address = request.remote_addr if request else None

    # Superadmin actions go to separate hidden log
    if role == 'superadmin':
        _log_superadmin(action_type, details, ip_address, cursor)
        return

    query = """
        INSERT INTO audit_log (user_id, username, module, action_type, reference_id, details, ip_address)
        VALUES (%s, %s, %s, %s, %s, %s, %s)
    """
    params = (
        user_id,
        username,
        module,
        action_type,
        str(reference_id) if reference_id else None,
        json.dumps(details) if details else None,
        ip_address
    )

    if cursor:
        cursor.execute(query, params)
    else:
        execute_query(query, params)


def _log_superadmin(action_type, details, ip_address, cursor=None):
    """Log superadmin action to the hidden superadmin_log table."""
    import json

    query = """
        INSERT INTO superadmin_log (action_type, details, ip_address)
        VALUES (%s, %s, %s)
    """
    params = (
        action_type,
        json.dumps(details) if details else None,
        ip_address
    )

    if cursor:
        cursor.execute(query, params)
    else:
        execute_query(query, params)


def get_audit_logs(filters=None, page=1, per_page=50):
    """
    Retrieve audit logs with optional filtering.

    Args:
        filters: Dict with optional keys: module, action_type, username, date_from, date_to, reference_id
        page: Page number (1-indexed)
        per_page: Items per page

    Returns:
        Dict with 'logs', 'total', 'page', 'per_page', 'total_pages'
    """
    conditions = []
    params = []

    if filters:
        if filters.get('module'):
            conditions.append("module = %s")
            params.append(filters['module'])
        if filters.get('action_type'):
            conditions.append("action_type = %s")
            params.append(filters['action_type'])
        if filters.get('username'):
            conditions.append("username ILIKE %s")
            params.append(f"%{filters['username']}%")
        if filters.get('reference_id'):
            conditions.append("reference_id = %s")
            params.append(filters['reference_id'])
        if filters.get('date_from'):
            conditions.append("timestamp >= %s")
            params.append(filters['date_from'])
        if filters.get('date_to'):
            conditions.append("timestamp <= %s")
            params.append(filters['date_to'] + ' 23:59:59')

    where_clause = " AND ".join(conditions) if conditions else "1=1"

    # Count total
    count_query = f"SELECT COUNT(*) as total FROM audit_log WHERE {where_clause}"
    total_result = execute_query(count_query, tuple(params), fetch_one=True)
    total = total_result['total'] if total_result else 0

    # Fetch page
    offset = (page - 1) * per_page
    data_query = f"""
        SELECT log_id, user_id, username, module, action_type, reference_id,
               details, ip_address, timestamp
        FROM audit_log
        WHERE {where_clause}
        ORDER BY timestamp DESC
        LIMIT %s OFFSET %s
    """
    params.extend([per_page, offset])
    logs = execute_query(data_query, tuple(params), fetch_all=True) or []

    # Convert to serializable format
    result_logs = []
    for log in logs:
        log_dict = dict(log)
        log_dict['timestamp'] = log_dict['timestamp'].isoformat() if log_dict.get('timestamp') else None
        result_logs.append(log_dict)

    return {
        'logs': result_logs,
        'total': total,
        'page': page,
        'per_page': per_page,
        'total_pages': max(1, (total + per_page - 1) // per_page)
    }
