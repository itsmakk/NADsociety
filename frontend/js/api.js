/**
 * NADSOC — API Client
 * Centralized HTTP client for backend communication.
 * All requests include JWT token from Supabase Auth.
 */

const API = (() => {
    // Backend API base URL — set during deployment
    const BASE_URL = window.NADSOC_CONFIG?.API_URL || 'https://nadsociety-production.up.railway.app/api';

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
     * Core fetch wrapper with auth, error handling, and retries
     */
    async function request(endpoint, options = {}) {
        const url = `${BASE_URL}${endpoint}`;
        const token = getToken();

        const config = {
            ...options,
            headers: {
                'Content-Type': 'application/json',
                ...(token ? { 'Authorization': `Bearer ${token}` } : {}),
                ...(options.headers || {})
            }
        };

        // Add body for POST/PUT/PATCH
        if (options.body && typeof options.body === 'object') {
            config.body = JSON.stringify(options.body);
        }

        try {
            const response = await fetch(url, config);

            // Handle 401 — token expired
            if (response.status === 401) {
                localStorage.removeItem('nadsoc_session');
                window.location.href = '/index.html';
                throw new Error('Session expired. Please login again.');
            }

            // Handle 403
            if (response.status === 403) {
                throw new Error('You do not have permission to perform this action.');
            }

            const data = await response.json();

            if (!response.ok) {
                throw new Error(data.error || data.message || `Request failed (${response.status})`);
            }

            return data;
        } catch (error) {
            if (error.name === 'TypeError' && error.message.includes('fetch')) {
                throw new Error('Network error. Please check your internet connection.');
            }
            throw error;
        }
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
        upload: (endpoint, formData) => {
            const token = getToken();
            return fetch(`${BASE_URL}${endpoint}`, {
                method: 'POST',
                headers: token ? { 'Authorization': `Bearer ${token}` } : {},
                body: formData
            }).then(async res => {
                const data = await res.json();
                if (!res.ok) throw new Error(data.error || 'Upload failed');
                return data;
            });
        },

        /**
         * Download file (blob response)
         */
        download: async (endpoint, filename) => {
            const token = getToken();
            const res = await fetch(`${BASE_URL}${endpoint}`, {
                headers: token ? { 'Authorization': `Bearer ${token}` } : {}
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
        },

        BASE_URL,
        getToken
    };
})();
