"""
NADSOC — Expense & Forms API Routes (SRS 4.8, 4.9)
"""

from flask import Blueprint, request, jsonify
from middleware.auth import require_auth, get_current_username
from middleware.rbac import require_permission
from utils.db import execute_query, get_transaction, set_app_user
from models.schemas import ValidationError, sanitize_string
from services.audit_service import log_action

expense_bp = Blueprint('expenses', __name__)
forms_bp = Blueprint('forms', __name__)


# ============= EXPENSES (SRS 4.8) =============

@expense_bp.route('', methods=['GET'])
@require_auth
@require_permission('expenses', 'read')
def list_expenses():
    page = request.args.get('page', 1, type=int)
    per_page = min(request.args.get('per_page', 25, type=int), 100)
    date_from = request.args.get('date_from')
    date_to = request.args.get('date_to')
    category = request.args.get('category')

    conditions, params = [], []
    if date_from:
        conditions.append("expense_date >= %s"); params.append(date_from)
    if date_to:
        conditions.append("expense_date <= %s"); params.append(date_to)
    if category:
        conditions.append("category = %s"); params.append(category)

    where = " AND ".join(conditions) if conditions else "1=1"
    total = execute_query(f"SELECT COUNT(*) as t FROM expense_master WHERE {where}",
                          tuple(params), fetch_one=True)['t']
    offset = (page - 1) * per_page
    rows = execute_query(f"""
        SELECT * FROM expense_master WHERE {where} ORDER BY expense_date DESC, posted_date DESC
        LIMIT %s OFFSET %s
    """, tuple(params) + (per_page, offset), fetch_all=True) or []

    expenses = []
    for r in rows:
        d = dict(r)
        for k, v in d.items():
            if hasattr(v, 'isoformat'): d[k] = v.isoformat()
        expenses.append(d)

    # Totals (only POSTED)
    totals = execute_query(f"""
        SELECT COALESCE(SUM(amount), 0) as total_amount FROM expense_master WHERE {where} AND status = 'POSTED'
    """, tuple(params), fetch_one=True)

    return jsonify({'expenses': expenses, 'total': total, 'page': page,
                    'total_amount': float(totals['total_amount'])}), 200


@expense_bp.route('', methods=['POST'])
@require_auth
@require_permission('expenses', 'create')
def create_expense():
    data = request.get_json()
    if not data: return jsonify({'error': 'Body required'}), 400

    required = ['expense_date', 'category', 'amount', 'payment_mode']
    missing = [f for f in required if not data.get(f)]
    if missing:
        return jsonify({'error': f'Missing: {", ".join(missing)}'}), 400

    username = get_current_username()
    with get_transaction() as cur:
        set_app_user(cur, username)
        cur.execute("SELECT fn_generate_ex_no() as ex_no")
        ex_no = cur.fetchone()['ex_no']

        cur.execute("""
            INSERT INTO expense_master (ex_no, expense_date, category, paid_to, amount,
                payment_mode, voucher_no, remark, posted_by)
            VALUES (%s,%s,%s,%s,%s,%s,%s,%s,%s)
        """, (ex_no, data['expense_date'], data['category'],
              sanitize_string(data.get('paid_to')), float(data['amount']),
              data['payment_mode'], data.get('voucher_no'),
              sanitize_string(data.get('remark')), username))

        log_action('expense_master', 'CREATE', ex_no, {
            'amount': float(data['amount']), 'category': data['category']
        }, cursor=cur)

    return jsonify({'ex_no': ex_no, 'message': 'Expense recorded'}), 201


@expense_bp.route('/<ex_no>/cancel', methods=['POST'])
@require_auth
@require_permission('expenses', 'cancel')
def cancel_expense(ex_no):
    """Cancel expense — record stays visible for audit. SRS 4.8."""
    data = request.get_json() or {}
    username = get_current_username()

    existing = execute_query("SELECT status FROM expense_master WHERE ex_no = %s", (ex_no,), fetch_one=True)
    if not existing:
        return jsonify({'error': 'Expense not found'}), 404
    if existing['status'] == 'CANCELLED':
        return jsonify({'error': 'Already cancelled'}), 400

    execute_query("""
        UPDATE expense_master SET status = 'CANCELLED', cancelled_by = %s,
            cancelled_date = NOW(), cancellation_remark = %s WHERE ex_no = %s
    """, (username, sanitize_string(data.get('remark', 'Cancelled')), ex_no))

    log_action('expense_master', 'CANCEL', ex_no, {'cancelled_by': username})
    return jsonify({'ex_no': ex_no, 'message': 'Expense cancelled'}), 200


# ============= FORMS REGISTER (SRS 4.9) =============

@forms_bp.route('', methods=['GET'])
@require_auth
@require_permission('forms', 'read')
def list_forms():
    page = request.args.get('page', 1, type=int)
    per_page = min(request.args.get('per_page', 25, type=int), 100)
    offset = (page - 1) * per_page
    total = execute_query("SELECT COUNT(*) as t FROM forms_register", fetch_one=True)['t']
    rows = execute_query("""
        SELECT fr.*, m.name as member_name FROM forms_register fr
        LEFT JOIN members m ON fr.member_gen_no = m.gen_no
        ORDER BY fr.form_date DESC LIMIT %s OFFSET %s
    """, (per_page, offset), fetch_all=True) or []
    forms = []
    for r in rows:
        d = dict(r)
        for k, v in d.items():
            if hasattr(v, 'isoformat'): d[k] = v.isoformat()
        forms.append(d)
    return jsonify({'forms': forms, 'total': total, 'page': page}), 200


@forms_bp.route('', methods=['POST'])
@require_auth
@require_permission('forms', 'create')
def create_form():
    data = request.get_json()
    if not data: return jsonify({'error': 'Body required'}), 400

    if not data.get('form_date') or not data.get('form_type'):
        return jsonify({'error': 'form_date and form_type required'}), 400

    username = get_current_username()
    with get_transaction() as cur:
        set_app_user(cur, username)
        cur.execute("SELECT fn_generate_form_no() as form_no")
        form_no = cur.fetchone()['form_no']

        cur.execute("""
            INSERT INTO forms_register (form_no, form_date, member_gen_no, member_name,
                token_no, form_type, charges, cr_no, remark, posted_by)
            VALUES (%s,%s,%s,%s,%s,%s,%s,%s,%s,%s)
        """, (form_no, data['form_date'], data.get('member_gen_no'),
              sanitize_string(data.get('member_name')),
              sanitize_string(data.get('token_no')),
              data['form_type'], float(data.get('charges', 0)),
              data.get('cr_no'), sanitize_string(data.get('remark')), username))

        log_action('forms_register', 'CREATE', form_no, {
            'type': data['form_type'], 'member': data.get('member_gen_no')
        }, cursor=cur)

    return jsonify({'form_no': form_no, 'message': 'Form entry created'}), 201
