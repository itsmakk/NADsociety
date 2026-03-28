"""
NADSOC — Role-Based Access Control (RBAC) Middleware
Enforces permissions at the API level.
Frontend hiding alone is NOT sufficient (SRS 3).
"""

import functools
from flask import jsonify, g


# Role hierarchy (higher index = more privileges)
ROLE_HIERARCHY = {
    'member': 0,
    'auditor': 1,
    'operator': 2,
    'admin': 3,
    'superadmin': 4
}

# Module-level permissions matrix (SRS 4.12.2)
PERMISSIONS = {
    'members': {
        'create':       ['admin', 'operator', 'superadmin'],
        'read':         ['admin', 'operator', 'auditor', 'superadmin'],
        'update':       ['admin', 'operator', 'superadmin'],
        'change_status': ['admin', 'superadmin'],
        'bulk_upload':  ['admin', 'superadmin'],
    },
    'loans': {
        'create':       ['admin', 'operator', 'superadmin'],
        'read':         ['admin', 'operator', 'auditor', 'superadmin'],
        'adjust':       ['admin', 'superadmin'],
        'foreclose':    ['admin', 'operator', 'superadmin'],
    },
    'deposits': {
        'read':         ['admin', 'operator', 'auditor', 'superadmin'],
        'post_interest': ['admin', 'superadmin'],
        'post_dividend': ['admin', 'superadmin'],
    },
    'demand': {
        'generate':     ['admin', 'superadmin'],
        'read':         ['admin', 'operator', 'auditor', 'superadmin'],
        'post_recovery': ['admin', 'operator', 'superadmin'],
    },
    'fd': {
        'create':       ['admin', 'operator', 'superadmin'],
        'read':         ['admin', 'operator', 'auditor', 'superadmin'],
        'close':        ['admin', 'operator', 'superadmin'],
    },
    'surety': {
        'read':         ['admin', 'operator', 'auditor', 'superadmin'],
        'recover':      ['admin', 'superadmin'],
        'manage':       ['admin', 'superadmin'],
    },
    'settlement': {
        'create':       ['admin', 'superadmin'],
        'read':         ['admin', 'operator', 'auditor', 'superadmin'],
        'approve':      ['admin', 'superadmin'],
    },
    'expenses': {
        'create':       ['admin', 'operator', 'superadmin'],
        'read':         ['admin', 'operator', 'auditor', 'superadmin'],
        'cancel':       ['admin', 'superadmin'],
    },
    'forms': {
        'create':       ['admin', 'operator', 'superadmin'],
        'read':         ['admin', 'operator', 'auditor', 'superadmin'],
    },
    'reports': {
        'read':         ['admin', 'operator', 'auditor', 'superadmin'],
        'custom':       ['admin', 'operator', 'superadmin'],
    },
    'audit': {
        'read':         ['admin', 'auditor', 'superadmin'],
    },
    'admin': {
        'read':         ['admin', 'superadmin'],
        'write':        ['admin', 'superadmin'],
        'user_mgmt':    ['admin', 'superadmin'],
    },
    'developer': {
        'access':       ['superadmin'],
    },
    'backup': {
        'create':       ['admin', 'superadmin'],
        'restore':      ['admin', 'superadmin'],
    },
}


def require_role(*allowed_roles):
    """
    Decorator: Requires the authenticated user to have one of the allowed roles.
    Must be used AFTER @require_auth.
    """
    def decorator(f):
        @functools.wraps(f)
        def decorated(*args, **kwargs):
            user = getattr(g, 'current_user', None)
            if not user:
                return jsonify({'error': 'Authentication required'}), 401

            user_role = user.get('role', '')
            if user_role not in allowed_roles:
                return jsonify({
                    'error': 'Insufficient permissions',
                    'required': list(allowed_roles),
                    'current': user_role
                }), 403

            return f(*args, **kwargs)
        return decorated
    return decorator


def require_permission(module, action):
    """
    Decorator: Requires the authenticated user to have permission for a specific module+action.
    Must be used AFTER @require_auth.

    Usage:
        @require_auth
        @require_permission('loans', 'create')
        def create_loan():
            ...
    """
    def decorator(f):
        @functools.wraps(f)
        def decorated(*args, **kwargs):
            user = getattr(g, 'current_user', None)
            if not user:
                return jsonify({'error': 'Authentication required'}), 401

            user_role = user.get('role', '')
            allowed = PERMISSIONS.get(module, {}).get(action, [])

            if user_role not in allowed:
                return jsonify({
                    'error': f'Permission denied: {module}.{action}',
                    'required_roles': allowed,
                    'your_role': user_role
                }), 403

            return f(*args, **kwargs)
        return decorated
    return decorator


def check_permission(module, action):
    """
    Non-decorator version: check if current user has permission.
    Returns True/False. Use inside route handlers.
    """
    user = getattr(g, 'current_user', None)
    if not user:
        return False
    user_role = user.get('role', '')
    allowed = PERMISSIONS.get(module, {}).get(action, [])
    return user_role in allowed


def is_auditor_only():
    """Check if current user is auditor (read-only, cannot create/edit/delete)."""
    user = getattr(g, 'current_user', None)
    return user and user.get('role') == 'auditor'
