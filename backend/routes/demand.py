"""
NADSOC — Demand & Recovery API Routes (SRS 4.4)
"""

from flask import Blueprint, request, jsonify
from middleware.auth import require_auth, get_current_username
from middleware.rbac import require_permission
from models.schemas import ValidationError, validate_month_year
from services import demand_service

demand_bp = Blueprint('demand', __name__)


@demand_bp.route('/generate', methods=['POST'])
@require_auth
@require_permission('demand', 'generate')
def generate_demand():
    data = request.get_json() or {}
    month_year = data.get('month_year')
    try:
        validate_month_year(month_year)
        result = demand_service.generate_monthly_demand(
            month_year, data.get('employee_type'), data.get('part'), get_current_username())
        return jsonify(result), 201
    except ValidationError as e:
        return jsonify({'error': e.errors}), 400


@demand_bp.route('/recovery', methods=['POST'])
@require_auth
@require_permission('demand', 'post_recovery')
def post_recovery():
    data = request.get_json()
    if not data or not data.get('month_year') or not data.get('recoveries'):
        return jsonify({'error': 'month_year and recoveries array required'}), 400
    try:
        validate_month_year(data['month_year'])
        result = demand_service.post_recovery(data['month_year'], data['recoveries'], get_current_username())
        return jsonify(result), 200
    except ValidationError as e:
        return jsonify({'error': e.errors}), 400


@demand_bp.route('/summary/<month_year>', methods=['GET'])
@require_auth
@require_permission('demand', 'read')
def get_demand_summary(month_year):
    try:
        validate_month_year(month_year)
    except ValidationError as e:
        return jsonify({'error': e.errors}), 400
    summary = demand_service.get_demand_summary(month_year)
    return jsonify({'month_year': month_year, 'members': summary, 'total': len(summary)}), 200


@demand_bp.route('/batches', methods=['GET'])
@require_auth
@require_permission('demand', 'read')
def list_batches():
    from utils.db import execute_query
    batches = execute_query("""
        SELECT * FROM demand_batch_log ORDER BY started_at DESC LIMIT 50
    """, fetch_all=True) or []
    result = []
    for b in batches:
        d = dict(b)
        for k, v in d.items():
            if hasattr(v, 'isoformat'): d[k] = v.isoformat()
        result.append(d)
    return jsonify({'batches': result}), 200
