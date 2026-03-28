"""
NADSOC — Loan API Routes (SRS 4.2)
"""

from flask import Blueprint, request, jsonify
from middleware.auth import require_auth, get_current_username
from middleware.rbac import require_permission
from models.schemas import ValidationError
from services import loan_service
from utils.calculations import generate_amortization_schedule

loans_bp = Blueprint('loans', __name__)


@loans_bp.route('', methods=['GET'])
@require_auth
@require_permission('loans', 'read')
def list_loans():
    page = request.args.get('page', 1, type=int)
    per_page = min(request.args.get('per_page', 25, type=int), 100)
    filters = {}
    for k in ['loan_type', 'status', 'member_gen_no']:
        v = request.args.get(k)
        if v: filters[k] = v
    return jsonify(loan_service.get_loans(filters, page, per_page)), 200


@loans_bp.route('/<loan_id>', methods=['GET'])
@require_auth
@require_permission('loans', 'read')
def get_loan(loan_id):
    loan = loan_service.get_loan_detail(loan_id)
    if not loan:
        return jsonify({'error': 'Loan not found'}), 404
    return jsonify({'loan': loan}), 200


@loans_bp.route('', methods=['POST'])
@require_auth
@require_permission('loans', 'create')
def create_loan():
    data = request.get_json()
    if not data:
        return jsonify({'error': 'Request body required'}), 400
    try:
        result = loan_service.create_loan(data, get_current_username())
        return jsonify(result), 201
    except ValidationError as e:
        return jsonify({'error': 'Validation failed', 'details': e.errors}), 400


@loans_bp.route('/<loan_id>/foreclose', methods=['POST'])
@require_auth
@require_permission('loans', 'foreclose')
def foreclose_loan(loan_id):
    data = request.get_json() or {}
    try:
        result = loan_service.foreclose_loan(loan_id, data, get_current_username())
        return jsonify(result), 200
    except ValidationError as e:
        return jsonify({'error': e.errors}), 400


@loans_bp.route('/<loan_id>/adjust', methods=['POST'])
@require_auth
@require_permission('loans', 'adjust')
def adjust_loan(loan_id):
    data = request.get_json()
    if not data:
        return jsonify({'error': 'Request body required'}), 400
    try:
        result = loan_service.adjust_loan(loan_id, data, get_current_username())
        return jsonify(result), 200
    except ValidationError as e:
        return jsonify({'error': e.errors}), 400


@loans_bp.route('/amortization', methods=['POST'])
@require_auth
@require_permission('loans', 'read')
def calculate_amortization():
    """Preview amortization schedule without creating a loan."""
    data = request.get_json() or {}
    amount = data.get('sanction_amount', 0)
    rate = data.get('interest_rate', 11.25)
    principal = data.get('fixed_principal', 0)
    if not amount or not principal:
        return jsonify({'error': 'sanction_amount and fixed_principal required'}), 400
    schedule = generate_amortization_schedule(amount, rate, principal)
    return jsonify({'schedule': schedule, 'tenure_months': len(schedule)}), 200


@loans_bp.route('/npa', methods=['GET'])
@require_auth
@require_permission('loans', 'read')
def list_npa_loans():
    """GET /api/loans/npa — List NPA loans."""
    from utils.db import execute_query
    loans = execute_query("""
        SELECT lm.*, m.name, m.token_no
        FROM loan_master lm JOIN members m ON lm.member_gen_no = m.gen_no
        WHERE lm.status = 'NPA' ORDER BY lm.created_date DESC
    """, fetch_all=True) or []
    result = []
    for l in loans:
        d = dict(l)
        for k, v in d.items():
            if hasattr(v, 'isoformat'): d[k] = v.isoformat()
        result.append(d)
    return jsonify({'loans': result, 'total': len(result)}), 200
