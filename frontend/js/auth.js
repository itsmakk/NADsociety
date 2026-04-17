/**
 * NADSOC — Auth Helper
 * Handles login, logout, session management, and role checks.
 * Uses Supabase Auth via the backend API.
 *
 * Phase 5: Session timeout integration, secure session storage,
 *          login attempt tracking on client side.
 */

const Auth = (() => {
    const SESSION_KEY = 'nadsoc_session';
    const USER_KEY = 'nadsoc_user';

    /**
     * Login with email and password
     */
    async function login(email, password) {
        const data = await API.post('/auth/login', { email, password });
        if (data.session) {
            localStorage.setItem(SESSION_KEY, JSON.stringify(data.session));
            localStorage.setItem(USER_KEY, JSON.stringify(data.user));

            // Initialize session timeout manager
            const timeout = data.session.session_timeout || 1800;
            SessionManager.init(timeout);
        }
        return data;
    }

    /**
     * Logout — clear session and destroy timeout manager
     */
    function logout() {
        SessionManager.destroy();
        localStorage.removeItem(SESSION_KEY);
        localStorage.removeItem(USER_KEY);
        window.location.href = '/index.html';
    }

    /**
     * Get current user info
     */
    function getUser() {
        const user = localStorage.getItem(USER_KEY);
        if (user) {
            try { return JSON.parse(user); }
            catch { return null; }
        }
        return null;
    }

    /**
     * Get current user role
     */
    function getRole() {
        const user = getUser();
        return user?.role || null;
    }

    /**
     * Check if user is logged in
     */
    function isLoggedIn() {
        return !!localStorage.getItem(SESSION_KEY) && !!getUser();
    }

    /**
     * Check if user has one of the required roles
     */
    function hasRole(...roles) {
        const userRole = getRole();
        return roles.includes(userRole);
    }

    /**
     * Require login — redirect to login if not authenticated
     */
    function requireAuth() {
        if (!isLoggedIn()) {
            window.location.href = '/index.html';
            return false;
        }

        // Initialize session timeout if not already running
        const session = localStorage.getItem(SESSION_KEY);
        if (session) {
            try {
                const parsed = JSON.parse(session);
                SessionManager.init(parsed.session_timeout || 1800);
            } catch { /* ignore */ }
        }

        return true;
    }

    /**
     * Require specific role(s) — redirect to 403 if unauthorized
     */
    function requireRole(...roles) {
        if (!requireAuth()) return false;
        if (!hasRole(...roles)) {
            window.location.href = '/403.html';
            return false;
        }
        return true;
    }

    /**
     * Password confirmation modal for financial transactions
     * Returns a promise that resolves with true/false
     */
    function confirmPassword(actionDescription) {
        return new Promise((resolve) => {
            const overlay = document.createElement('div');
            overlay.className = 'modal-overlay active';
            overlay.innerHTML = `
                <div class="modal">
                    <div class="modal-header">
                        <h3 style="font-size:var(--fs-lg);font-weight:700;">🔐 Authorization Required</h3>
                    </div>
                    <div class="modal-body">
                        <p class="text-sm text-muted mb-4">${_escapeHtml(actionDescription || 'Please enter your password to confirm this financial transaction.')}</p>
                        <div class="form-group">
                            <label class="form-label">Password <span class="required">*</span></label>
                            <input type="password" class="form-input" id="confirm-password-input" autocomplete="off" placeholder="Enter your login password" />
                            <span class="form-error" id="confirm-password-error"></span>
                        </div>
                    </div>
                    <div class="modal-footer">
                        <button class="btn btn-secondary" id="confirm-cancel">Cancel</button>
                        <button class="btn btn-primary" id="confirm-submit">Confirm</button>
                    </div>
                </div>
            `;
            document.body.appendChild(overlay);

            const input = overlay.querySelector('#confirm-password-input');
            const errorEl = overlay.querySelector('#confirm-password-error');
            const cancelBtn = overlay.querySelector('#confirm-cancel');
            const submitBtn = overlay.querySelector('#confirm-submit');

            input.focus();

            function cleanup() {
                overlay.classList.remove('active');
                setTimeout(() => overlay.remove(), 300);
            }

            cancelBtn.addEventListener('click', () => { cleanup(); resolve(false); });

            async function submit() {
                const password = input.value.trim();
                if (!password) {
                    errorEl.textContent = 'Password is required';
                    input.classList.add('error');
                    return;
                }

                submitBtn.disabled = true;
                submitBtn.textContent = 'Verifying...';

                try {
                    await API.post('/auth/verify-password', { password });
                    cleanup();
                    resolve(true);
                } catch (err) {
                    errorEl.textContent = err.message || 'Incorrect password. Please try again.';
                    input.classList.add('error');
                    input.value = '';
                    input.focus();
                    submitBtn.disabled = false;
                    submitBtn.textContent = 'Confirm';
                }
            }

            submitBtn.addEventListener('click', submit);
            input.addEventListener('keypress', (e) => { if (e.key === 'Enter') submit(); });
        });
    }

    /**
     * HTML escape utility to prevent XSS in dynamic content
     */
    function _escapeHtml(str) {
        const div = document.createElement('div');
        div.textContent = str;
        return div.innerHTML;
    }

    return {
        login,
        logout,
        getUser,
        getRole,
        isLoggedIn,
        hasRole,
        requireAuth,
        requireRole,
        confirmPassword
    };
})();
