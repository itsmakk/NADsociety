"""
NADSOC — Loan Service (SRS 4.2)
Complete lifecycle: creation, top-up, disbursement, foreclosure.
Reducing Balance Interest, Fixed Principal installments.
"""

from decimal import Decimal
from utils.db import get_transaction, execute_query, set_app_user
from utils.calculations import (
    to_decimal, calculate_monthly_interest, calculate_loan_tenure,
    generate_amortization_schedule, calculate_disbursement_breakup
)
from models.schemas import validate_loan, ValidationError
from services.audit_service import log_action


def get_loans(filters=None, page=1, per_page=25):
    """List loans with filtering and pagination."""
    conditions = []
    params = []
    if filters:
        if filters.get('loan_type'):
            conditions.append("lm.loan_type = %s")
            params.append(filters['loan_type'])
        if filters.get('status'):
            conditions.append("lm.status = %s")
            params.append(filters['status'])
        if filters.get('member_gen_no'):
            conditions.append("lm.member_gen_no = %s")
            params.append(filters['member_gen_no'])

    where = " AND ".join(conditions) if conditions else "1=1"
    total = execute_query(f"SELECT COUNT(*) as total FROM loan_master lm WHERE {where}",
                          tuple(params), fetch_one=True)['total']
    offset = (page - 1) * per_page
    rows = execute_query(f"""
        SELECT lm.*, m.name as member_name, m.token_no
        FROM loan_master lm JOIN members m ON lm.member_gen_no = m.gen_no
        WHERE {where} ORDER BY lm.created_date DESC LIMIT %s OFFSET %s
    """, tuple(params) + (per_page, offset), fetch_all=True) or []

    loans = []
    for r in rows:
        d = dict(r)
        for k, v in d.items():
            if hasattr(v, 'isoformat'):
                d[k] = v.isoformat()
        loans.append(d)
    return {'loans': loans, 'total': total, 'page': page, 'per_page': per_page,
            'total_pages': max(1, (total + per_page - 1) // per_page)}


def get_loan_detail(loan_id):
    """Get loan with ledger history and amortization."""
    loan = execute_query(
        """SELECT lm.*, m.name as member_name, m.token_no
           FROM loan_master lm JOIN members m ON lm.member_gen_no = m.gen_no
           WHERE lm.loan_id = %s""", (loan_id,), fetch_one=True)
    if not loan:
        return None
    result = dict(loan)

    # Ledger entries
    ledger = execute_query(
        """SELECT * FROM loan_ledger WHERE loan_id = %s ORDER BY posted_date DESC""",
        (loan_id,), fetch_all=True) or []
    result['ledger'] = [dict(l) for l in ledger]

    # Allocations
    allocs = execute_query(
        "SELECT * FROM loan_allocation_details WHERE loan_id = %s ORDER BY allocation_id",
        (loan_id,), fetch_all=True) or []
    result['allocations'] = [dict(a) for a in allocs]

    # Sureties
    sureties = execute_query(
        """SELECT sm.*, m.name as surety_name FROM surety_mapping sm
           JOIN members m ON sm.surety_gen_no = m.gen_no WHERE sm.loan_id = %s""",
        (loan_id,), fetch_all=True) or []
    result['sureties'] = [dict(s) for s in sureties]

    # Amortization schedule
    if result['status'] == 'Active' and float(result['fixed_principal_amount']) > 0:
        result['amortization'] = generate_amortization_schedule(
            result['outstanding_principal'], result['interest_rate'], result['fixed_principal_amount'])

    for k, v in result.items():
        if hasattr(v, 'isoformat'):
            result[k] = v.isoformat()
    return result


def _get_config_value(key, default='0'):
    row = execute_query("SELECT config_value FROM system_config WHERE config_key = %s",
                        (key,), fetch_one=True)
    return row['config_value'] if row else default


def create_loan(data, username):
    """
    Create a new loan (LL/SL). SRS 4.2.3.
    Handles: eligibility check, CD/Share funding, top-up closure, disbursement.
    """
    validate_loan(data)
    gen_no = data['member_gen_no']
    loan_type = data['loan_type']
    amount = to_decimal(data['sanction_amount'])
    rate = to_decimal(data['interest_rate'])
    fixed_p = to_decimal(data['fixed_principal_amount'])

    # Config limits
    max_key = 'll_max_amount' if loan_type == 'LL' else 'sl_max_amount'
    max_amount = to_decimal(_get_config_value(max_key, '400000'))
    if amount > max_amount:
        raise ValidationError(f'{loan_type} amount cannot exceed ₹{max_amount}')

    # Check member exists and active
    member = execute_query("SELECT gen_no, member_status FROM members WHERE gen_no = %s",
                           (gen_no,), fetch_one=True)
    if not member:
        raise ValidationError(f'Member {gen_no} not found')
    if member['member_status'] != 'Active':
        raise ValidationError('Loans can only be issued to Active members')

    # Active loan check — only ONE active LL and ONE active SL
    active = execute_query(
        "SELECT loan_id, loan_type, outstanding_principal, outstanding_interest, status FROM loan_master WHERE member_gen_no = %s AND loan_type = %s AND status = 'Active'",
        (gen_no, loan_type), fetch_one=True)

    loan_mode = 'Top-up' if active else 'New'

    # Get deposit balances
    dep = execute_query("SELECT cd_balance, share_balance FROM member_deposit_summary WHERE gen_no = %s",
                        (gen_no,), fetch_one=True) or {'cd_balance': 0, 'share_balance': 0}

    cd_bal = to_decimal(dep['cd_balance'])
    share_bal = to_decimal(dep['share_balance'])

    # Check for existing loans to close (top-up)
    close_ll = data.get('close_ll', False)
    close_sl = data.get('close_sl', False)
    existing_ll_out = Decimal('0')
    existing_sl_out = Decimal('0')

    if close_ll or (loan_mode == 'Top-up' and loan_type == 'LL'):
        ll = execute_query(
            "SELECT loan_id, outstanding_principal, outstanding_interest FROM loan_master WHERE member_gen_no = %s AND loan_type = 'LL' AND status = 'Active'",
            (gen_no,), fetch_one=True)
        if ll:
            existing_ll_out = to_decimal(ll['outstanding_principal']) + to_decimal(ll['outstanding_interest'])
            close_ll = True

    if close_sl:
        sl = execute_query(
            "SELECT loan_id, outstanding_principal, outstanding_interest FROM loan_master WHERE member_gen_no = %s AND loan_type = 'SL' AND status = 'Active'",
            (gen_no,), fetch_one=True)
        if sl:
            existing_sl_out = to_decimal(sl['outstanding_principal']) + to_decimal(sl['outstanding_interest'])

    # Disbursement breakup
    breakup = calculate_disbursement_breakup(
        float(amount), float(cd_bal), float(share_bal),
        cd_requirement_pct=float(to_decimal(_get_config_value('cd_requirement_pct', '20'))),
        share_requirement=float(to_decimal(_get_config_value('share_requirement_amount', '8000'))),
        existing_ll_outstanding=float(existing_ll_out),
        existing_sl_outstanding=float(existing_sl_out),
        other_charges=float(to_decimal(data.get('other_charges', 0))),
        close_ll=close_ll, close_sl=close_sl
    )

    if breakup['net_disbursed'] < 0:
        raise ValidationError('Net disbursed amount is negative. Loan cannot be issued.')

    tenure = calculate_loan_tenure(float(amount), float(fixed_p))

    with get_transaction() as cur:
        set_app_user(cur, username)

        # Generate Loan ID
        cur.execute("SELECT fn_generate_loan_id(%s) as loan_id", (loan_type,))
        loan_id = cur.fetchone()['loan_id']

        # Close existing loans if top-up
        if close_ll:
            cur.execute("""
                UPDATE loan_master SET status = 'Top-up Closed', closed_date = NOW()
                WHERE member_gen_no = %s AND loan_type = 'LL' AND status = 'Active'
            """, (gen_no,))
            cur.execute("""
                INSERT INTO loan_ledger (loan_id, member_gen_no, month_year, transaction_type,
                    principal_received, interest_received, outstanding_principal, outstanding_interest,
                    remark, posted_by)
                SELECT loan_id, member_gen_no, TO_CHAR(NOW(), 'YYYY-MM'), 'TOPUP_CLOSURE',
                    outstanding_principal, outstanding_interest, 0, 0,
                    'Closed via top-up ' || %s, %s
                FROM loan_master WHERE member_gen_no = %s AND loan_type = 'LL' AND status = 'Top-up Closed'
                AND closed_date >= NOW() - INTERVAL '1 minute'
            """, (loan_id, username, gen_no))
            # Release sureties
            cur.execute("""
                UPDATE surety_mapping SET status = 'Released', released_date = NOW()
                WHERE loan_id IN (SELECT loan_id FROM loan_master WHERE member_gen_no = %s AND loan_type = 'LL' AND status = 'Top-up Closed')
                AND status = 'Active'
            """, (gen_no,))

        if close_sl:
            cur.execute("""
                UPDATE loan_master SET status = 'Top-up Closed', closed_date = NOW()
                WHERE member_gen_no = %s AND loan_type = 'SL' AND status = 'Active'
            """, (gen_no,))

        # Create loan master
        cur.execute("""
            INSERT INTO loan_master (
                loan_id, member_gen_no, loan_type, loan_mode, sanction_amount, disbursed_amount,
                interest_rate, fixed_principal_amount, tenure_months,
                outstanding_principal, outstanding_interest,
                cd_adjustment, share_adjustment, old_ll_adjustment, old_sl_adjustment, other_adjustment,
                status, voucher_no, cr_no, remark, approved_by
            ) VALUES (%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,0,%s,%s,%s,%s,%s,'Active',%s,%s,%s,%s)
        """, (
            loan_id, gen_no, loan_type, loan_mode, float(amount), breakup['net_disbursed'],
            float(rate), float(fixed_p), tenure, float(amount),
            breakup['cd_funding'], breakup['share_funding'],
            breakup['ll_closure'], breakup['sl_closure'], breakup['other_charges'],
            data.get('voucher_no'), data.get('cr_no'),
            data.get('remark', ''), username
        ))

        # Disbursement ledger entry
        cur.execute("""
            INSERT INTO loan_ledger (loan_id, member_gen_no, month_year, transaction_type,
                outstanding_principal, voucher_no, remark, posted_by)
            VALUES (%s, %s, TO_CHAR(NOW(), 'YYYY-MM'), 'DISBURSEMENT', %s, %s, %s, %s)
        """, (loan_id, gen_no, float(amount), data.get('voucher_no'),
              f'Loan disbursed: ₹{amount}', username))

        # Allocation details for traceability
        alloc_entries = [
            ('CD_FUNDING', breakup['cd_funding'], 'CD shortfall funded'),
            ('SHARE_FUNDING', breakup['share_funding'], 'Share shortfall funded'),
            ('LL_CLOSURE', breakup['ll_closure'], 'Existing LL closed'),
            ('SL_CLOSURE', breakup['sl_closure'], 'Existing SL closed'),
            ('OTHER_CHARGES', breakup['other_charges'], 'Other charges'),
            ('NET_DISBURSED', breakup['net_disbursed'], 'Net amount disbursed'),
        ]
        for atype, amt, desc in alloc_entries:
            if amt != 0:
                cur.execute("""
                    INSERT INTO loan_allocation_details (loan_id, allocation_type, amount, description)
                    VALUES (%s, %s, %s, %s)
                """, (loan_id, atype, amt, desc))

        # Fund CD/Share from loan
        if breakup['cd_funding'] > 0 or breakup['share_funding'] > 0:
            cur.execute("""
                INSERT INTO deposit_ledger (gen_no, month_year, transaction_type,
                    cd_received, share_received, remark, posted_by)
                VALUES (%s, TO_CHAR(NOW(), 'YYYY-MM'), 'FUNDING', %s, %s, %s, %s)
            """, (gen_no, breakup['cd_funding'], breakup['share_funding'],
                  f'Funded from loan {loan_id}', username))

        # Surety mapping (LL only)
        if loan_type == 'LL' and data.get('sureties'):
            for i, surety in enumerate(data['sureties'][:2], 1):
                if surety.get('gen_no'):
                    cur.execute("""
                        INSERT INTO surety_mapping (borrower_gen_no, loan_id, surety_gen_no, surety_type)
                        VALUES (%s, %s, %s, %s)
                    """, (gen_no, loan_id, surety['gen_no'], f'Surety{i}'))

        log_action('loan_master', 'LOAN_ISSUE', loan_id, {
            'type': loan_type, 'mode': loan_mode, 'amount': float(amount),
            'disbursed': breakup['net_disbursed'], 'member': gen_no
        }, cursor=cur)

    return {
        'loan_id': loan_id, 'message': f'{loan_type} loan issued successfully',
        'breakup': breakup, 'tenure_months': tenure
    }


def foreclose_loan(loan_id, data, username):
    """Foreclose/manually close a loan. Remaining balance paid off."""
    loan = execute_query(
        "SELECT * FROM loan_master WHERE loan_id = %s AND status = 'Active'",
        (loan_id,), fetch_one=True)
    if not loan:
        raise ValidationError(f'Active loan {loan_id} not found')

    total_outstanding = to_decimal(loan['outstanding_principal']) + to_decimal(loan['outstanding_interest'])

    with get_transaction() as cur:
        set_app_user(cur, username)
        cur.execute("""
            UPDATE loan_master SET status = 'Closed', outstanding_principal = 0,
                outstanding_interest = 0, closed_date = NOW() WHERE loan_id = %s
        """, (loan_id,))
        cur.execute("""
            INSERT INTO loan_ledger (loan_id, member_gen_no, month_year, transaction_type,
                principal_received, interest_received, outstanding_principal, outstanding_interest,
                cr_no, voucher_no, remark, posted_by)
            VALUES (%s, %s, TO_CHAR(NOW(), 'YYYY-MM'), 'FORECLOSURE',
                %s, %s, 0, 0, %s, %s, %s, %s)
        """, (loan_id, loan['member_gen_no'],
              float(loan['outstanding_principal']), float(loan['outstanding_interest']),
              data.get('cr_no'), data.get('voucher_no'),
              data.get('remark', 'Loan foreclosed'), username))
        # Release sureties
        cur.execute("""
            UPDATE surety_mapping SET status = 'Released', released_date = NOW()
            WHERE loan_id = %s AND status = 'Active'
        """, (loan_id,))

        log_action('loan_master', 'FORECLOSURE', loan_id, {
            'total_paid': float(total_outstanding)
        }, cursor=cur)

    return {'loan_id': loan_id, 'message': 'Loan foreclosed', 'total_paid': float(total_outstanding)}


def adjust_loan(loan_id, data, username):
    """Manual adjustment/reversal entry. SRS 4.2.5 — original entries NEVER edited."""
    loan = execute_query("SELECT * FROM loan_master WHERE loan_id = %s", (loan_id,), fetch_one=True)
    if not loan:
        raise ValidationError(f'Loan {loan_id} not found')

    p_adj = to_decimal(data.get('principal_adjustment', 0))
    i_adj = to_decimal(data.get('interest_adjustment', 0))
    tx_type = 'REVERSAL' if data.get('is_reversal') else 'ADJUSTMENT'

    new_p = to_decimal(loan['outstanding_principal']) + p_adj
    new_i = to_decimal(loan['outstanding_interest']) + i_adj

    with get_transaction() as cur:
        set_app_user(cur, username)
        cur.execute("""
            UPDATE loan_master SET outstanding_principal = %s, outstanding_interest = %s WHERE loan_id = %s
        """, (float(max(new_p, Decimal('0'))), float(max(new_i, Decimal('0'))), loan_id))
        cur.execute("""
            INSERT INTO loan_ledger (loan_id, member_gen_no, month_year, transaction_type,
                principal_demand, interest_demand, principal_received, interest_received,
                outstanding_principal, outstanding_interest,
                cr_no, remark, posted_by, reference_ledger_id)
            VALUES (%s, %s, TO_CHAR(NOW(), 'YYYY-MM'), %s,
                %s, %s, %s, %s, %s, %s, %s, %s, %s, %s)
        """, (loan_id, loan['member_gen_no'], tx_type,
              float(abs(p_adj)) if p_adj > 0 else 0, float(abs(i_adj)) if i_adj > 0 else 0,
              float(abs(p_adj)) if p_adj < 0 else 0, float(abs(i_adj)) if i_adj < 0 else 0,
              float(max(new_p, Decimal('0'))), float(max(new_i, Decimal('0'))),
              data.get('cr_no'), data.get('remark', tx_type),
              username, data.get('reference_ledger_id')))

        log_action('loan_master', tx_type, loan_id, {
            'p_adj': float(p_adj), 'i_adj': float(i_adj)
        }, cursor=cur)

    return {'loan_id': loan_id, 'message': f'{tx_type} recorded'}
