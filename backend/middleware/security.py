"""
NADSOC — Security Headers & Session Configuration
Centralized security header management (SRS Phase 5).
Covers: CSP, HSTS, X-Frame-Options, cookie config, session timeout.
"""

import os
from flask import request


def init_security_headers(app):
    """
    Register comprehensive security headers on the Flask app.
    Replaces the basic headers in app.py with production-grade config.
    """

    is_production = os.environ.get('FLASK_ENV') == 'production'
    frontend_url = os.environ.get('FRONTEND_URL', 'http://localhost:3000')

    # --- Session & Cookie Configuration ---
    app.config.update({
        'SESSION_COOKIE_SECURE': is_production,        # HTTPS only in production
        'SESSION_COOKIE_HTTPONLY': True,                # No JS access
        'SESSION_COOKIE_SAMESITE': 'Strict',           # Strict same-site
        'SESSION_COOKIE_NAME': '__Host-nadsoc_sid',    # __Host- prefix for extra security
        'PERMANENT_SESSION_LIFETIME': 1800,            # 30 min session timeout
        'SESSION_COOKIE_DOMAIN': False,                # Don't set domain (most restrictive)
    })

    # CSP nonce would be ideal but complex with static files.
    # Instead, use strict CSP with known CDN allowlisting.
    CSP_POLICY = {
        'production': (
            "default-src 'self'; "
            "script-src 'self' https://cdn.jsdelivr.net; "
            "style-src 'self' 'unsafe-inline' https://fonts.googleapis.com; "
            "font-src 'self' https://fonts.gstatic.com; "
            "img-src 'self' data: https:; "
            "connect-src 'self' https://*.supabase.co {frontend}; "
            "frame-ancestors 'none'; "
            "base-uri 'self'; "
            "form-action 'self'; "
            "object-src 'none'; "
            "upgrade-insecure-requests"
        ).format(frontend=frontend_url),

        'development': (
            "default-src 'self' 'unsafe-inline' 'unsafe-eval'; "
            "script-src 'self' 'unsafe-inline' 'unsafe-eval' https://cdn.jsdelivr.net; "
            "style-src 'self' 'unsafe-inline' https://fonts.googleapis.com; "
            "font-src 'self' https://fonts.gstatic.com; "
            "img-src 'self' data: https: http:; "
            "connect-src 'self' https://*.supabase.co http://localhost:* http://127.0.0.1:*; "
            "frame-ancestors 'none'; "
            "base-uri 'self'; "
            "object-src 'none'"
        )
    }

    # Permissions Policy — restrict browser features
    PERMISSIONS_POLICY = (
        "camera=(), "
        "microphone=(), "
        "geolocation=(), "
        "payment=(), "
        "usb=(), "
        "magnetometer=(), "
        "gyroscope=(), "
        "accelerometer=()"
    )

    @app.after_request
    def set_security_headers(response):
        """Apply comprehensive security headers to every response."""

        # --- Anti-clickjacking ---
        response.headers['X-Frame-Options'] = 'DENY'

        # --- MIME type sniffing prevention ---
        response.headers['X-Content-Type-Options'] = 'nosniff'

        # --- XSS Protection (legacy browsers) ---
        response.headers['X-XSS-Protection'] = '1; mode=block'

        # --- HSTS (HTTP Strict Transport Security) ---
        if is_production:
            response.headers['Strict-Transport-Security'] = (
                'max-age=63072000; includeSubDomains; preload'
            )

        # --- Content Security Policy ---
        env_key = 'production' if is_production else 'development'
        response.headers['Content-Security-Policy'] = CSP_POLICY[env_key]

        # --- Referrer Policy ---
        response.headers['Referrer-Policy'] = 'strict-origin-when-cross-origin'

        # --- Permissions Policy ---
        response.headers['Permissions-Policy'] = PERMISSIONS_POLICY

        # --- Cache Control for API responses ---
        if request.path.startswith('/api/'):
            response.headers['Cache-Control'] = 'no-store, no-cache, must-revalidate, max-age=0'
            response.headers['Pragma'] = 'no-cache'
            response.headers['Expires'] = '0'

        # --- Cross-Origin policies ---
        response.headers['Cross-Origin-Opener-Policy'] = 'same-origin'
        response.headers['Cross-Origin-Resource-Policy'] = 'same-origin'

        # --- Remove server identification ---
        response.headers.pop('Server', None)
        response.headers.pop('X-Powered-By', None)

        return response
