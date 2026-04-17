/**
 * NADSOC — API Client
 * Centralized HTTP client for backend communication.
 * All requests include JWT token from Supabase Auth.
 *
 * Phase 5: CSRF token support, session timeout enforcement,
 *          auto-refresh, request fingerprinting.
 */

const API = (() => {
    // Backend API base URL — set during deployment
    const BASE_URL = window.NADSOC_CONFIG?.API_URL || 'https://nadsociety-production.up.railway.app/api';

    // CSRF token cache
    let _csrfToken = null;
    let _csrfExpiry = 0;

    /**
     * Get the current auth token from localStorage
     */
    function getToken() {
        const session = localStorage.getItem('nadsoc_session');
        if (session) {
            try {
                return JSON.parse(session).access_token;
            } catch { return null; }
        }
        return null;
    }

    /**
     * Fetch a fresh CSRF token from the server
     */
    async function getCsrfToken() {
        const now = Date.now();
        // Cache CSRF tokens for 50 minutes (they last 60 min)
        if (_csrfToken && _csrfExpiry > now) {
            return _csrfToken;
        }

        try {
            const res = await fetch(`${BASE_URL}/auth/csrf-token`, {
                method: 'GET',
                credentials: 'include'
            });
            if (res.ok) {
                const data = await res.json();
                _csrfToken = data.csrf_token;
                _csrfExpiry = now + (50 * 60 * 1000); // 50 minutes
                return _csrfToken;
            }
        } catch (e) {
            console.warn('Failed to fetch CSRF token:', e);
        }
        return null;
    }

    /**
     * Check if a method requires CSRF protection
     */
    function needsCsrf(method) {
        return ['POST', 'PUT', 'PATCH', 'DELETE'].includes(method.toUpperCase());
    }

    /**
     * Core fetch wrapper with auth, CSRF, error handling, and retries
     */
    async function request(endpoint, options = {}) {
        const url = `${BASE_URL}${endpoint}`;
        const token = getToken();
        const method = (options.method || 'GET').toUpperCase();

        const headers = {
            'Content-Type': 'application/json',
            ...(token ? { 'Authorization': `Bearer ${token}` } : {}),
            ...(options.headers || {})
        };

        // Add CSRF token for state-changing requests
        if (needsCsrf(method) && token) {
            const csrf = await getCsrfToken();
            if (csrf) {
                headers['X-CSRF-Token'] = csrf;
            }
        }

        const config = {
            ...options,
            method,
            headers,
            credentials: 'include'  // Send cookies for CSRF double-submit
        };

        // Add body for POST/PUT/PATCH
        if (options.body && typeof options.body === 'object') {
            config.body = JSON.stringify(options.body);
        }

        try {
            const response = await fetch(url, config);

            // Handle 401 — token expired
            if (response.status === 401) {
                // Try token refresh before giving up
                const refreshed = await _tryRefreshToken();
                if (refreshed) {
                    // Retry the original request with new token
                    headers['Authorization'] = `Bearer ${getToken()}`;
                    const retryResponse = await fetch(url, { ...config, headers });
                    if (retryResponse.ok) {
                        return await retryResponse.json();
                    }
                }

                localStorage.removeItem('nadsoc_session');
                localStorage.removeItem('nadsoc_user');
                window.location.href = '/index.html';
                throw new Error('Session expired. Please login again.');
            }

            // Handle 403 — CSRF failure or permission denied
            if (response.status === 403) {
                const data = await response.json();
                if (data.error && data.error.includes('CSRF')) {
                    // Refresh CSRF token and retry once
                    _csrfToken = null;
                    _csrfExpiry = 0;
                    const newCsrf = await getCsrfToken();
                    if (newCsrf) {
                        headers['X-CSRF-Token'] = newCsrf;
                        const retryResponse = await fetch(url, { ...config, headers });
                        if (retryResponse.ok) {
                            return await retryResponse.json();
                        }
                    }
                }
                throw new Error(data.error || 'You do not have permission to perform this action.');
            }

            // Handle 429 — Rate limited
            if (response.status === 429) {
                const data = await response.json();
                const retryAfter = data.retry_after || 60;
                throw new Error(`Too many requests. Please wait ${retryAfter} seconds and try again.`);
            }

            const data = await response.json();

            if (!response.ok) {
                throw new Error(data.error || data.message || `Request failed (${response.status})`);
            }

            // Reset session activity timer on successful requests
            SessionManager.recordActivity();

            return data;
        } catch (error) {
            if (error.name === 'TypeError' && error.message.includes('fetch')) {
                throw new Error('Network error. Please check your internet connection.');
            }
            throw error;
        }
    }

    /**
     * Try to refresh the access token using the refresh token
     */
    async function _tryRefreshToken() {
        const session = localStorage.getItem('nadsoc_session');
        if (!session) return false;

        try {
            const { refresh_token } = JSON.parse(session);
            if (!refresh_token) return false;

            const res = await fetch(`${BASE_URL}/auth/refresh`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ refresh_token })
            });

            if (res.ok) {
                const data = await res.json();
                if (data.session) {
                    localStorage.setItem('nadsoc_session', JSON.stringify(data.session));
                    return true;
                }
            }
        } catch (e) {
            console.warn('Token refresh failed:', e);
        }
        return false;
    }

    // HTTP method helpers
    return {
        get:    (endpoint)        => request(endpoint, { method: 'GET' }),
        post:   (endpoint, body)  => request(endpoint, { method: 'POST', body }),
        put:    (endpoint, body)  => request(endpoint, { method: 'PUT', body }),
        patch:  (endpoint, body)  => request(endpoint, { method: 'PATCH', body }),
        delete: (endpoint)        => request(endpoint, { method: 'DELETE' }),

        /**
         * Upload file (FormData — no JSON content-type)
         */
        upload: async (endpoint, formData) => {
            const token = getToken();
            const headers = token ? { 'Authorization': `Bearer ${token}` } : {};

            // Add CSRF token for uploads too
            const csrf = await getCsrfToken();
            if (csrf) headers['X-CSRF-Token'] = csrf;

            return fetch(`${BASE_URL}${endpoint}`, {
                method: 'POST',
                headers,
                body: formData,
                credentials: 'include'
            }).then(async res => {
                const data = await res.json();
                if (!res.ok) throw new Error(data.error || 'Upload failed');
                SessionManager.recordActivity();
                return data;
            });
        },

        /**
         * Download file (blob response)
         */
        download: async (endpoint, filename) => {
            const token = getToken();
            const res = await fetch(`${BASE_URL}${endpoint}`, {
                headers: token ? { 'Authorization': `Bearer ${token}` } : {},
                credentials: 'include'
            });
            if (!res.ok) throw new Error('Download failed');
            const blob = await res.blob();
            const url = URL.createObjectURL(blob);
            const a = document.createElement('a');
            a.href = url;
            a.download = filename || 'download';
            document.body.appendChild(a);
            a.click();
            a.remove();
            URL.revokeObjectURL(url);
            SessionManager.recordActivity();
        },

        BASE_URL,
        getToken,
        getCsrfToken
    };
})();


/**
 * Session Manager — handles idle timeout and automatic logout.
 * Phase 5: Enforces session timeout on the frontend.
 */
const SessionManager = (() => {
    const ACTIVITY_KEY = 'nadsoc_last_activity';
    const WARNING_BEFORE = 120;  // Show warning 2 minutes before timeout
    let _timeout = 1800;         // Default 30 min, updated from server
    let _warningTimer = null;
    let _logoutTimer = null;
    let _warningShown = false;

    /**
     * Initialize session timeout monitoring
     */
    function init(timeoutSeconds) {
        if (timeoutSeconds) _timeout = timeoutSeconds;
        recordActivity();
        _startTimers();

        // Track user activity
        ['mousedown', 'keypress', 'scroll', 'touchstart'].forEach(event => {
            document.addEventListener(event, () => {
                if (_warningShown) return; // Don't reset if warning is showing
                recordActivity();
                _startTimers();
            }, { passive: true });
        });

        // Check activity on visibility change (tab switch)
        document.addEventListener('visibilitychange', () => {
            if (!document.hidden) {
                _checkTimeout();
            }
        });
    }

    /**
     * Record user activity timestamp
     */
    function recordActivity() {
        localStorage.setItem(ACTIVITY_KEY, Date.now().toString());
    }

    /**
     * Get seconds since last activity
     */
    function getIdleSeconds() {
        const lastActivity = parseInt(localStorage.getItem(ACTIVITY_KEY) || '0');
        return Math.floor((Date.now() - lastActivity) / 1000);
    }

    /**
     * Start/restart timeout timers
     */
    function _startTimers() {
        clearTimeout(_warningTimer);
        clearTimeout(_logoutTimer);
        _warningShown = false;

        // Warning timer
        const warningDelay = Math.max(0, (_timeout - WARNING_BEFORE)) * 1000;
        _warningTimer = setTimeout(_showWarning, warningDelay);

        // Logout timer
        _logoutTimer = setTimeout(_forceLogout, _timeout * 1000);
    }

    /**
     * Check if session has timed out (called on tab focus)
     */
    function _checkTimeout() {
        const idle = getIdleSeconds();
        if (idle >= _timeout) {
            _forceLogout();
        } else if (idle >= _timeout - WARNING_BEFORE) {
            _showWarning();
        }
    }

    /**
     * Show session timeout warning
     */
    function _showWarning() {
        if (_warningShown) return;
        _warningShown = true;

        const remaining = _timeout - getIdleSeconds();
        if (remaining <= 0) {
            _forceLogout();
            return;
        }

        // Create warning banner
        let banner = document.getElementById('session-timeout-warning');
        if (!banner) {
            banner = document.createElement('div');
            banner.id = 'session-timeout-warning';
            banner.style.cssText = `
                position: fixed; top: 0; left: 0; right: 0; z-index: 10000;
                background: linear-gradient(135deg, #ff6b35, #f72585);
                color: white; padding: 12px 24px; text-align: center;
                font-family: Inter, sans-serif; font-size: 14px; font-weight: 600;
                box-shadow: 0 4px 20px rgba(0,0,0,0.3);
                display: flex; align-items: center; justify-content: center; gap: 16px;
                animation: slideDown 0.3s ease-out;
            `;
            document.body.appendChild(banner);
        }

        const mins = Math.floor(remaining / 60);
        const secs = remaining % 60;
        banner.innerHTML = `
            <span>⚠️ Your session will expire in <strong id="timeout-countdown">${mins}:${secs.toString().padStart(2, '0')}</strong></span>
            <button onclick="SessionManager.extend()" style="
                background: white; color: #f72585; border: none; padding: 6px 16px;
                border-radius: 6px; cursor: pointer; font-weight: 700; font-size: 13px;
            ">Stay Logged In</button>
        `;

        // Countdown update
        const countdownEl = document.getElementById('timeout-countdown');
        const countdownInterval = setInterval(() => {
            const r = _timeout - getIdleSeconds();
            if (r <= 0) {
                clearInterval(countdownInterval);
                _forceLogout();
                return;
            }
            const m = Math.floor(r / 60);
            const s = r % 60;
            if (countdownEl) countdownEl.textContent = `${m}:${s.toString().padStart(2, '0')}`;
        }, 1000);

        banner._countdownInterval = countdownInterval;
    }

    /**
     * Extend the session (user clicked "Stay Logged In")
     */
    function extend() {
        _warningShown = false;
        const banner = document.getElementById('session-timeout-warning');
        if (banner) {
            clearInterval(banner._countdownInterval);
            banner.remove();
        }
        recordActivity();
        _startTimers();

        // Verify session is still valid on server
        API.get('/auth/session-status').catch(() => {
            _forceLogout();
        });
    }

    /**
     * Force logout due to session timeout
     */
    function _forceLogout() {
        clearTimeout(_warningTimer);
        clearTimeout(_logoutTimer);
        const banner = document.getElementById('session-timeout-warning');
        if (banner) {
            clearInterval(banner._countdownInterval);
            banner.remove();
        }

        localStorage.removeItem('nadsoc_session');
        localStorage.removeItem('nadsoc_user');
        localStorage.removeItem(ACTIVITY_KEY);

        // Show logout message
        alert('Your session has expired due to inactivity. Please log in again.');
        window.location.href = '/index.html';
    }

    /**
     * Destroy session manager (call on manual logout)
     */
    function destroy() {
        clearTimeout(_warningTimer);
        clearTimeout(_logoutTimer);
        _warningShown = false;
        localStorage.removeItem(ACTIVITY_KEY);
    }

    return {
        init,
        recordActivity,
        getIdleSeconds,
        extend,
        destroy
    };
})();
