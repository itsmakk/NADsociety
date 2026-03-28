"""
NADSOC — Deposit Service (SRS 4.3) + FD Service (SRS 4.5)
"""

from decimal import Decimal
from utils.db import get_transaction, execute_query, set_app_user
from utils.calculations import to_decimal, calculate_cd_interest, calculate_share_dividend, calculate_fd_maturity
from models.schemas import ValidationError
from services.audit_service import log_action


# ============================================================
# CD & SHARE
# ============================================================

def get_deposit_ledger(gen_no, page=1, per_page=50):
    total = execute_query("SELECT COUNT(*) as t FROM deposit_ledger WHERE gen_no = %s",
                          (gen_no,), fetch_one=True)['t']
    offset = (page - 1) * per_page
    rows = execute_query("""
        SELECT * FROM deposit_ledger WHERE gen_no = %s ORDER BY posted_date DESC LIMIT %s OFFSET %s
    """, (gen_no, per_page, offset), fetch_all=True) or []
    result = []
    for r in rows:
        d = dict(r)
        for k, v in d.items():
            if hasattr(v, 'isoformat'): d[k] = v.isoformat()
        result.append(d)
    return {'ledger': result, 'total': total, 'page': page, 'per_page': per_page}


def get_cd_summary(page=1, per_page=50):
    total = execute_query("SELECT COUNT(*) as t FROM member_deposit_summary", fetch_one=True)['t']
    offset = (page - 1) * per_page
    rows = execute_query("""
        SELECT d.gen_no, m.name, m.token_no, d.cd_balance, d.share_balance
        FROM member_deposit_summary d JOIN members m ON d.gen_no = m.gen_no
        WHERE m.member_status = 'Active' ORDER BY m.gen_no LIMIT %s OFFSET %s
    """, (per_page, offset), fetch_all=True) or []
    return {'members': [dict(r) for r in rows], 'total': total, 'page': page}


def post_cd_interest(financial_year, rate, username):
    """Post CD interest for all active members. SRS 4.3."""
    members = execute_query("""
        SELECT d.gen_no FROM member_deposit_summary d
        JOIN members m ON d.gen_no = m.gen_no WHERE m.member_status = 'Active'
    """, fetch_all=True) or []

    count = 0
    with get_transaction() as cur:
        set_app_user(cur, username)
        for mem in members:
            gen_no = mem['gen_no']
            # Get monthly CD balances for the FY
            balances = execute_query("""
                SELECT COALESCE(SUM(cd_received), 0) as running
                FROM deposit_ledger WHERE gen_no = %s AND month_year LIKE %s
            """, (gen_no, financial_year[:4] + '%'), fetch_one=True)

            # Simplified: use current balance as proxy for monthly balance sum
            cd_bal = execute_query("SELECT cd_balance FROM member_deposit_summary WHERE gen_no = %s",
                                   (gen_no,), fetch_one=True)
            if not cd_bal or float(cd_bal['cd_balance']) <= 0:
                continue

            interest = calculate_cd_interest([cd_bal['cd_balance']] * 12, rate)
            if interest <= 0:
                continue

            cur.execute("""
                INSERT INTO deposit_ledger (gen_no, month_year, transaction_type, cd_received, remark, posted_by)
                VALUES (%s, %s, 'INTEREST_CREDIT', %s, %s, %s)
            """, (gen_no, financial_year, interest, f'CD Interest FY {financial_year} @ {rate}%', username))
            count += 1

        log_action('deposit', 'CD_INTEREST', financial_year, {
            'rate': rate, 'members': count
        }, cursor=cur)

    return {'message': f'CD interest posted for {count} members', 'count': count}


def post_share_dividend(financial_year, rate, username):
    """Post share dividend for all active members. SRS 4.3."""
    members = execute_query("""
        SELECT d.gen_no, d.share_balance FROM member_deposit_summary d
        JOIN members m ON d.gen_no = m.gen_no WHERE m.member_status = 'Active' AND d.share_balance > 0
    """, fetch_all=True) or []

    count = 0
    with get_transaction() as cur:
        set_app_user(cur, username)
        for mem in members:
            dividend = calculate_share_dividend([mem['share_balance']] * 12, rate)
            if dividend <= 0:
                continue
            cur.execute("""
                INSERT INTO deposit_ledger (gen_no, month_year, transaction_type, share_received, remark, posted_by)
                VALUES (%s, %s, 'DIVIDEND_CREDIT', %s, %s, %s)
            """, (mem['gen_no'], financial_year, dividend, f'Dividend FY {financial_year} @ {rate}%', username))
            count += 1

        log_action('deposit', 'SHARE_DIVIDEND', financial_year, {'rate': rate, 'members': count}, cursor=cur)

    return {'message': f'Share dividend posted for {count} members', 'count': count}


# ============================================================
# FIXED DEPOSIT (SRS 4.5)
# ============================================================

def get_fds(filters=None, page=1, per_page=25):
    conditions, params = [], []
    if filters:
        if filters.get('status'):
            conditions.append("f.status = %s"); params.append(filters['status'])
        if filters.get('member_gen_no'):
            conditions.append("f.member_gen_no = %s"); params.append(filters['member_gen_no'])
    where = " AND ".join(conditions) if conditions else "1=1"
    total = execute_query(f"SELECT COUNT(*) as t FROM fd_master f WHERE {where}", tuple(params), fetch_one=True)['t']
    offset = (page - 1) * per_page
    rows = execute_query(f"""
        SELECT f.*, m.name, m.token_no FROM fd_master f
        JOIN members m ON f.member_gen_no = m.gen_no WHERE {where}
        ORDER BY f.created_date DESC LIMIT %s OFFSET %s
    """, tuple(params) + (per_page, offset), fetch_all=True) or []
    fds = []
    for r in rows:
        d = dict(r)
        for k, v in d.items():
            if hasattr(v, 'isoformat'): d[k] = v.isoformat()
        fds.append(d)
    return {'fds': fds, 'total': total, 'page': page}


def create_fd(data, username):
    """Create a Fixed Deposit. SRS 4.5."""
    gen_no = data.get('member_gen_no')
    amount = to_decimal(data.get('deposit_amount', 0))
    tenure_days = int(data.get('tenure_days', 0))
    start_date = data.get('start_date')

    if not gen_no or amount <= 0 or tenure_days <= 0 or not start_date:
        raise ValidationError('member_gen_no, deposit_amount, tenure_days, start_date are required')

    # Get interest rate from FD schemes
    import json
    schemes_raw = execute_query("SELECT config_value FROM system_config WHERE config_key = 'fd_schemes'",
                                 fetch_one=True)
    schemes = json.loads(schemes_raw['config_value']) if schemes_raw else []
    rate = Decimal('0')
    for scheme in schemes:
        if scheme['min_days'] <= tenure_days <= scheme['max_days']:
            rate = to_decimal(scheme['rate'])
            break

    if data.get('interest_rate'):
        rate = to_decimal(data['interest_rate'])

    maturity_amount = calculate_fd_maturity(float(amount), float(rate), tenure_days)

    from datetime import datetime, timedelta
    start = datetime.strptime(start_date, '%Y-%m-%d').date() if isinstance(start_date, str) else start_date
    maturity_date = start + timedelta(days=tenure_days)

    with get_transaction() as cur:
        set_app_user(cur, username)
        cur.execute("SELECT fn_generate_fd_no() as fd_no")
        fd_no = cur.fetchone()['fd_no']

        cur.execute("""
            INSERT INTO fd_master (fd_no, member_gen_no, deposit_amount, interest_rate, tenure_days,
                start_date, maturity_date, maturity_amount, cr_no, voucher_no, remark)
            VALUES (%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s)
        """, (fd_no, gen_no, float(amount), float(rate), tenure_days,
              start, maturity_date, maturity_amount,
              data.get('cr_no'), data.get('voucher_no'), data.get('remark', '')))

        cur.execute("""
            INSERT INTO fd_ledger (fd_no, member_gen_no, transaction_type, amount, cr_no, voucher_no, posted_by)
            VALUES (%s,%s,'OPEN',%s,%s,%s,%s)
        """, (fd_no, gen_no, float(amount), data.get('cr_no'), data.get('voucher_no'), username))

        log_action('fd_master', 'CREATE', fd_no, {
            'member': gen_no, 'amount': float(amount), 'rate': float(rate), 'tenure': tenure_days
        }, cursor=cur)

    return {'fd_no': fd_no, 'maturity_date': str(maturity_date), 'maturity_amount': maturity_amount}


def close_fd(fd_no, data, username):
    """Close or premature-close an FD. SRS 4.5."""
    fd = execute_query("SELECT * FROM fd_master WHERE fd_no = %s AND status = 'Active'",
                       (fd_no,), fetch_one=True)
    if not fd:
        raise ValidationError(f'Active FD {fd_no} not found')

    from datetime import date
    close_date = data.get('close_date', str(date.today()))
    is_premature = str(close_date) < str(fd['maturity_date'])
    tx_type = 'PREMATURE_CLOSE' if is_premature else 'CLOSE'

    # Calculate interest till close date
    from datetime import datetime
    start = fd['start_date']
    end = datetime.strptime(close_date, '%Y-%m-%d').date() if isinstance(close_date, str) else close_date
    days_held = (end - start).days
    interest_amount = calculate_fd_maturity(float(fd['deposit_amount']), float(fd['interest_rate']), days_held) - float(fd['deposit_amount'])

    payout = float(fd['deposit_amount']) + interest_amount

    with get_transaction() as cur:
        set_app_user(cur, username)
        cur.execute("UPDATE fd_master SET status = 'Closed', closed_date = %s WHERE fd_no = %s",
                    (close_date, fd_no))
        cur.execute("""
            INSERT INTO fd_ledger (fd_no, member_gen_no, transaction_type, amount, interest_amount, voucher_no, remark, posted_by)
            VALUES (%s,%s,%s,%s,%s,%s,%s,%s)
        """, (fd_no, fd['member_gen_no'], tx_type, float(fd['deposit_amount']),
              interest_amount, data.get('voucher_no'), data.get('remark', tx_type), username))

        log_action('fd_master', tx_type, fd_no, {
            'payout': payout, 'days_held': days_held, 'interest': interest_amount
        }, cursor=cur)

    return {'fd_no': fd_no, 'payout': payout, 'interest': interest_amount, 'type': tx_type}


def renew_fd(fd_no, data, username):
    """Renew FD: principal only or principal + interest. SRS 4.5."""
    fd = execute_query("SELECT * FROM fd_master WHERE fd_no = %s AND status = 'Active'",
                       (fd_no,), fetch_one=True)
    if not fd:
        raise ValidationError(f'Active FD {fd_no} not found')

    include_interest = data.get('include_interest', False)
    new_amount = float(fd['deposit_amount'])
    if include_interest:
        new_amount = float(fd['maturity_amount'])

    new_tenure = int(data.get('tenure_days', fd['tenure_days']))

    # Close old FD
    close_result = close_fd(fd_no, {'close_date': str(fd['maturity_date']), 'remark': 'Closed for renewal'}, username)

    # Create new FD
    new_data = {
        'member_gen_no': fd['member_gen_no'],
        'deposit_amount': new_amount,
        'tenure_days': new_tenure,
        'start_date': str(fd['maturity_date']),
        'cr_no': data.get('cr_no'),
        'remark': f'Renewed from {fd_no}'
    }
    new_fd = create_fd(new_data, username)

    # Link
    execute_query("UPDATE fd_master SET linked_fd_no = %s WHERE fd_no = %s",
                  (fd_no, new_fd['fd_no']))

    return {'old_fd': fd_no, 'new_fd': new_fd['fd_no'], 'new_amount': new_amount,
            'maturity_date': new_fd['maturity_date']}
