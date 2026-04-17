"""
NADSOC — Input Sanitization Middleware
Sanitizes all incoming request data to prevent XSS & injection (SRS Phase 5).
Works as a before_request hook to clean data before it reaches route handlers.
"""

import re
import html
from flask import request, g


# HTML tags that are NEVER allowed in any input
DANGEROUS_TAGS = re.compile(
    r'<\s*(?:script|iframe|object|embed|form|input|link|meta|style|svg|math|base|applet)'
    r'[^>]*>',
    re.IGNORECASE
)

# JavaScript event handlers (onclick, onerror, etc.)
EVENT_HANDLERS = re.compile(
    r'\bon\w+\s*=',
    re.IGNORECASE
)

# JavaScript protocol in URLs
JS_PROTOCOL = re.compile(
    r'(?:javascript|data|vbscript)\s*:',
    re.IGNORECASE
)

# SQL injection patterns (common attack signatures)
SQL_INJECTION_PATTERNS = re.compile(
    r"(?:"
    r"(?:'\s*(?:OR|AND|UNION)\s+)"           # ' OR, ' AND, ' UNION
    r"|(?:--\s*$)"                             # SQL comment
    r"|(?:;\s*(?:DROP|DELETE|INSERT|UPDATE|ALTER|CREATE|EXEC|TRUNCATE))"  # chained SQL
    r"|(?:UNION\s+(?:ALL\s+)?SELECT)"          # UNION SELECT
    r"|(?:INTO\s+(?:OUTFILE|DUMPFILE))"        # file operations
    r"|(?:LOAD_FILE\s*\()"                     # file read
    r"|(?:SLEEP\s*\(\s*\d+\s*\))"              # time-based blind
    r"|(?:BENCHMARK\s*\()"                     # benchmark attacks
    r"|(?:WAITFOR\s+DELAY)"                    # MSSQL time-based
    r")",
    re.IGNORECASE
)

# Null bytes and control characters
CONTROL_CHARS = re.compile(r'[\x00-\x08\x0b\x0c\x0e-\x1f\x7f]')


def sanitize_value(value, field_name=''):
    """
    Sanitize a single string value.
    - Strips control characters
    - Escapes HTML entities
    - Detects and blocks dangerous patterns
    Returns (sanitized_value, warnings)
    """
    if not isinstance(value, str):
        return value, []

    warnings = []
    original = value

    # Remove null bytes and control characters
    value = CONTROL_CHARS.sub('', value)

    # Detect dangerous HTML tags
    if DANGEROUS_TAGS.search(value):
        warnings.append(f'Dangerous HTML tag detected in {field_name}')
        value = DANGEROUS_TAGS.sub('[removed]', value)

    # Detect event handlers
    if EVENT_HANDLERS.search(value):
        warnings.append(f'Event handler detected in {field_name}')
        value = EVENT_HANDLERS.sub('[removed]=', value)

    # Detect JavaScript protocols
    if JS_PROTOCOL.search(value):
        warnings.append(f'Script protocol detected in {field_name}')
        value = JS_PROTOCOL.sub('[removed]:', value)

    # Detect SQL injection attempts (log but don't modify — parameterized queries handle this)
    if SQL_INJECTION_PATTERNS.search(value):
        warnings.append(f'Potential SQL injection pattern in {field_name}')
        # We log but don't strip — parameterized queries prevent actual injection
        # Stripping could corrupt legitimate data (e.g., names with apostrophes)

    # HTML-encode angle brackets for display safety
    # (preserves the data but prevents browser rendering)
    value = value.replace('<', '&lt;').replace('>', '&gt;')

    return value, warnings


def sanitize_dict(data, parent_key=''):
    """Recursively sanitize all string values in a dictionary."""
    if not isinstance(data, dict):
        return data, []

    sanitized = {}
    all_warnings = []

    for key, value in data.items():
        full_key = f"{parent_key}.{key}" if parent_key else key

        if isinstance(value, str):
            sanitized[key], warnings = sanitize_value(value, full_key)
            all_warnings.extend(warnings)
        elif isinstance(value, dict):
            sanitized[key], warnings = sanitize_dict(value, full_key)
            all_warnings.extend(warnings)
        elif isinstance(value, list):
            sanitized[key], warnings = sanitize_list(value, full_key)
            all_warnings.extend(warnings)
        else:
            sanitized[key] = value

    return sanitized, all_warnings


def sanitize_list(data, parent_key=''):
    """Recursively sanitize all string values in a list."""
    if not isinstance(data, list):
        return data, []

    sanitized = []
    all_warnings = []

    for i, item in enumerate(data):
        full_key = f"{parent_key}[{i}]"
        if isinstance(item, str):
            clean, warnings = sanitize_value(item, full_key)
            sanitized.append(clean)
            all_warnings.extend(warnings)
        elif isinstance(item, dict):
            clean, warnings = sanitize_dict(item, full_key)
            sanitized.append(clean)
            all_warnings.extend(warnings)
        elif isinstance(item, list):
            clean, warnings = sanitize_list(item, full_key)
            sanitized.append(clean)
            all_warnings.extend(warnings)
        else:
            sanitized.append(item)

    return sanitized, all_warnings


def init_sanitizer(app):
    """Register input sanitization middleware on the Flask app."""

    @app.before_request
    def sanitize_request_data():
        """Sanitize JSON request bodies before they reach route handlers."""
        if request.is_json and request.data:
            try:
                data = request.get_json(silent=True)
                if data and isinstance(data, dict):
                    sanitized, warnings = sanitize_dict(data)

                    # Log warnings for security monitoring
                    if warnings:
                        ip = request.headers.get('X-Forwarded-For',
                                                  request.remote_addr or 'unknown')
                        app.logger.warning(
                            f"Sanitization warnings from {ip} on {request.path}: "
                            f"{'; '.join(warnings)}"
                        )

                    # Store sanitized data for route handlers
                    g.sanitized_data = sanitized
                    g.sanitization_warnings = warnings
            except Exception:
                pass  # Let the route handler deal with malformed JSON

    # Sanitize query parameters
    @app.before_request
    def sanitize_query_params():
        """Sanitize URL query parameters."""
        if request.args:
            sanitized_args = {}
            for key, value in request.args.items():
                clean, _ = sanitize_value(value, f'query.{key}')
                sanitized_args[key] = clean
            g.sanitized_args = sanitized_args


def get_sanitized_data():
    """
    Get sanitized request data.
    Use this instead of request.get_json() in route handlers for extra safety.
    Falls back to request.get_json() if sanitizer hasn't processed.
    """
    return getattr(g, 'sanitized_data', None) or request.get_json(silent=True) or {}


def get_sanitized_args():
    """Get sanitized query parameters."""
    return getattr(g, 'sanitized_args', None) or dict(request.args)
