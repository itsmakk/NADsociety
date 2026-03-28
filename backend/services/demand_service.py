"""
NADSOC — Demand & Recovery Service (SRS 4.4)
Monthly demand generation and recovery posting.
"""

import json
from decimal import Decimal
from utils.db import get_transaction, execute_query, set_app_user
from utils.calculations import to_decimal, calculate_monthly_interest
from services.audit_service import log_action
from models.schemas import ValidationError


def _get_config(key, default='0'):
    r = execute_query("SELECT config_value FROM system_config WHERE config_key = %s",
                      (key,), fetch_one=True)
    return r['config_value'] if r else default


def generate_monthly_demand(month_year, employee_type=None, part=None, username='system'):
    """
    Generate monthly demand for all active members. SRS 4.4.1.
    Demand = CD + Share + Loan Principal + Loan Interest.
    """
    # Check month not already generated
    existing = execute_query(
        "SELECT batch_id FROM demand_batch_log WHERE month_year = %s AND status = 'completed' AND employee_type IS NOT DISTINCT FROM %s AND part IS NOT DISTINCT FROM %s",
        (month_year, employee_type, part), fetch_one=True)
    if existing:
        raise ValidationError(f'Demand already generated for {month_year} (Type: {employee_type}, Part: {part})')

    # Check month not locked
    locked = execute_query("SELECT 1 FROM month_lock WHERE month_year = %s AND status = 'locked'",
                           (month_year,), fetch_one=True)
    if locked:
        raise ValidationError(f'Month {month_year} is locked')

    cd_amount = to_decimal(_get_config('cd_monthly_amount', '600'))
    share_amount = to_decimal(_get_config('share_monthly_amount', '100'))
    share_max = to_decimal(_get_config('share_max_amount', '8000'))

    # Get active members
    conditions = ["m.member_status = 'Active'"]
    params = []
    if employee_type:
        conditions.append("m.employee_type = %s")
        params.append(employee_type)
    if part:
        conditions.append("m.part = %s")
        params.append(part)

    members = execute_query(f"""
        SELECT m.gen_no, m.employee_type, m.part,
               COALESCE(d.cd_balance, 0) as cd_balance,
               COALESCE(d.share_balance, 0) as share_balance
        FROM members m
        LEFT JOIN member_deposit_summary d ON m.gen_no = d.gen_no
        WHERE {' AND '.join(conditions)}
        ORDER BY m.gen_no
    """, tuple(params), fetch_all=True) or []

    # Create batch log
    batch_id = None
    with get_transaction() as cur:
        set_app_user(cur, username)
        cur.execute("""
            INSERT INTO demand_batch_log (month_year, employee_type, part, total_members, status, started_at, started_by)
            VALUES (%s, %s, %s, %s, 'processing', NOW(), %s) RETURNING batch_id
        """, (month_year, employee_type, part, len(members), username))
        batch_id = cur.fetchone()['batch_id']

    processed = 0
    failed = 0
    errors = []

    for member in members:
        gen_no = member['gen_no']
        try:
            with get_transaction() as cur:
                set_app_user(cur, username)

                # Check per-member CD override
                override = execute_query(
                    "SELECT cd_amount, share_amount FROM member_cd_config WHERE gen_no = %s AND effective_from <= CURRENT_DATE ORDER BY effective_from DESC LIMIT 1",
                    (gen_no,), fetch_one=True)
                mem_cd = to_decimal(override['cd_amount']) if override and override['cd_amount'] else cd_amount
                mem_share = to_decimal(override['share_amount']) if override and override['share_amount'] else share_amount

                # Share demand stops at max
                share_bal = to_decimal(member['share_balance'])
                actual_share = mem_share if share_bal < share_max else Decimal('0')

                # Deposit demand
                cur.execute("""
                    INSERT INTO deposit_ledger (gen_no, month_year, transaction_type,
                        cd_demand, share_demand, posted_by)
                    VALUES (%s, %s, 'DEMAND', %s, %s, %s)
                """, (gen_no, month_year, float(mem_cd), float(actual_share), username))

                # Loan demands (active loans)
                active_loans = execute_query(
                    "SELECT loan_id, loan_type, outstanding_principal, outstanding_interest, interest_rate, fixed_principal_amount FROM loan_master WHERE member_gen_no = %s AND status = 'Active'",
                    (gen_no,), fetch_all=True) or []

                for loan in active_loans:
                    out_p = to_decimal(loan['outstanding_principal'])
                    rate = to_decimal(loan['interest_rate'])
                    fixed_p = to_decimal(loan['fixed_principal_amount'])

                    if out_p <= 0 and to_decimal(loan['outstanding_interest']) <= 0:
                        continue

                    interest = calculate_monthly_interest(out_p, rate)
                    actual_p = min(fixed_p, out_p)

                    cur.execute("""
                        INSERT INTO loan_ledger (loan_id, member_gen_no, month_year, transaction_type,
                            principal_demand, interest_demand, outstanding_principal, outstanding_interest,
                            posted_by)
                        VALUES (%s, %s, %s, 'DEMAND', %s, %s, %s, %s, %s)
                    """, (loan['loan_id'], gen_no, month_year,
                          float(actual_p), float(interest), float(out_p), float(to_decimal(loan['outstanding_interest'])),
                          username))

                processed += 1

        except Exception as e:
            failed += 1
            errors.append({'gen_no': gen_no, 'error': str(e)})

    # Update batch log
    status = 'completed' if failed == 0 else ('partial' if processed > 0 else 'failed')
    execute_query("""
        UPDATE demand_batch_log SET processed = %s, failed = %s, status = %s,
            completed_at = NOW(), error_details = %s WHERE batch_id = %s
    """, (processed, failed, status, json.dumps(errors[:50]) if errors else None, batch_id))

    log_action('demand', 'GENERATE', month_year, {
        'total': len(members), 'processed': processed, 'failed': failed,
        'employee_type': employee_type, 'part': part
    })

    return {
        'batch_id': batch_id, 'month_year': month_year,
        'total_members': len(members), 'processed': processed, 'failed': failed,
        'status': status, 'errors': errors[:10]
    }


def post_recovery(month_year, recoveries, username):
    """
    Post recovery for multiple members. SRS 4.4.2.
    Default = full recovery. Configurable allocation priority.
    """
    priority_str = _get_config('recovery_allocation_priority', 'CD,Share,Interest,Principal')
    priority = [p.strip() for p in priority_str.split(',')]

    results = []
    for rec in recoveries:
        gen_no = rec.get('gen_no')
        total_amount = to_decimal(rec.get('total_amount', 0))
        cr_no = rec.get('cr_no')
        remark = rec.get('remark', '')
        is_no_recovery = rec.get('no_recovery', False)

        try:
            with get_transaction() as cur:
                set_app_user(cur, username)

                if is_no_recovery:
                    _process_no_recovery(cur, gen_no, month_year, username)
                    results.append({'gen_no': gen_no, 'status': 'no_recovery'})
                    continue

                # Get demands for this month
                dep_demand = execute_query(
                    "SELECT cd_demand, share_demand FROM deposit_ledger WHERE gen_no = %s AND month_year = %s AND transaction_type = 'DEMAND'",
                    (gen_no, month_year), fetch_one=True) or {'cd_demand': 0, 'share_demand': 0}

                loan_demands = execute_query(
                    "SELECT ll.loan_id, ll.principal_demand, ll.interest_demand, lm.loan_type FROM loan_ledger ll JOIN loan_master lm ON ll.loan_id = lm.loan_id WHERE ll.member_gen_no = %s AND ll.month_year = %s AND ll.transaction_type = 'DEMAND'",
                    (gen_no, month_year), fetch_all=True) or []

                remaining = total_amount
                cd_recv = Decimal('0')
                share_recv = Decimal('0')
                interest_recv = {}
                principal_recv = {}

                cd_dem = to_decimal(dep_demand['cd_demand'])
                share_dem = to_decimal(dep_demand['share_demand'])
                total_i_dem = sum(to_decimal(ld['interest_demand']) for ld in loan_demands)
                total_p_dem = sum(to_decimal(ld['principal_demand']) for ld in loan_demands)

                # Allocate according to priority
                for component in priority:
                    if remaining <= 0:
                        break
                    if component == 'CD':
                        cd_recv = min(remaining, cd_dem)
                        remaining -= cd_recv
                    elif component == 'Share':
                        share_recv = min(remaining, share_dem)
                        remaining -= share_recv
                    elif component == 'Interest':
                        for ld in loan_demands:
                            i_dem = to_decimal(ld['interest_demand'])
                            alloc = min(remaining, i_dem)
                            interest_recv[ld['loan_id']] = alloc
                            remaining -= alloc
                            if remaining <= 0: break
                    elif component == 'Principal':
                        for ld in loan_demands:
                            p_dem = to_decimal(ld['principal_demand'])
                            alloc = min(remaining, p_dem)
                            principal_recv[ld['loan_id']] = alloc
                            remaining -= alloc
                            if remaining <= 0: break

                is_partial = remaining < total_amount and (cd_recv < cd_dem or share_recv < share_dem
                    or sum(interest_recv.values(), Decimal('0')) < total_i_dem
                    or sum(principal_recv.values(), Decimal('0')) < total_p_dem)

                tx_type = 'PARTIAL_RECOVERY' if is_partial else 'RECOVERY'

                # Post deposit recovery
                cur.execute("""
                    INSERT INTO deposit_ledger (gen_no, month_year, transaction_type,
                        cd_received, share_received, cr_no, remark, posted_by)
                    VALUES (%s, %s, %s, %s, %s, %s, %s, %s)
                """, (gen_no, month_year, tx_type,
                      float(cd_recv), float(share_recv), cr_no, remark, username))

                # Post loan recoveries
                for ld in loan_demands:
                    lid = ld['loan_id']
                    p_recv = principal_recv.get(lid, Decimal('0'))
                    i_recv = interest_recv.get(lid, Decimal('0'))

                    loan = execute_query("SELECT outstanding_principal, outstanding_interest FROM loan_master WHERE loan_id = %s",
                                         (lid,), fetch_one=True)
                    new_p = to_decimal(loan['outstanding_principal']) - p_recv
                    # Unpaid interest added to outstanding interest (SRS 4.2.4)
                    unpaid_interest = to_decimal(ld['interest_demand']) - i_recv
                    new_i = to_decimal(loan['outstanding_interest']) + unpaid_interest - i_recv

                    cur.execute("""
                        INSERT INTO loan_ledger (loan_id, member_gen_no, month_year, transaction_type,
                            principal_demand, interest_demand, principal_received, interest_received,
                            outstanding_principal, outstanding_interest, cr_no, remark, posted_by)
                        VALUES (%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s)
                    """, (lid, gen_no, month_year, tx_type,
                          float(to_decimal(ld['principal_demand'])), float(to_decimal(ld['interest_demand'])),
                          float(p_recv), float(i_recv),
                          float(max(new_p, Decimal('0'))), float(max(new_i, Decimal('0'))),
                          cr_no, remark, username))

                    cur.execute("""
                        UPDATE loan_master SET outstanding_principal = %s, outstanding_interest = %s WHERE loan_id = %s
                    """, (float(max(new_p, Decimal('0'))), float(max(new_i, Decimal('0'))), lid))

                    # Check if loan fully paid
                    if new_p <= 0 and new_i <= 0:
                        cur.execute("UPDATE loan_master SET status = 'Closed', closed_date = NOW() WHERE loan_id = %s", (lid,))
                        cur.execute("UPDATE surety_mapping SET status = 'Released', released_date = NOW() WHERE loan_id = %s AND status = 'Active'", (lid,))

                    # Track consecutive defaults
                    if is_partial or (p_recv == 0 and i_recv == 0):
                        cur.execute("UPDATE loan_master SET consecutive_defaults = consecutive_defaults + 1 WHERE loan_id = %s", (lid,))
                        # Check 3-cycle default (SRS 4.2.8a)
                        cur.execute("SELECT consecutive_defaults FROM loan_master WHERE loan_id = %s", (lid,))
                        defaults = cur.fetchone()['consecutive_defaults']
                        if defaults >= 3:
                            cur.execute("UPDATE loan_master SET status = 'NPA' WHERE loan_id = %s AND status = 'Active'", (lid,))
                    else:
                        cur.execute("UPDATE loan_master SET consecutive_defaults = 0 WHERE loan_id = %s", (lid,))

                results.append({'gen_no': gen_no, 'status': tx_type, 'allocated': float(total_amount - remaining)})

        except Exception as e:
            results.append({'gen_no': gen_no, 'status': 'error', 'error': str(e)})

    log_action('demand', 'RECOVERY_POSTED', month_year, {
        'total': len(recoveries), 'posted': len([r for r in results if r['status'] != 'error'])
    })

    return {'month_year': month_year, 'results': results}


def _process_no_recovery(cur, gen_no, month_year, username):
    """Handle no-recovery case. SRS 4.4.2: Skip CD/Share, add interest to outstanding."""
    # No CD/Share recovery
    cur.execute("""
        INSERT INTO deposit_ledger (gen_no, month_year, transaction_type, remark, posted_by)
        VALUES (%s, %s, 'NO_RECOVERY', 'No recovery for this month', %s)
    """, (gen_no, month_year, username))

    # For loans: interest added to outstanding interest
    loan_demands = execute_query(
        "SELECT ll.loan_id, ll.interest_demand FROM loan_ledger ll WHERE ll.member_gen_no = %s AND ll.month_year = %s AND ll.transaction_type = 'DEMAND'",
        (gen_no, month_year), fetch_all=True) or []

    for ld in loan_demands:
        lid = ld['loan_id']
        i_dem = to_decimal(ld['interest_demand'])
        loan = execute_query("SELECT outstanding_principal, outstanding_interest FROM loan_master WHERE loan_id = %s",
                             (lid,), fetch_one=True)

        new_i = to_decimal(loan['outstanding_interest']) + i_dem

        cur.execute("""
            INSERT INTO loan_ledger (loan_id, member_gen_no, month_year, transaction_type,
                interest_demand, outstanding_principal, outstanding_interest, remark, posted_by)
            VALUES (%s,%s,%s,'NO_RECOVERY',%s,%s,%s,'No recovery',%s)
        """, (lid, gen_no, month_year, float(i_dem),
              float(loan['outstanding_principal']), float(new_i), username))

        cur.execute("UPDATE loan_master SET outstanding_interest = %s, consecutive_defaults = consecutive_defaults + 1 WHERE loan_id = %s",
                    (float(new_i), lid))


def get_demand_summary(month_year):
    """Get demand summary for a month."""
    summary = execute_query("""
        SELECT dl.gen_no, m.name, m.token_no, m.employee_type, m.part,
               dl.cd_demand, dl.share_demand,
               COALESCE(ll_agg.total_p_demand, 0) as ll_p_demand,
               COALESCE(ll_agg.total_i_demand, 0) as ll_i_demand,
               COALESCE(sl_agg.total_p_demand, 0) as sl_p_demand,
               COALESCE(sl_agg.total_i_demand, 0) as sl_i_demand
        FROM deposit_ledger dl
        JOIN members m ON dl.gen_no = m.gen_no
        LEFT JOIN (
            SELECT ll.member_gen_no, SUM(ll.principal_demand) as total_p_demand, SUM(ll.interest_demand) as total_i_demand
            FROM loan_ledger ll JOIN loan_master lm ON ll.loan_id = lm.loan_id
            WHERE ll.month_year = %s AND ll.transaction_type = 'DEMAND' AND lm.loan_type = 'LL'
            GROUP BY ll.member_gen_no
        ) ll_agg ON dl.gen_no = ll_agg.member_gen_no
        LEFT JOIN (
            SELECT ll.member_gen_no, SUM(ll.principal_demand) as total_p_demand, SUM(ll.interest_demand) as total_i_demand
            FROM loan_ledger ll JOIN loan_master lm ON ll.loan_id = lm.loan_id
            WHERE ll.month_year = %s AND ll.transaction_type = 'DEMAND' AND lm.loan_type = 'SL'
            GROUP BY ll.member_gen_no
        ) sl_agg ON dl.gen_no = sl_agg.member_gen_no
        WHERE dl.month_year = %s AND dl.transaction_type = 'DEMAND'
        ORDER BY m.gen_no
    """, (month_year, month_year, month_year), fetch_all=True) or []

    return [dict(r) for r in summary]
