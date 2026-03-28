"""
NADSOC Management System — Flask Application Entry Point
The NAD Employees Co-operative Credit Society Ltd., Karanja
"""

import os
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

    # --- CORS ---
    frontend_url = os.environ.get('FRONTEND_URL', 'http://localhost:3000')
    CORS(app, resources={
        r"/api/*": {
            "origins": [frontend_url, "http://localhost:3000", "http://127.0.0.1:3000"],
            "methods": ["GET", "POST", "PUT", "PATCH", "DELETE", "OPTIONS"],
            "allow_headers": ["Content-Type", "Authorization"],
            "supports_credentials": True
        }
    })

    # --- Security Headers ---
    @app.after_request
    def add_security_headers(response):
        response.headers['X-Content-Type-Options'] = 'nosniff'
        response.headers['X-Frame-Options'] = 'DENY'
        response.headers['X-XSS-Protection'] = '1; mode=block'
        response.headers['Strict-Transport-Security'] = 'max-age=31536000; includeSubDomains'
        response.headers['Content-Security-Policy'] = (
            "default-src 'self'; "
            "script-src 'self'; "
            "style-src 'self' 'unsafe-inline' https://fonts.googleapis.com; "
            "font-src 'self' https://fonts.gstatic.com; "
            "img-src 'self' data:; "
            "connect-src 'self' https://*.supabase.co"
        )
        return response

    # --- Health Check Endpoint ---
    @app.route('/api/health', methods=['GET'])
    def health_check():
        return jsonify({
            'status': 'healthy',
            'service': 'NADSOC Backend API',
            'version': '1.0.0'
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

    @app.errorhandler(500)
    def internal_error(e):
        return jsonify({'error': 'Internal server error'}), 500

    return app

# Create the app instance
app = create_app()

if __name__ == '__main__':
    port = int(os.environ.get('PORT', 5000))
    app.run(host='0.0.0.0', port=port, debug=os.environ.get('FLASK_ENV') != 'production')
