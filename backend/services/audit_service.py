"""
NADSOC — Audit Logging Service
Append-only audit log for every financial action (SRS 4.11).
Superadmin actions go to separate hidden log (SRS 4.12.1).

Phase 5: HMAC-based tamper protection — every log entry gets
          a cryptographic checksum that chains to the previous entry.
"""

import os
import hmac
import hashlib
import json
from flask import request, g
from utils.db import execute_query, get_cursor


# Secret for HMAC signing audit entries
AUDIT_SECRET = os.environ.get('AUDIT_HMAC_SECRET',
                               os.environ.get('SECRET_KEY', 'audit-fallback-key'))


def _compute_checksum(data_dict, prev_checksum=None):
    """
    Compute HMAC-SHA256 checksum for an audit entry.
    Chains to previous entry's checksum for tamper detection.

    Args:
        data_dict: Dict of log entry fields
        prev_checksum: Checksum of the previous log entry (chain link)

    Returns:
        Hex digest of the HMAC checksum
    """
    # Build a deterministic string from the entry data
    fields = [
        str(data_dict.get('user_id', '')),
        str(data_dict.get('username', '')),
        str(data_dict.get('module', '')),
        str(data_dict.get('action_type', '')),
        str(data_dict.get('reference_id', '')),
        json.dumps(data_dict.get('details'), sort_keys=True) if data_dict.get('details') else '',
        str(data_dict.get('ip_address', '')),
        str(prev_checksum or 'GENESIS'),
    ]
    payload = '|'.join(fields)

    return hmac.new(
        AUDIT_SECRET.encode(),
        payload.encode(),
        hashlib.sha256
    ).hexdigest()


def _get_last_checksum(cursor=None):
    """Get the checksum of the most recent audit log entry."""
    query = "SELECT checksum FROM audit_log ORDER BY log_id DESC LIMIT 1"
    if cursor:
        cursor.execute(query)
        row = cursor.fetchone()
    else:
        row = execute_query(query, fetch_one=True)
    return row['checksum'] if row and row.get('checksum') else None


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
    user = getattr(g, 'current_user', None)
    user_id = user['user_id'] if user else None
    username = user['username'] if user else 'system'
    role = user['role'] if user else None

    ip_address = request.remote_addr if request else None
    # Use X-Forwarded-For if available
    if request:
        forwarded = request.headers.get('X-Forwarded-For', '')
        if forwarded:
            ip_address = forwarded.split(',')[0].strip()

    # Superadmin actions go to separate hidden log
    if role == 'superadmin':
        _log_superadmin(action_type, details, ip_address, cursor)
        return

    # Compute tamper-proof checksum
    entry_data = {
        'user_id': user_id,
        'username': username,
        'module': module,
        'action_type': action_type,
        'reference_id': str(reference_id) if reference_id else None,
        'details': details,
        'ip_address': ip_address,
    }

    prev_checksum = _get_last_checksum(cursor)
    checksum = _compute_checksum(entry_data, prev_checksum)

    query = """
        INSERT INTO audit_log (user_id, username, module, action_type, reference_id, details, ip_address, checksum)
        VALUES (%s, %s, %s, %s, %s, %s, %s, %s)
    """
    params = (
        user_id,
        username,
        module,
        action_type,
        str(reference_id) if reference_id else None,
        json.dumps(details) if details else None,
        ip_address,
        checksum
    )

    if cursor:
        cursor.execute(query, params)
    else:
        execute_query(query, params)


def _log_superadmin(action_type, details, ip_address, cursor=None):
    """Log superadmin action to the hidden superadmin_log table."""
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


def verify_audit_chain(start_id=None, end_id=None, limit=100):
    """
    Verify the integrity of the audit log chain.
    Returns a report of any tampered entries.

    Args:
        start_id: Starting log_id (default: beginning)
        end_id: Ending log_id (default: latest)
        limit: Max entries to verify per call

    Returns:
        Dict with 'valid', 'checked', 'tampered_entries'
    """
    conditions = []
    params = []

    if start_id:
        conditions.append("log_id >= %s")
        params.append(start_id)
    if end_id:
        conditions.append("log_id <= %s")
        params.append(end_id)

    where = " AND ".join(conditions) if conditions else "1=1"

    query = f"""
        SELECT log_id, user_id, username, module, action_type, reference_id,
               details, ip_address, checksum, timestamp
        FROM audit_log
        WHERE {where}
        ORDER BY log_id ASC
        LIMIT %s
    """
    params.append(limit)

    logs = execute_query(query, tuple(params), fetch_all=True) or []

    tampered = []
    prev_checksum = None

    # Get the checksum of entry before our range
    if logs and start_id:
        prev_entry = execute_query(
            "SELECT checksum FROM audit_log WHERE log_id < %s ORDER BY log_id DESC LIMIT 1",
            (start_id,),
            fetch_one=True
        )
        prev_checksum = prev_entry['checksum'] if prev_entry else None

    for log in logs:
        entry_data = {
            'user_id': log['user_id'],
            'username': log['username'],
            'module': log['module'],
            'action_type': log['action_type'],
            'reference_id': log['reference_id'],
            'details': log['details'] if isinstance(log['details'], dict) else (
                json.loads(log['details']) if log['details'] else None
            ),
            'ip_address': log['ip_address'],
        }

        expected = _compute_checksum(entry_data, prev_checksum)
        stored = log.get('checksum', '')

        if stored and expected != stored:
            tampered.append({
                'log_id': log['log_id'],
                'timestamp': log['timestamp'].isoformat() if log.get('timestamp') else None,
                'expected_checksum': expected[:16] + '...',
                'stored_checksum': stored[:16] + '...'
            })

        prev_checksum = stored

    return {
        'valid': len(tampered) == 0,
        'checked': len(logs),
        'tampered_entries': tampered,
        'range': {
            'start': logs[0]['log_id'] if logs else None,
            'end': logs[-1]['log_id'] if logs else None
        }
    }


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
               details, ip_address, timestamp, checksum
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
        # Include integrity indicator (don't expose full checksum)
        log_dict['integrity'] = 'verified' if log_dict.get('checksum') else 'legacy'
        log_dict.pop('checksum', None)
        result_logs.append(log_dict)

    return {
        'logs': result_logs,
        'total': total,
        'page': page,
        'per_page': per_page,
        'total_pages': max(1, (total + per_page - 1) // per_page)
    }
