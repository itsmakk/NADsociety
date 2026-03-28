"""
NADSOC — Member Service (Business Logic Layer)
All member CRUD operations with ledger integration.
SRS 4.1 — Member Management Module.
"""

from utils.db import get_transaction, execute_query, set_app_user
from models.schemas import validate_member, sanitize_string, ValidationError
from services.audit_service import log_action


def get_members(filters=None, page=1, per_page=25, search=None, sort_by='gen_no', sort_dir='asc'):
    """
    List members with filtering, searching, sorting, and pagination.
    Returns dict with 'members', 'total', 'page', 'per_page', 'total_pages'.
    """
    conditions = []
    params = []

    if filters:
        if filters.get('status'):
            conditions.append("m.member_status = %s")
            params.append(filters['status'])
        if filters.get('employee_type'):
            conditions.append("m.employee_type = %s")
            params.append(filters['employee_type'])
        if filters.get('part'):
            conditions.append("m.part = %s")
            params.append(filters['part'])

    if search:
        conditions.append(
            "(m.gen_no ILIKE %s OR m.name ILIKE %s OR m.token_no ILIKE %s OR m.mobile_no ILIKE %s)"
        )
        search_param = f"%{search}%"
        params.extend([search_param, search_param, search_param, search_param])

    where_clause = " AND ".join(conditions) if conditions else "1=1"

    # Validate sort column
    allowed_sorts = ['gen_no', 'name', 'token_no', 'employee_type', 'part', 'member_status', 'doj']
    if sort_by not in allowed_sorts:
        sort_by = 'gen_no'
    sort_dir = 'DESC' if sort_dir.upper() == 'DESC' else 'ASC'

    # Count
    count_q = f"SELECT COUNT(*) as total FROM members m WHERE {where_clause}"
    total = execute_query(count_q, tuple(params), fetch_one=True)['total']

    # Fetch page with deposit summary
    offset = (page - 1) * per_page
    data_q = f"""
        SELECT m.gen_no, m.token_no, m.name, m.designation, m.employee_type, m.part,
               m.dob, m.doj, m.dor, m.mobile_no, m.email_id, m.member_status,
               m.profile_remark, m.created_date,
               COALESCE(d.cd_balance, 0) as cd_balance,
               COALESCE(d.share_balance, 0) as share_balance
        FROM members m
        LEFT JOIN member_deposit_summary d ON m.gen_no = d.gen_no
        WHERE {where_clause}
        ORDER BY m.{sort_by} {sort_dir}
        LIMIT %s OFFSET %s
    """
    params.extend([per_page, offset])
    rows = execute_query(data_q, tuple(params), fetch_all=True) or []

    members = []
    for r in rows:
        member = dict(r)
        for dt_field in ['dob', 'doj', 'dor', 'created_date']:
            if member.get(dt_field):
                member[dt_field] = str(member[dt_field])
        members.append(member)

    return {
        'members': members,
        'total': total,
        'page': page,
        'per_page': per_page,
        'total_pages': max(1, (total + per_page - 1) // per_page)
    }


def get_member(gen_no):
    """Get a single member profile with financial summary."""
    member = execute_query(
        """SELECT m.*, COALESCE(d.cd_balance, 0) as cd_balance,
                  COALESCE(d.share_balance, 0) as share_balance
           FROM members m
           LEFT JOIN member_deposit_summary d ON m.gen_no = d.gen_no
           WHERE m.gen_no = %s""",
        (gen_no,), fetch_one=True
    )
    if not member:
        return None

    result = dict(member)

    # Get active loans
    loans = execute_query(
        """SELECT loan_id, loan_type, sanction_amount, outstanding_principal,
                  outstanding_interest, status, created_date
           FROM loan_master WHERE member_gen_no = %s AND status IN ('Active', 'NPA')
           ORDER BY created_date DESC""",
        (gen_no,), fetch_all=True
    ) or []
    result['active_loans'] = [dict(l) for l in loans]

    # Get active FDs
    fds = execute_query(
        """SELECT fd_no, deposit_amount, interest_rate, start_date, maturity_date,
                  maturity_amount, status
           FROM fd_master WHERE member_gen_no = %s AND status = 'Active'
           ORDER BY start_date DESC""",
        (gen_no,), fetch_all=True
    ) or []
    result['active_fds'] = [dict(f) for f in fds]

    # Get surety exposure
    sureties = execute_query(
        """SELECT sm.surety_id, sm.loan_id, sm.borrower_gen_no, sm.surety_type, sm.status,
                  lm.outstanding_principal + lm.outstanding_interest as loan_outstanding,
                  bm.name as borrower_name
           FROM surety_mapping sm
           JOIN loan_master lm ON sm.loan_id = lm.loan_id
           JOIN members bm ON sm.borrower_gen_no = bm.gen_no
           WHERE sm.surety_gen_no = %s AND sm.status = 'Active'""",
        (gen_no,), fetch_all=True
    ) or []
    result['surety_exposure'] = [dict(s) for s in sureties]

    # Serialize dates
    for key, val in result.items():
        if hasattr(val, 'isoformat'):
            result[key] = val.isoformat()

    return result


def create_member(data, username):
    """Create a new member. SRS: GEN_No must be unique, mandatory fields enforced."""
    validate_member(data)

    # Check duplicate GEN_No
    existing = execute_query(
        "SELECT gen_no FROM members WHERE gen_no = %s",
        (data['gen_no'],), fetch_one=True
    )
    if existing:
        raise ValidationError(f"GEN No {data['gen_no']} already exists")

    # Check duplicate Aadhaar
    if data.get('aadhaar_no'):
        dup = execute_query(
            "SELECT gen_no FROM members WHERE aadhaar_no = %s",
            (data['aadhaar_no'],), fetch_one=True
        )
        if dup:
            raise ValidationError(f"Aadhaar {data['aadhaar_no']} is already registered to {dup['gen_no']}")

    # Check duplicate PAN
    if data.get('pan_no'):
        dup = execute_query(
            "SELECT gen_no FROM members WHERE pan_no = %s",
            (data['pan_no'].upper(),), fetch_one=True
        )
        if dup:
            raise ValidationError(f"PAN {data['pan_no']} is already registered to {dup['gen_no']}")

    with get_transaction() as cur:
        set_app_user(cur, username)

        cur.execute("""
            INSERT INTO members (
                gen_no, token_no, name, designation, employee_type, part,
                dob, doj, dor, mobile_no, email_id,
                present_address, permanent_address,
                nominee_name, nominee_relation,
                aadhaar_no, pan_no, bank_name, bank_account_no, ifsc_code,
                member_status, profile_remark, previous_gen_no
            ) VALUES (
                %s, %s, %s, %s, %s, %s,
                %s, %s, %s, %s, %s,
                %s, %s, %s, %s,
                %s, %s, %s, %s, %s,
                %s, %s, %s
            )
        """, (
            data['gen_no'],
            sanitize_string(data.get('token_no')),
            sanitize_string(data['name']),
            sanitize_string(data.get('designation')),
            data['employee_type'],
            sanitize_string(data.get('part')),
            data.get('dob'), data.get('doj'), data.get('dor'),
            sanitize_string(data.get('mobile_no')),
            sanitize_string(data.get('email_id')),
            sanitize_string(data.get('present_address'), 500),
            sanitize_string(data.get('permanent_address'), 500),
            sanitize_string(data.get('nominee_name')),
            sanitize_string(data.get('nominee_relation')),
            sanitize_string(data.get('aadhaar_no')),
            sanitize_string(data.get('pan_no', ''), 10).upper() if data.get('pan_no') else None,
            sanitize_string(data.get('bank_name')),
            sanitize_string(data.get('bank_account_no')),
            sanitize_string(data.get('ifsc_code')),
            data.get('member_status', 'Active'),
            sanitize_string(data.get('profile_remark'), 500),
            sanitize_string(data.get('previous_gen_no'))
        ))

        # Create deposit summary entry
        cur.execute(
            "INSERT INTO member_deposit_summary (gen_no) VALUES (%s) ON CONFLICT DO NOTHING",
            (data['gen_no'],)
        )

        log_action('members', 'CREATE', data['gen_no'], {
            'name': data['name'], 'employee_type': data['employee_type']
        }, cursor=cur)

    return {'gen_no': data['gen_no'], 'message': 'Member created successfully'}


def update_member(gen_no, data, username):
    """Update member profile. GEN_No cannot be modified."""
    validate_member(data, is_update=True)

    existing = execute_query("SELECT gen_no FROM members WHERE gen_no = %s", (gen_no,), fetch_one=True)
    if not existing:
        raise ValidationError(f"Member {gen_no} not found")

    # Check duplicate Aadhaar (excluding self)
    if data.get('aadhaar_no'):
        dup = execute_query(
            "SELECT gen_no FROM members WHERE aadhaar_no = %s AND gen_no != %s",
            (data['aadhaar_no'], gen_no), fetch_one=True
        )
        if dup:
            raise ValidationError(f"Aadhaar already registered to {dup['gen_no']}")

    # Check duplicate PAN (excluding self)
    if data.get('pan_no'):
        dup = execute_query(
            "SELECT gen_no FROM members WHERE pan_no = %s AND gen_no != %s",
            (data['pan_no'].upper(), gen_no), fetch_one=True
        )
        if dup:
            raise ValidationError(f"PAN already registered to {dup['gen_no']}")

    # Build dynamic update
    update_fields = []
    update_params = []
    allowed = [
        'token_no', 'name', 'designation', 'employee_type', 'part',
        'dob', 'doj', 'dor', 'mobile_no', 'email_id',
        'present_address', 'permanent_address',
        'nominee_name', 'nominee_relation',
        'aadhaar_no', 'pan_no', 'bank_name', 'bank_account_no', 'ifsc_code',
        'profile_remark'
    ]

    for field in allowed:
        if field in data:
            val = data[field]
            if isinstance(val, str):
                max_len = 500 if field in ('present_address', 'permanent_address', 'profile_remark') else 255
                val = sanitize_string(val, max_len)
                if field == 'pan_no' and val:
                    val = val.upper()
            update_fields.append(f"{field} = %s")
            update_params.append(val)

    if not update_fields:
        raise ValidationError("No fields to update")

    update_params.append(gen_no)

    with get_transaction() as cur:
        set_app_user(cur, username)
        cur.execute(
            f"UPDATE members SET {', '.join(update_fields)}, updated_date = NOW() WHERE gen_no = %s",
            tuple(update_params)
        )
        log_action('members', 'UPDATE', gen_no, {'fields_updated': list(data.keys())}, cursor=cur)

    return {'gen_no': gen_no, 'message': 'Member updated successfully'}


def change_member_status(gen_no, new_status, username):
    """Change member status. SRS: Admin only. Cannot reactivate settled members."""
    valid = ['Active', 'Retired', 'Resigned', 'Transferred', 'Settled', 'Deceased', 'Inactive']
    if new_status not in valid:
        raise ValidationError(f"Invalid status. Must be one of: {', '.join(valid)}")

    member = execute_query(
        "SELECT gen_no, member_status FROM members WHERE gen_no = %s",
        (gen_no,), fetch_one=True
    )
    if not member:
        raise ValidationError(f"Member {gen_no} not found")

    if member['member_status'] == 'Settled':
        raise ValidationError("Settled member accounts cannot be reactivated. Use new GEN_No for rejoining.")

    with get_transaction() as cur:
        set_app_user(cur, username)
        cur.execute(
            "UPDATE members SET member_status = %s, updated_date = NOW() WHERE gen_no = %s",
            (new_status, gen_no)
        )
        log_action('members', 'STATUS_CHANGE', gen_no, {
            'old_status': member['member_status'],
            'new_status': new_status
        }, cursor=cur)

    return {'gen_no': gen_no, 'message': f'Status changed to {new_status}'}


def get_member_transaction_history(gen_no, page=1, per_page=50):
    """Get comprehensive transaction history for a member (SRS 4.1)."""
    # Loan transactions
    loan_q = """
        SELECT posted_date as date, 'Loan' as module,
               CASE WHEN transaction_type = 'DISBURSEMENT' THEN loan_id || ' (' || transaction_type || ')'
                    ELSE loan_id END as description,
               transaction_type as type,
               principal_received + interest_received as credit,
               principal_demand + interest_demand as debit,
               outstanding_principal + outstanding_interest as balance,
               cr_no, voucher_no, remark
        FROM loan_ledger WHERE member_gen_no = %s
    """

    # Deposit transactions
    dep_q = """
        SELECT posted_date as date, 'Deposit' as module,
               transaction_type as description,
               transaction_type as type,
               cd_received + share_received as credit,
               cd_demand + share_demand as debit,
               0 as balance,
               cr_no, voucher_no, remark
        FROM deposit_ledger WHERE gen_no = %s
    """

    combined = f"""
        SELECT * FROM (
            ({loan_q}) UNION ALL ({dep_q})
        ) combined
        ORDER BY date DESC
        LIMIT %s OFFSET %s
    """
    offset = (page - 1) * per_page
    rows = execute_query(combined, (gen_no, gen_no, per_page, offset), fetch_all=True) or []

    result = []
    for r in rows:
        row_dict = dict(r)
        if row_dict.get('date'):
            row_dict['date'] = row_dict['date'].isoformat()
        result.append(row_dict)

    return {'transactions': result, 'page': page, 'per_page': per_page}
