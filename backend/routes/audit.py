"""
NADSOC — Audit Log API Routes (SRS 4.11)
"""

from flask import Blueprint, request, jsonify
from middleware.auth import require_auth
from middleware.rbac import require_permission
from services.audit_service import get_audit_logs

audit_bp = Blueprint('audit', __name__)


@audit_bp.route('', methods=['GET'])
@require_auth
@require_permission('audit', 'read')
def list_audit_logs():
    """GET /api/audit — Search and filter audit logs."""
    page = request.args.get('page', 1, type=int)
    per_page = min(request.args.get('per_page', 50, type=int), 200)

    filters = {}
    for key in ['module', 'action_type', 'username', 'reference_id', 'date_from', 'date_to']:
        val = request.args.get(key, '').strip()
        if val:
            filters[key] = val

    result = get_audit_logs(filters=filters, page=page, per_page=per_page)
    return jsonify(result), 200
