"""
NADSOC — Reports API Routes (SRS 4.10)
Excel-generated on demand, never stored.
"""

from flask import Blueprint, request, jsonify, send_file
from middleware.auth import require_auth, get_current_username
from middleware.rbac import require_permission
from utils.db import execute_query
from utils.excel import create_excel_report
from models.schemas import validate_month_year, ValidationError

reports_bp = Blueprint('reports', __name__)


@reports_bp.route('/demand-statement', methods=['GET'])
@require_auth
@require_permission('reports', 'read')
def demand_statement():
    """Demand/Recovery Statement Excel — SRS 4.10.1."""
    month_year = request.args.get('month_year')
    emp_type = request.args.get('employee_type')
    part = request.args.get('part')
    try:
        validate_month_year(month_year)
    except ValidationError as e:
        return jsonify({'error': e.errors}), 400

    conditions = ["dl.month_year = %s", "dl.transaction_type = 'DEMAND'"]
    params = [month_year]
    if emp_type:
        conditions.append("m.employee_type = %s"); params.append(emp_type)
    if part:
        conditions.append("m.part = %s"); params.append(part)

    where = " AND ".join(conditions)
    rows = execute_query(f"""
        SELECT m.gen_no, m.token_no, m.name, m.employee_type, m.part,
               dl.cd_demand, dl.share_demand,
               COALESCE(ll.p_dem, 0) as ll_principal, COALESCE(ll.i_dem, 0) as ll_interest,
               COALESCE(sl.p_dem, 0) as sl_principal, COALESCE(sl.i_dem, 0) as sl_interest
        FROM deposit_ledger dl
        JOIN members m ON dl.gen_no = m.gen_no
        LEFT JOIN (SELECT member_gen_no, SUM(principal_demand) p_dem, SUM(interest_demand) i_dem
                   FROM loan_ledger WHERE month_year=%s AND transaction_type='DEMAND'
                   GROUP BY member_gen_no) ll ON dl.gen_no = ll.member_gen_no
        LEFT JOIN (SELECT ll2.member_gen_no, SUM(ll2.principal_demand) p_dem, SUM(ll2.interest_demand) i_dem
                   FROM loan_ledger ll2 JOIN loan_master lm ON ll2.loan_id=lm.loan_id
                   WHERE ll2.month_year=%s AND ll2.transaction_type='DEMAND' AND lm.loan_type='SL'
                   GROUP BY ll2.member_gen_no) sl ON dl.gen_no = sl.member_gen_no
        WHERE {where} ORDER BY m.gen_no
    """, tuple([month_year, month_year] + params), fetch_all=True) or []

    data = []
    for idx, r in enumerate(rows, 1):
        d = dict(r)
        total = sum(float(d.get(k, 0) or 0) for k in ['cd_demand', 'share_demand', 'll_principal', 'll_interest', 'sl_principal', 'sl_interest'])
        d['total'] = total
        d['sr_no'] = idx
        data.append(d)

    columns = [
        {'header': 'Sr', 'key': 'sr_no', 'width': 5, 'format': 'integer'},
        {'header': 'GEN No', 'key': 'gen_no', 'width': 10},
        {'header': 'Token', 'key': 'token_no', 'width': 10},
        {'header': 'Name', 'key': 'name', 'width': 22},
        {'header': 'CD', 'key': 'cd_demand', 'width': 10, 'format': 'number'},
        {'header': 'Share', 'key': 'share_demand', 'width': 10, 'format': 'number'},
        {'header': 'LL Prin', 'key': 'll_principal', 'width': 12, 'format': 'number'},
        {'header': 'LL Int', 'key': 'll_interest', 'width': 12, 'format': 'number'},
        {'header': 'SL Prin', 'key': 'sl_principal', 'width': 12, 'format': 'number'},
        {'header': 'SL Int', 'key': 'sl_interest', 'width': 12, 'format': 'number'},
        {'header': 'Total', 'key': 'total', 'width': 14, 'format': 'number'},
    ]

    subtitle = f'{month_year}'
    if emp_type: subtitle += f' | {emp_type}'
    if part: subtitle += f' / {part}'

    buffer = create_excel_report('DEMAND/RECOVERY STATEMENT', subtitle, columns, data)
    return send_file(buffer, mimetype='application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
                     as_attachment=True, download_name=f'Demand_Statement_{month_year}.xlsx')


@reports_bp.route('/trial-balance', methods=['GET'])
@require_auth
@require_permission('reports', 'read')
def trial_balance():
    """Trial Balance report — SRS 4.10.2."""
    rows = execute_query("""
        SELECT m.gen_no, m.token_no, m.name, m.employee_type, m.part,
               COALESCE(d.cd_balance, 0) as cd_balance, COALESCE(d.share_balance, 0) as share_balance,
               COALESCE(ll.outstanding, 0) as ll_outstanding, COALESCE(sl.outstanding, 0) as sl_outstanding
        FROM members m
        LEFT JOIN member_deposit_summary d ON m.gen_no = d.gen_no
        LEFT JOIN (SELECT member_gen_no, SUM(outstanding_principal + outstanding_interest) as outstanding
                   FROM loan_master WHERE loan_type='LL' AND status IN ('Active','NPA') GROUP BY member_gen_no) ll ON m.gen_no = ll.member_gen_no
        LEFT JOIN (SELECT member_gen_no, SUM(outstanding_principal + outstanding_interest) as outstanding
                   FROM loan_master WHERE loan_type='SL' AND status IN ('Active','NPA') GROUP BY member_gen_no) sl ON m.gen_no = sl.member_gen_no
        WHERE m.member_status = 'Active'
        ORDER BY m.gen_no
    """, fetch_all=True) or []

    if request.args.get('format') == 'excel':
        data = [dict(r) for r in rows]
        columns = [
            {'header': 'GEN No', 'key': 'gen_no', 'width': 10},
            {'header': 'Name', 'key': 'name', 'width': 22},
            {'header': 'CD Bal', 'key': 'cd_balance', 'width': 14, 'format': 'number'},
            {'header': 'Share Bal', 'key': 'share_balance', 'width': 14, 'format': 'number'},
            {'header': 'LL Outstanding', 'key': 'll_outstanding', 'width': 14, 'format': 'number'},
            {'header': 'SL Outstanding', 'key': 'sl_outstanding', 'width': 14, 'format': 'number'},
        ]
        buffer = create_excel_report('TRIAL BALANCE', '', columns, data)
        return send_file(buffer, mimetype='application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
                         as_attachment=True, download_name='Trial_Balance.xlsx')

    return jsonify({'members': [dict(r) for r in rows], 'total': len(rows)}), 200


@reports_bp.route('/defaulters', methods=['GET'])
@require_auth
@require_permission('reports', 'read')
def defaulters_report():
    """Defaulters list — SRS 4.10.5."""
    threshold = request.args.get('months', 3, type=int)
    rows = execute_query("""
        SELECT lm.loan_id, lm.loan_type, lm.member_gen_no, m.name, m.token_no,
               lm.outstanding_principal, lm.outstanding_interest, lm.consecutive_defaults, lm.status
        FROM loan_master lm JOIN members m ON lm.member_gen_no = m.gen_no
        WHERE lm.consecutive_defaults >= %s AND lm.status IN ('Active', 'NPA')
        ORDER BY lm.consecutive_defaults DESC
    """, (threshold,), fetch_all=True) or []
    return jsonify({'defaulters': [dict(r) for r in rows], 'total': len(rows), 'threshold': threshold}), 200


@reports_bp.route('/npa', methods=['GET'])
@require_auth
@require_permission('reports', 'read')
def npa_report():
    """NPA loans report — SRS 4.10.5."""
    rows = execute_query("""
        SELECT lm.*, m.name, m.token_no FROM loan_master lm
        JOIN members m ON lm.member_gen_no = m.gen_no WHERE lm.status = 'NPA'
        ORDER BY lm.outstanding_principal + lm.outstanding_interest DESC
    """, fetch_all=True) or []
    result = []
    for r in rows:
        d = dict(r)
        d['total_outstanding'] = float(d.get('outstanding_principal', 0)) + float(d.get('outstanding_interest', 0))
        for k, v in d.items():
            if hasattr(v, 'isoformat'): d[k] = v.isoformat()
        result.append(d)
    return jsonify({'npa_loans': result, 'total': len(result),
                    'total_exposure': sum(d['total_outstanding'] for d in result)}), 200


@reports_bp.route('/dashboard', methods=['GET'])
@require_auth
def dashboard_stats():
    """Dashboard summary stats."""
    stats = {}
    stats['total_members'] = execute_query("SELECT COUNT(*) as c FROM members WHERE member_status='Active'", fetch_one=True)['c']
    stats['total_loans'] = execute_query("SELECT COUNT(*) as c FROM loan_master WHERE status='Active'", fetch_one=True)['c']
    stats['npa_count'] = execute_query("SELECT COUNT(*) as c FROM loan_master WHERE status='NPA'", fetch_one=True)['c']

    agg = execute_query("SELECT COALESCE(SUM(cd_balance),0) as cd, COALESCE(SUM(share_balance),0) as share FROM member_deposit_summary", fetch_one=True)
    stats['total_cd'] = float(agg['cd'])
    stats['total_share'] = float(agg['share'])

    loan_agg = execute_query("""
        SELECT COALESCE(SUM(outstanding_principal),0) as p, COALESCE(SUM(outstanding_interest),0) as i
        FROM loan_master WHERE status IN ('Active','NPA')
    """, fetch_one=True)
    stats['total_loan_outstanding'] = float(loan_agg['p']) + float(loan_agg['i'])

    fd_agg = execute_query("SELECT COUNT(*) as c, COALESCE(SUM(deposit_amount),0) as total FROM fd_master WHERE status='Active'", fetch_one=True)
    stats['active_fds'] = fd_agg['c']
    stats['total_fd_amount'] = float(fd_agg['total'])

    return jsonify({'stats': stats}), 200
