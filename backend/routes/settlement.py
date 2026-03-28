"""
NADSOC — Settlement API Routes (SRS 4.7)
"""

from flask import Blueprint, request, jsonify
from middleware.auth import require_auth, get_current_username
from middleware.rbac import require_permission
from utils.db import execute_query, get_transaction, set_app_user
from utils.calculations import to_decimal
from models.schemas import ValidationError
from services.audit_service import log_action
from decimal import Decimal

settlement_bp = Blueprint('settlement', __name__)


@settlement_bp.route('', methods=['GET'])
@require_auth
@require_permission('settlement', 'read')
def list_settlements():
    rows = execute_query("""
        SELECT fs.*, m.name, m.token_no FROM final_settlement fs
        JOIN members m ON fs.member_gen_no = m.gen_no ORDER BY fs.created_date DESC
    """, fetch_all=True) or []
    result = []
    for r in rows:
        d = dict(r)
        for k, v in d.items():
            if hasattr(v, 'isoformat'): d[k] = v.isoformat()
        result.append(d)
    return jsonify({'settlements': result}), 200


@settlement_bp.route('/calculate/<gen_no>', methods=['GET'])
@require_auth
@require_permission('settlement', 'create')
def calculate_settlement(gen_no):
    """Calculate settlement amounts for preview (SRS 4.7)."""
    member = execute_query("SELECT * FROM members WHERE gen_no = %s", (gen_no,), fetch_one=True)
    if not member:
        return jsonify({'error': 'Member not found'}), 404

    dep = execute_query("SELECT cd_balance, share_balance FROM member_deposit_summary WHERE gen_no = %s",
                        (gen_no,), fetch_one=True) or {'cd_balance': 0, 'share_balance': 0}

    cd = to_decimal(dep['cd_balance'])
    share = to_decimal(dep['share_balance'])

    # Loan outstanding
    loans = execute_query("""
        SELECT loan_type, SUM(outstanding_principal) as total_p, SUM(outstanding_interest) as total_i
        FROM loan_master WHERE member_gen_no = %s AND status IN ('Active','NPA')
        GROUP BY loan_type
    """, (gen_no,), fetch_all=True) or []
    ll_out = Decimal('0')
    sl_out = Decimal('0')
    interest_due = Decimal('0')
    for l in loans:
        if l['loan_type'] == 'LL':
            ll_out = to_decimal(l['total_p'])
            interest_due += to_decimal(l['total_i'])
        else:
            sl_out = to_decimal(l['total_p'])
            interest_due += to_decimal(l['total_i'])

    total_earnings = cd + share
    total_deductions = ll_out + sl_out + interest_due
    final_payable = total_earnings - total_deductions

    # Surety check
    active_sureties = execute_query("""
        SELECT sm.loan_id, sm.borrower_gen_no, m.name as borrower_name
        FROM surety_mapping sm JOIN members m ON sm.borrower_gen_no = m.gen_no
        WHERE sm.surety_gen_no = %s AND sm.status = 'Active'
    """, (gen_no,), fetch_all=True) or []

    # Active FD check
    active_fds = execute_query(
        "SELECT fd_no, deposit_amount, maturity_date FROM fd_master WHERE member_gen_no = %s AND status = 'Active'",
        (gen_no,), fetch_all=True) or []

    return jsonify({
        'gen_no': gen_no, 'name': member['name'],
        'cd_amount': float(cd), 'share_amount': float(share),
        'll_outstanding': float(ll_out), 'sl_outstanding': float(sl_out),
        'interest_due': float(interest_due),
        'total_earnings': float(total_earnings), 'total_deductions': float(total_deductions),
        'final_payable': float(final_payable),
        'surety_warnings': [dict(s) for s in active_sureties],
        'active_fds': [{'fd_no': f['fd_no'], 'amount': float(f['deposit_amount'])} for f in active_fds],
        'has_warnings': len(active_sureties) > 0 or len(active_fds) > 0
    }), 200


@settlement_bp.route('', methods=['POST'])
@require_auth
@require_permission('settlement', 'create')
def create_settlement():
    """Create a final settlement (SRS 4.7)."""
    data = request.get_json()
    if not data: return jsonify({'error': 'Body required'}), 400

    gen_no = data.get('member_gen_no')
    settlement_type = data.get('settlement_type')
    if settlement_type not in ('Retired', 'Resigned', 'Transferred', 'Deceased'):
        return jsonify({'error': 'Invalid settlement type'}), 400

    username = get_current_username()
    with get_transaction() as cur:
        set_app_user(cur, username)
        cur.execute("SELECT fn_generate_fs_no() as fs_no")
        fs_no = cur.fetchone()['fs_no']

        cur.execute("""
            INSERT INTO final_settlement (
                fs_no, member_gen_no, settlement_type,
                cd_amount, share_amount, dcrb, other_receivable, total_earnings,
                ll_outstanding, sl_outstanding, interest_due, other_deductions, total_deductions,
                final_payable, settlement_date, voucher_no, cr_no, remark, approved_by, status
            ) VALUES (%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,'Pending')
        """, (
            fs_no, gen_no, settlement_type,
            data.get('cd_amount', 0), data.get('share_amount', 0),
            data.get('dcrb', 0), data.get('other_receivable', 0), data.get('total_earnings', 0),
            data.get('ll_outstanding', 0), data.get('sl_outstanding', 0),
            data.get('interest_due', 0), data.get('other_deductions', 0), data.get('total_deductions', 0),
            data.get('final_payable', 0), data.get('settlement_date'),
            data.get('voucher_no'), data.get('cr_no'), data.get('remark', ''), username
        ))

        log_action('settlement', 'CREATE', fs_no, {'member': gen_no, 'type': settlement_type}, cursor=cur)

    return jsonify({'fs_no': fs_no, 'message': 'Settlement created'}), 201


@settlement_bp.route('/<fs_no>/approve', methods=['POST'])
@require_auth
@require_permission('settlement', 'approve')
def approve_settlement(fs_no):
    """Approve and execute settlement: close loans, update deposits, mark member inactive."""
    fs = execute_query("SELECT * FROM final_settlement WHERE fs_no = %s AND status = 'Pending'",
                       (fs_no,), fetch_one=True)
    if not fs:
        return jsonify({'error': 'Pending settlement not found'}), 404

    gen_no = fs['member_gen_no']
    username = get_current_username()

    with get_transaction() as cur:
        set_app_user(cur, username)

        # Close all active loans
        cur.execute("""
            UPDATE loan_master SET status = 'Closed', outstanding_principal = 0,
                outstanding_interest = 0, closed_date = NOW()
            WHERE member_gen_no = %s AND status IN ('Active', 'NPA')
        """, (gen_no,))

        # Release all sureties given BY this member
        cur.execute("""
            UPDATE surety_mapping SET status = 'Released', released_date = NOW()
            WHERE borrower_gen_no = %s AND status = 'Active'
        """, (gen_no,))

        # Settlement deposit ledger entry (zero out balances)
        dep = execute_query("SELECT cd_balance, share_balance FROM member_deposit_summary WHERE gen_no = %s",
                            (gen_no,), fetch_one=True)
        if dep:
            cur.execute("""
                INSERT INTO deposit_ledger (gen_no, month_year, transaction_type,
                    cd_received, share_received, remark, posted_by)
                VALUES (%s, TO_CHAR(NOW(), 'YYYY-MM'), 'SETTLEMENT', %s, %s, %s, %s)
            """, (gen_no, -float(dep['cd_balance']), -float(dep['share_balance']),
                  f'Final settlement {fs_no}', username))

        # Mark member as Settled
        cur.execute("UPDATE members SET member_status = 'Settled', updated_date = NOW() WHERE gen_no = %s", (gen_no,))

        # Update settlement status
        cur.execute("UPDATE final_settlement SET status = 'Completed', approved_by = %s WHERE fs_no = %s", (username, fs_no))

        log_action('settlement', 'APPROVE', fs_no, {
            'member': gen_no, 'final_payable': float(fs['final_payable'])
        }, cursor=cur)

    return jsonify({'fs_no': fs_no, 'message': 'Settlement approved and executed'}), 200
