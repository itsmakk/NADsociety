"""
NADSOC Management System — Flask Application Entry Point
The NAD Employees Co-operative Credit Society Ltd., Karanja

Phase 5: Security-hardened with CSRF, rate limiting, input sanitization,
          CSP, CORS lockdown, session timeout, secure cookies, audit tamper protection.
"""

import os
import logging
from flask import Flask, jsonify
from flask_cors import CORS
from dotenv import load_dotenv

# Load environment variables
load_dotenv()


def create_app():
    """Application factory pattern."""
    app = Flask(__name__)

    # --- Configuration ---
    app.config['SECRET_KEY'] = os.environ.get('SECRET_KEY', 'dev-secret-change-me')
    app.config['SUPABASE_URL'] = os.environ.get('SUPABASE_URL')
    app.config['SUPABASE_ANON_KEY'] = os.environ.get('SUPABASE_ANON_KEY')
    app.config['SUPABASE_SERVICE_ROLE_KEY'] = os.environ.get('SUPABASE_SERVICE_ROLE_KEY')
    app.config['SUPABASE_JWT_SECRET'] = os.environ.get('SUPABASE_JWT_SECRET')
    app.config['DATABASE_URL'] = os.environ.get('DATABASE_URL')

    # --- Environment Variable Validation ---
    required_env_vars = ['SUPABASE_URL', 'SUPABASE_ANON_KEY', 'SUPABASE_JWT_SECRET', 'DATABASE_URL', 'FRONTEND_URL']
    for var in required_env_vars:
        if not os.environ.get(var):
            app.logger.error(f"Required environment variable {var} is not set")
            raise RuntimeError(f"Required environment variable {var} is not set")

    # --- Logging ---
    is_production = os.environ.get('FLASK_ENV') == 'production'
    log_level = logging.WARNING if is_production else logging.INFO
    logging.basicConfig(
        level=log_level,
        format='%(asctime)s [%(levelname)s] %(name)s: %(message)s',
        datefmt='%Y-%m-%d %H:%M:%S'
    )
    app.logger.setLevel(log_level)

    # --- CORS --- (Development: permissive, Production: locked down in security.py)
    frontend_url = os.environ.get('FRONTEND_URL', 'http://localhost:3000')
    if not is_production:
        CORS(app, resources={
            r"/api/*": {
                "origins": [frontend_url, "http://localhost:3000", "http://127.0.0.1:3000"],
                "methods": ["GET", "POST", "PUT", "PATCH", "DELETE", "OPTIONS"],
                "allow_headers": ["Content-Type", "Authorization", "X-CSRF-Token", "X-Requested-With"],
                "supports_credentials": True
            }
        })
    else:
        # Production: strict single-origin CORS
        CORS(app, resources={
            r"/api/*": {
                "origins": [frontend_url],
                "methods": ["GET", "POST", "PUT", "PATCH", "DELETE", "OPTIONS"],
                "allow_headers": ["Content-Type", "Authorization", "X-CSRF-Token", "X-Requested-With"],
                "supports_credentials": True,
                "max_age": 3600
            }
        })

    # ============================================================
    # PHASE 5: Security Middleware Registration (order matters!)
    # ============================================================

    # 1. Security Headers (CSP, HSTS, X-Frame-Options, cookies, cache control)
    from middleware.security import init_security_headers, init_cors_lockdown
    init_security_headers(app)
    init_cors_lockdown(app)

    # 2. Rate Limiting (brute-force protection on auth endpoints)
    from middleware.rate_limiter import init_rate_limiter
    init_rate_limiter(app)

    # 3. CSRF Protection (double-submit token pattern)
    from middleware.csrf import init_csrf
    init_csrf(app)

    # 4. Input Sanitization (XSS & injection prevention)
    from middleware.sanitizer import init_sanitizer
    init_sanitizer(app)

    # ============================================================

    # --- Root Endpoint ---
    @app.route('/', methods=['GET'])
    def index():
        return jsonify({
            'service': 'NADSOC Management System API',
            'status': 'active',
            'message': 'Welcome to the NADSOC Backend. Use /api/health for system status.',
            'version': '2.0.0'
        }), 200

    # --- Health Check Endpoint ---
    @app.route('/api/health', methods=['GET'])
    def health_check():
        return jsonify({
            'status': 'healthy',
            'service': 'NADSOC Backend API',
            'version': '2.0.0',
            'security': 'phase5-hardened'
        }), 200

    # --- Register Blueprints ---
    # Phase 2: Core routes (ACTIVE)
    from routes.auth import auth_bp
    from routes.members import members_bp
    from routes.admin import admin_bp
    from routes.audit import audit_bp
    from routes.upload import upload_bp

    app.register_blueprint(auth_bp, url_prefix='/api/auth')
    app.register_blueprint(members_bp, url_prefix='/api/members')
    app.register_blueprint(admin_bp, url_prefix='/api/admin')
    app.register_blueprint(audit_bp, url_prefix='/api/audit')
    app.register_blueprint(upload_bp, url_prefix='/api/upload')

    # Phase 3: Business Logic routes (ACTIVE)
    from routes.loans import loans_bp
    from routes.deposits import deposits_bp, fd_bp
    from routes.surety import surety_bp
    from routes.settlement import settlement_bp
    from routes.expense import expense_bp, forms_bp
    from routes.reports import reports_bp
    from routes.demand import demand_bp

    app.register_blueprint(loans_bp, url_prefix='/api/loans')
    app.register_blueprint(deposits_bp, url_prefix='/api/deposits')
    app.register_blueprint(fd_bp, url_prefix='/api/fd')
    app.register_blueprint(surety_bp, url_prefix='/api/surety')
    app.register_blueprint(settlement_bp, url_prefix='/api/settlement')
    app.register_blueprint(expense_bp, url_prefix='/api/expenses')
    app.register_blueprint(forms_bp, url_prefix='/api/forms')
    app.register_blueprint(reports_bp, url_prefix='/api/reports')
    app.register_blueprint(demand_bp, url_prefix='/api/demand')

    # --- Error Handlers ---
    @app.errorhandler(404)
    def not_found(e):
        return jsonify({'error': 'Endpoint not found'}), 404

    @app.errorhandler(403)
    def forbidden(e):
        return jsonify({'error': 'Access forbidden'}), 403

    @app.errorhandler(429)
    def rate_limited(e):
        return jsonify({'error': 'Too many requests. Please slow down.'}), 429

    @app.errorhandler(500)
    def internal_error(e):
        # Never leak stack traces in production
        if is_production:
            app.logger.error(f'Internal error: {e}')
            return jsonify({'error': 'Internal server error'}), 500
        return jsonify({'error': f'Internal server error: {str(e)}'}), 500

    return app

# Create the app instance
app = create_app()

if __name__ == '__main__':
    port = int(os.environ.get('PORT', 5000))
    app.run(host='0.0.0.0', port=port, debug=os.environ.get('FLASK_ENV') != 'production')
