"""
NADSOC — Member API Routes
CRUD endpoints for member management (SRS 4.1).
"""

from flask import Blueprint, request, jsonify
from middleware.auth import require_auth, get_current_username
from middleware.rbac import require_permission
from models.schemas import ValidationError
from services import member_service

members_bp = Blueprint('members', __name__)


@members_bp.route('', methods=['GET'])
@require_auth
@require_permission('members', 'read')
def list_members():
    """GET /api/members — List members with search, filter, sort, pagination."""
    page = request.args.get('page', 1, type=int)
    per_page = min(request.args.get('per_page', 25, type=int), 100)
    search = request.args.get('search', '').strip() or None
    sort_by = request.args.get('sort_by', 'gen_no')
    sort_dir = request.args.get('sort_dir', 'asc')

    filters = {}
    if request.args.get('status'):
        filters['status'] = request.args['status']
    if request.args.get('employee_type'):
        filters['employee_type'] = request.args['employee_type']
    if request.args.get('part'):
        filters['part'] = request.args['part']

    result = member_service.get_members(
        filters=filters, page=page, per_page=per_page,
        search=search, sort_by=sort_by, sort_dir=sort_dir
    )
    return jsonify(result), 200


@members_bp.route('/<gen_no>', methods=['GET'])
@require_auth
@require_permission('members', 'read')
def get_member(gen_no):
    """GET /api/members/:gen_no — Get member profile with financial summary."""
    member = member_service.get_member(gen_no)
    if not member:
        return jsonify({'error': f'Member {gen_no} not found'}), 404
    return jsonify({'member': member}), 200


@members_bp.route('', methods=['POST'])
@require_auth
@require_permission('members', 'create')
def create_member():
    """POST /api/members — Create new member."""
    data = request.get_json()
    if not data:
        return jsonify({'error': 'Request body required'}), 400
    try:
        result = member_service.create_member(data, get_current_username())
        return jsonify(result), 201
    except ValidationError as e:
        return jsonify({'error': 'Validation failed', 'details': e.errors}), 400
    except Exception as e:
        return jsonify({'error': str(e)}), 500


@members_bp.route('/<gen_no>', methods=['PUT'])
@require_auth
@require_permission('members', 'update')
def update_member(gen_no):
    """PUT /api/members/:gen_no — Update member profile."""
    data = request.get_json()
    if not data:
        return jsonify({'error': 'Request body required'}), 400
    try:
        result = member_service.update_member(gen_no, data, get_current_username())
        return jsonify(result), 200
    except ValidationError as e:
        return jsonify({'error': 'Validation failed', 'details': e.errors}), 400
    except Exception as e:
        return jsonify({'error': str(e)}), 500


@members_bp.route('/<gen_no>/status', methods=['PATCH'])
@require_auth
@require_permission('members', 'change_status')
def change_status(gen_no):
    """PATCH /api/members/:gen_no/status — Change member status (Admin only)."""
    data = request.get_json()
    if not data or not data.get('status'):
        return jsonify({'error': 'New status is required'}), 400
    try:
        result = member_service.change_member_status(gen_no, data['status'], get_current_username())
        return jsonify(result), 200
    except ValidationError as e:
        return jsonify({'error': 'Validation failed', 'details': e.errors}), 400
    except Exception as e:
        return jsonify({'error': str(e)}), 500


@members_bp.route('/<gen_no>/transactions', methods=['GET'])
@require_auth
@require_permission('members', 'read')
def get_transactions(gen_no):
    """GET /api/members/:gen_no/transactions — Full transaction history."""
    page = request.args.get('page', 1, type=int)
    per_page = min(request.args.get('per_page', 50, type=int), 200)
    result = member_service.get_member_transaction_history(gen_no, page, per_page)
    return jsonify(result), 200


@members_bp.route('/search', methods=['GET'])
@require_auth
@require_permission('members', 'read')
def quick_search():
    """GET /api/members/search?q=... — Quick search for autocomplete."""
    q = request.args.get('q', '').strip()
    if len(q) < 2:
        return jsonify({'results': []}), 200

    from utils.db import execute_query
    results = execute_query(
        """SELECT gen_no, name, token_no, member_status
           FROM members
           WHERE gen_no ILIKE %s OR name ILIKE %s OR token_no ILIKE %s
           ORDER BY name
           LIMIT 10""",
        (f"%{q}%", f"%{q}%", f"%{q}%"),
        fetch_all=True
    ) or []

    return jsonify({'results': [dict(r) for r in results]}), 200
