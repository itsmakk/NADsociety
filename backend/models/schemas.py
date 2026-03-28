"""
NADSOC — Data Validation Schemas
Server-side validation for every input field (SRS 11).
"""

import re
from datetime import datetime, date


class ValidationError(Exception):
    def __init__(self, errors):
        self.errors = errors if isinstance(errors, list) else [errors]
        super().__init__(str(self.errors))


def validate_required(data, fields):
    """Check that required fields are present and non-empty."""
    errors = []
    for field in fields:
        val = data.get(field)
        if val is None or (isinstance(val, str) and val.strip() == ''):
            errors.append(f'{field} is required')
    return errors


def validate_member(data, is_update=False):
    """Validate member data per SRS 4.1."""
    errors = []

    if not is_update:
        required = ['gen_no', 'name', 'employee_type']
        errors.extend(validate_required(data, required))

    gen_no = data.get('gen_no', '')
    if gen_no and not re.match(r'^[A-Za-z0-9\-]+$', gen_no):
        errors.append('GEN No must contain only letters, numbers, and hyphens')

    name = data.get('name', '')
    if name and len(name) < 2:
        errors.append('Name must be at least 2 characters')
    if name and len(name) > 100:
        errors.append('Name cannot exceed 100 characters')

    emp_type = data.get('employee_type', '')
    if emp_type and emp_type not in ('Industrial', 'Non-Industrial'):
        errors.append('Employee type must be Industrial or Non-Industrial')

    status = data.get('member_status', '')
    if status and status not in ('Active', 'Retired', 'Resigned', 'Transferred', 'Settled', 'Deceased', 'Inactive'):
        errors.append('Invalid member status')

    # Aadhaar validation (12 digits)
    aadhaar = data.get('aadhaar_no', '')
    if aadhaar and not re.match(r'^\d{12}$', aadhaar):
        errors.append('Aadhaar must be exactly 12 digits')

    # PAN validation (AAAAA0000A format)
    pan = data.get('pan_no', '')
    if pan and not re.match(r'^[A-Z]{5}\d{4}[A-Z]$', pan.upper()):
        errors.append('PAN must be in format AAAAA0000A')

    # Mobile validation
    mobile = data.get('mobile_no', '')
    if mobile and not re.match(r'^\d{10}$', mobile):
        errors.append('Mobile number must be 10 digits')

    # Email validation
    email = data.get('email_id', '')
    if email and not re.match(r'^[^@]+@[^@]+\.[^@]+$', email):
        errors.append('Invalid email format')

    # Date validations
    for date_field in ['dob', 'doj', 'dor']:
        date_val = data.get(date_field)
        if date_val:
            try:
                if isinstance(date_val, str):
                    datetime.strptime(date_val, '%Y-%m-%d')
            except ValueError:
                errors.append(f'{date_field} must be in YYYY-MM-DD format')

    if errors:
        raise ValidationError(errors)
    return True


def validate_loan(data):
    """Validate loan creation data per SRS 4.2."""
    errors = []
    errors.extend(validate_required(data, ['member_gen_no', 'loan_type', 'sanction_amount',
                                            'interest_rate', 'fixed_principal_amount']))

    loan_type = data.get('loan_type', '')
    if loan_type not in ('LL', 'SL'):
        errors.append('Loan type must be LL or SL')

    amount = data.get('sanction_amount', 0)
    try:
        amount = float(amount)
        if amount <= 0:
            errors.append('Sanction amount must be positive')
    except (ValueError, TypeError):
        errors.append('Invalid sanction amount')

    rate = data.get('interest_rate', 0)
    try:
        rate = float(rate)
        if rate < 0:
            errors.append('Interest rate cannot be negative')
    except (ValueError, TypeError):
        errors.append('Invalid interest rate')

    principal = data.get('fixed_principal_amount', 0)
    try:
        principal = float(principal)
        if principal <= 0:
            errors.append('Fixed principal amount must be positive')
    except (ValueError, TypeError):
        errors.append('Invalid fixed principal amount')

    if errors:
        raise ValidationError(errors)
    return True


def validate_positive_amount(value, field_name='Amount'):
    """Validate that a value is a positive number."""
    try:
        val = float(value)
        if val <= 0:
            raise ValidationError(f'{field_name} must be positive')
        return val
    except (ValueError, TypeError):
        raise ValidationError(f'{field_name} must be a valid number')


def validate_non_negative_amount(value, field_name='Amount'):
    """Validate that a value is non-negative."""
    try:
        val = float(value)
        if val < 0:
            raise ValidationError(f'{field_name} cannot be negative')
        return val
    except (ValueError, TypeError):
        raise ValidationError(f'{field_name} must be a valid number')


def validate_month_year(value):
    """Validate YYYY-MM format."""
    if not value or not re.match(r'^\d{4}-\d{2}$', value):
        raise ValidationError('Month-year must be in YYYY-MM format')
    try:
        year, month = value.split('-')
        if not (1 <= int(month) <= 12):
            raise ValidationError('Invalid month')
        if not (2000 <= int(year) <= 2099):
            raise ValidationError('Invalid year')
    except ValueError:
        raise ValidationError('Invalid month-year format')
    return value


def validate_date(value, field_name='Date'):
    """Validate and parse a date string."""
    if not value:
        raise ValidationError(f'{field_name} is required')
    try:
        if isinstance(value, str):
            return datetime.strptime(value, '%Y-%m-%d').date()
        if isinstance(value, (date, datetime)):
            return value if isinstance(value, date) else value.date()
    except ValueError:
        pass
    raise ValidationError(f'{field_name} must be in YYYY-MM-DD format')


def sanitize_string(value, max_length=255):
    """Sanitize a string input: strip whitespace, limit length."""
    if value is None:
        return None
    s = str(value).strip()
    if len(s) > max_length:
        s = s[:max_length]
    # Remove null bytes and control characters
    s = re.sub(r'[\x00-\x08\x0b\x0c\x0e-\x1f]', '', s)
    return s if s else None
