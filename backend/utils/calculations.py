"""
NADSOC — Financial Calculation Helpers
Core formulas for loans, interest, deposits per SRS.
"""

from decimal import Decimal, ROUND_HALF_UP, InvalidOperation


def to_decimal(value, default=Decimal('0')):
    """Safely convert to Decimal."""
    if value is None:
        return default
    try:
        return Decimal(str(value))
    except (InvalidOperation, ValueError):
        return default


def round_amount(value):
    """Round to nearest integer (SRS: ROUND function)."""
    return int(to_decimal(value).quantize(Decimal('1'), rounding=ROUND_HALF_UP))


def calculate_monthly_interest(outstanding_principal, annual_rate):
    """
    Monthly Interest = Outstanding Principal × Annual Rate ÷ 12
    SRS 4.2.4 — Reducing Balance Method.
    """
    p = to_decimal(outstanding_principal)
    r = to_decimal(annual_rate)
    if p <= 0 or r <= 0:
        return Decimal('0')
    monthly_interest = (p * r) / (Decimal('12') * Decimal('100'))
    return monthly_interest.quantize(Decimal('0.01'), rounding=ROUND_HALF_UP)


def calculate_loan_tenure(sanction_amount, fixed_principal):
    """
    Tenure = Sanction Amount / Fixed Principal (rounded up).
    SRS 4.2.2 — Derived tenure.
    """
    amount = to_decimal(sanction_amount)
    principal = to_decimal(fixed_principal)
    if principal <= 0:
        return 0
    import math
    return math.ceil(float(amount / principal))


def generate_amortization_schedule(sanction_amount, interest_rate, fixed_principal):
    """
    Generate full amortization schedule for a loan.
    SRS 4.2.3 — Enhanced Amortization Schedule.

    Returns list of dicts:
    [
        {
            'installment_no': 1,
            'opening_balance': 400000,
            'principal': 4000,
            'interest': 3750.00,
            'total_installment': 7750.00,
            'closing_balance': 396000,
            'status': 'Unpaid'
        }, ...
    ]
    """
    amount = to_decimal(sanction_amount)
    rate = to_decimal(interest_rate)
    principal = to_decimal(fixed_principal)

    if principal <= 0 or amount <= 0:
        return []

    schedule = []
    balance = amount
    installment_no = 1

    while balance > 0:
        interest = calculate_monthly_interest(balance, rate)
        actual_principal = min(principal, balance)
        total = actual_principal + interest
        closing = balance - actual_principal

        schedule.append({
            'installment_no': installment_no,
            'opening_balance': float(balance),
            'principal': float(actual_principal),
            'interest': float(interest),
            'total_installment': float(total),
            'closing_balance': float(max(closing, Decimal('0'))),
            'status': 'Unpaid'
        })

        balance = closing
        installment_no += 1

        # Safety: prevent infinite loops
        if installment_no > 500:
            break

    return schedule


def calculate_cd_interest(monthly_balances, annual_rate):
    """
    CD Interest = ROUND(SUM(Monthly_CD_Balances) × Rate ÷ 12 ÷ 100, 0)
    SRS 4.3.
    """
    total = sum(to_decimal(b) for b in monthly_balances)
    rate = to_decimal(annual_rate)
    interest = (total * rate) / (Decimal('12') * Decimal('100'))
    return round_amount(interest)


def calculate_share_dividend(monthly_balances, dividend_rate):
    """
    Share Dividend = ROUND(SUM(Monthly_Share_Balances) × Rate ÷ 12 ÷ 100, 0)
    SRS 4.3.
    """
    total = sum(to_decimal(b) for b in monthly_balances)
    rate = to_decimal(dividend_rate)
    dividend = (total * rate) / (Decimal('12') * Decimal('100'))
    return round_amount(dividend)


def calculate_fd_maturity(deposit_amount, annual_rate, tenure_days):
    """
    Calculate FD maturity amount.
    Simple Interest: Maturity = Principal + (Principal × Rate × Days / 365 / 100)
    """
    p = to_decimal(deposit_amount)
    r = to_decimal(annual_rate)
    d = to_decimal(tenure_days)
    interest = (p * r * d) / (Decimal('365') * Decimal('100'))
    maturity = p + interest
    return round_amount(maturity)


def calculate_disbursement_breakup(sanction_amount, cd_balance, share_balance,
                                    cd_requirement_pct=20, share_requirement=8000,
                                    existing_ll_outstanding=0, existing_sl_outstanding=0,
                                    other_charges=0, close_ll=False, close_sl=False):
    """
    Calculate loan disbursement breakup (SRS 4.2.3).

    Returns dict with:
        cd_shortfall, share_shortfall, cd_funding, share_funding,
        ll_closure, sl_closure, other_charges, net_disbursed
    """
    amount = to_decimal(sanction_amount)
    cd_bal = to_decimal(cd_balance)
    share_bal = to_decimal(share_balance)
    cd_req_pct = to_decimal(cd_requirement_pct)
    share_req = to_decimal(share_requirement)

    # CD Requirement
    cd_required = (amount * cd_req_pct) / Decimal('100')
    cd_shortfall = max(Decimal('0'), cd_required - cd_bal)

    # Share Requirement
    share_shortfall = max(Decimal('0'), share_req - share_bal)

    # Closures
    ll_closure = to_decimal(existing_ll_outstanding) if close_ll else Decimal('0')
    sl_closure = to_decimal(existing_sl_outstanding) if close_sl else Decimal('0')

    other = to_decimal(other_charges)

    # Net Disbursed
    net_disbursed = amount - cd_shortfall - share_shortfall - ll_closure - sl_closure - other

    return {
        'sanction_amount': float(amount),
        'cd_required': float(cd_required),
        'cd_balance': float(cd_bal),
        'cd_shortfall': float(cd_shortfall),
        'cd_funding': float(cd_shortfall),
        'share_required': float(share_req),
        'share_balance': float(share_bal),
        'share_shortfall': float(share_shortfall),
        'share_funding': float(share_shortfall),
        'll_closure': float(ll_closure),
        'sl_closure': float(sl_closure),
        'other_charges': float(other),
        'net_disbursed': float(net_disbursed)
    }
