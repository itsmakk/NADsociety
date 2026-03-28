"""
NADSOC — Deposit & FD API Routes (SRS 4.3, 4.5)
"""

from flask import Blueprint, request, jsonify
from middleware.auth import require_auth, get_current_username
from middleware.rbac import require_permission
from models.schemas import ValidationError
from services import deposit_service

deposits_bp = Blueprint('deposits', __name__)
fd_bp = Blueprint('fd', __name__)


# ============= CD & SHARE =============

@deposits_bp.route('/cd-summary', methods=['GET'])
@require_auth
@require_permission('deposits', 'read')
def cd_summary():
    page = request.args.get('page', 1, type=int)
    return jsonify(deposit_service.get_cd_summary(page)), 200


@deposits_bp.route('/ledger/<gen_no>', methods=['GET'])
@require_auth
@require_permission('deposits', 'read')
def deposit_ledger(gen_no):
    page = request.args.get('page', 1, type=int)
    return jsonify(deposit_service.get_deposit_ledger(gen_no, page)), 200


@deposits_bp.route('/cd-interest', methods=['POST'])
@require_auth
@require_permission('deposits', 'post_interest')
def post_cd_interest():
    data = request.get_json() or {}
    fy = data.get('financial_year')
    rate = data.get('rate')
    if not fy or not rate:
        return jsonify({'error': 'financial_year and rate required'}), 400
    result = deposit_service.post_cd_interest(fy, float(rate), get_current_username())
    return jsonify(result), 200


@deposits_bp.route('/share-dividend', methods=['POST'])
@require_auth
@require_permission('deposits', 'post_dividend')
def post_share_dividend():
    data = request.get_json() or {}
    fy = data.get('financial_year')
    rate = data.get('rate')
    if not fy or not rate:
        return jsonify({'error': 'financial_year and rate required'}), 400
    result = deposit_service.post_share_dividend(fy, float(rate), get_current_username())
    return jsonify(result), 200


# ============= FIXED DEPOSITS =============

@fd_bp.route('', methods=['GET'])
@require_auth
@require_permission('fd', 'read')
def list_fds():
    page = request.args.get('page', 1, type=int)
    filters = {}
    for k in ['status', 'member_gen_no']:
        v = request.args.get(k)
        if v: filters[k] = v
    return jsonify(deposit_service.get_fds(filters, page)), 200


@fd_bp.route('', methods=['POST'])
@require_auth
@require_permission('fd', 'create')
def create_fd():
    data = request.get_json()
    if not data: return jsonify({'error': 'Body required'}), 400
    try:
        return jsonify(deposit_service.create_fd(data, get_current_username())), 201
    except ValidationError as e:
        return jsonify({'error': e.errors}), 400


@fd_bp.route('/<fd_no>/close', methods=['POST'])
@require_auth
@require_permission('fd', 'close')
def close_fd(fd_no):
    data = request.get_json() or {}
    try:
        return jsonify(deposit_service.close_fd(fd_no, data, get_current_username())), 200
    except ValidationError as e:
        return jsonify({'error': e.errors}), 400


@fd_bp.route('/<fd_no>/renew', methods=['POST'])
@require_auth
@require_permission('fd', 'create')
def renew_fd(fd_no):
    data = request.get_json() or {}
    try:
        return jsonify(deposit_service.renew_fd(fd_no, data, get_current_username())), 201
    except ValidationError as e:
        return jsonify({'error': e.errors}), 400


@fd_bp.route('/maturity', methods=['GET'])
@require_auth
@require_permission('fd', 'read')
def fd_maturity_report():
    from utils.db import execute_query
    days = request.args.get('days', 30, type=int)
    fds = execute_query("""
        SELECT f.*, m.name, m.token_no FROM fd_master f
        JOIN members m ON f.member_gen_no = m.gen_no
        WHERE f.status = 'Active' AND f.maturity_date <= CURRENT_DATE + INTERVAL '%s days'
        ORDER BY f.maturity_date
    """, (days,), fetch_all=True) or []
    result = []
    for f in fds:
        d = dict(f)
        for k, v in d.items():
            if hasattr(v, 'isoformat'): d[k] = v.isoformat()
        result.append(d)
    return jsonify({'fds': result, 'total': len(result), 'within_days': days}), 200
