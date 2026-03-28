"""
NADSOC — Surety API Routes (SRS 4.6)
"""

from flask import Blueprint, request, jsonify
from middleware.auth import require_auth, get_current_username
from middleware.rbac import require_permission
from utils.db import execute_query, get_transaction, set_app_user
from models.schemas import ValidationError
from services.audit_service import log_action

surety_bp = Blueprint('surety', __name__)


@surety_bp.route('/exposure/<gen_no>', methods=['GET'])
@require_auth
@require_permission('surety', 'read')
def get_surety_exposure(gen_no):
    """Get surety exposure for a member."""
    sureties = execute_query("""
        SELECT sm.*, lm.outstanding_principal + lm.outstanding_interest as loan_outstanding,
               lm.sanction_amount, lm.status as loan_status, lm.loan_type,
               m.name as borrower_name, m.token_no as borrower_token
        FROM surety_mapping sm
        JOIN loan_master lm ON sm.loan_id = lm.loan_id
        JOIN members m ON sm.borrower_gen_no = m.gen_no
        WHERE sm.surety_gen_no = %s ORDER BY sm.created_date DESC
    """, (gen_no,), fetch_all=True) or []
    result = []
    total_active = 0
    for s in sureties:
        d = dict(s)
        for k, v in d.items():
            if hasattr(v, 'isoformat'): d[k] = v.isoformat()
        if d.get('status') == 'Active':
            total_active += float(d.get('loan_outstanding', 0))
        result.append(d)
    return jsonify({'sureties': result, 'total_active_exposure': total_active}), 200


@surety_bp.route('/defaults', methods=['GET'])
@require_auth
@require_permission('surety', 'manage')
def get_default_loans():
    """Get loans flagged for surety action (3+ consecutive defaults)."""
    loans = execute_query("""
        SELECT lm.*, m.name, m.token_no, lm.consecutive_defaults
        FROM loan_master lm JOIN members m ON lm.member_gen_no = m.gen_no
        WHERE lm.consecutive_defaults >= 3 AND lm.status IN ('Active', 'NPA')
        ORDER BY lm.consecutive_defaults DESC
    """, fetch_all=True) or []
    result = []
    for l in loans:
        d = dict(l)
        # Get sureties
        sureties = execute_query("""
            SELECT sm.surety_gen_no, ms.name as surety_name FROM surety_mapping sm
            JOIN members ms ON sm.surety_gen_no = ms.gen_no
            WHERE sm.loan_id = %s AND sm.status = 'Active'
        """, (d['loan_id'],), fetch_all=True) or []
        d['sureties'] = [dict(s) for s in sureties]
        for k, v in d.items():
            if hasattr(v, 'isoformat'): d[k] = v.isoformat()
        result.append(d)
    return jsonify({'defaults': result, 'total': len(result)}), 200


@surety_bp.route('/recover', methods=['POST'])
@require_auth
@require_permission('surety', 'recover')
def surety_recovery():
    """Manual recovery from surety applied to borrower's loan."""
    data = request.get_json()
    if not data:
        return jsonify({'error': 'Body required'}), 400

    loan_id = data.get('loan_id')
    surety_gen_no = data.get('surety_gen_no')
    amount = float(data.get('amount', 0))

    if not loan_id or not surety_gen_no or amount <= 0:
        return jsonify({'error': 'loan_id, surety_gen_no, and positive amount required'}), 400

    loan = execute_query("SELECT * FROM loan_master WHERE loan_id = %s AND status IN ('Active','NPA')",
                         (loan_id,), fetch_one=True)
    if not loan:
        return jsonify({'error': 'Active loan not found'}), 404

    from decimal import Decimal
    from utils.calculations import to_decimal
    amt = to_decimal(amount)
    # Interest first, then principal (SRS 4.6)
    i_recv = min(amt, to_decimal(loan['outstanding_interest']))
    p_recv = min(amt - i_recv, to_decimal(loan['outstanding_principal']))
    new_i = to_decimal(loan['outstanding_interest']) - i_recv
    new_p = to_decimal(loan['outstanding_principal']) - p_recv

    username = get_current_username()
    with get_transaction() as cur:
        set_app_user(cur, username)
        cur.execute("""
            UPDATE loan_master SET outstanding_principal = %s, outstanding_interest = %s WHERE loan_id = %s
        """, (float(max(new_p, Decimal('0'))), float(max(new_i, Decimal('0'))), loan_id))
        cur.execute("""
            INSERT INTO loan_ledger (loan_id, member_gen_no, month_year, transaction_type,
                principal_received, interest_received, outstanding_principal, outstanding_interest,
                cr_no, remark, posted_by)
            VALUES (%s,%s,TO_CHAR(NOW(),'YYYY-MM'),'SURETY_RECOVERY',%s,%s,%s,%s,%s,%s,%s)
        """, (loan_id, loan['member_gen_no'], float(p_recv), float(i_recv),
              float(max(new_p, Decimal('0'))), float(max(new_i, Decimal('0'))),
              data.get('cr_no'), f'Surety recovery from {surety_gen_no}', username))

        if new_p <= 0 and new_i <= 0:
            cur.execute("UPDATE loan_master SET status = 'Closed', closed_date = NOW() WHERE loan_id = %s", (loan_id,))
            cur.execute("UPDATE surety_mapping SET status = 'Released', released_date = NOW() WHERE loan_id = %s AND status = 'Active'", (loan_id,))

        log_action('surety', 'SURETY_RECOVERY', loan_id, {
            'surety': surety_gen_no, 'amount': amount
        }, cursor=cur)

    return jsonify({'message': 'Surety recovery posted', 'principal_applied': float(p_recv), 'interest_applied': float(i_recv)}), 200
