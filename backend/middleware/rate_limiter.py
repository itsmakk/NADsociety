"""
NADSOC — Rate Limiting Middleware
In-memory sliding window rate limiter for auth endpoints (SRS Phase 5).
Protects against brute-force login attacks without external dependencies.
"""

import time
import threading
from flask import request, jsonify
from collections import defaultdict


class RateLimiter:
    """
    Thread-safe sliding window rate limiter.
    Tracks requests per IP + endpoint combo.
    """

    def __init__(self):
        self._requests = defaultdict(list)  # key -> [timestamps]
        self._lock = threading.Lock()
        self._blocked = {}  # key -> block_until_timestamp
        self._failed_logins = defaultdict(int)  # ip -> consecutive failures

    def _cleanup(self, key, window):
        """Remove timestamps outside the current window."""
        cutoff = time.time() - window
        self._requests[key] = [t for t in self._requests[key] if t > cutoff]

    def is_rate_limited(self, key, max_requests, window_seconds):
        """
        Check if a key has exceeded the rate limit.

        Args:
            key: Unique identifier (e.g., IP + endpoint)
            max_requests: Max allowed requests in the window
            window_seconds: Time window in seconds

        Returns:
            (is_limited: bool, retry_after: int)
        """
        now = time.time()

        with self._lock:
            # Check if currently blocked
            if key in self._blocked:
                if now < self._blocked[key]:
                    retry_after = int(self._blocked[key] - now)
                    return True, retry_after
                else:
                    del self._blocked[key]

            self._cleanup(key, window_seconds)
            count = len(self._requests[key])

            if count >= max_requests:
                retry_after = int(window_seconds - (now - self._requests[key][0]))
                return True, max(1, retry_after)

            self._requests[key].append(now)
            return False, 0

    def record_failed_login(self, ip):
        """Track consecutive failed login attempts for progressive lockout."""
        with self._lock:
            self._failed_logins[ip] += 1
            failures = self._failed_logins[ip]

            # Progressive lockout thresholds
            if failures >= 10:
                # 10+ failures: block for 30 minutes
                self._blocked[f"login:{ip}"] = time.time() + 1800
            elif failures >= 5:
                # 5-9 failures: block for 5 minutes
                self._blocked[f"login:{ip}"] = time.time() + 300
            elif failures >= 3:
                # 3-4 failures: block for 30 seconds
                self._blocked[f"login:{ip}"] = time.time() + 30

    def record_successful_login(self, ip):
        """Reset failed login counter on successful login."""
        with self._lock:
            self._failed_logins.pop(ip, None)
            self._blocked.pop(f"login:{ip}", None)

    def get_failed_count(self, ip):
        """Get number of consecutive failed logins for an IP."""
        with self._lock:
            return self._failed_logins.get(ip, 0)

    def cleanup_expired(self):
        """Periodic cleanup of expired entries (call from background task)."""
        now = time.time()
        with self._lock:
            # Clean blocked entries
            expired_blocks = [k for k, v in self._blocked.items() if v < now]
            for k in expired_blocks:
                del self._blocked[k]

            # Clean old request logs (older than 1 hour)
            expired_keys = []
            for key, timestamps in self._requests.items():
                self._requests[key] = [t for t in timestamps if now - t < 3600]
                if not self._requests[key]:
                    expired_keys.append(key)
            for k in expired_keys:
                del self._requests[k]


# Global rate limiter instance
limiter = RateLimiter()

# --- Rate limit configurations ---
RATE_LIMITS = {
    # Auth endpoints — strict limits
    '/api/auth/login': {'max_requests': 15, 'window': 60},           # 15 per minute
    '/api/auth/refresh': {'max_requests': 10, 'window': 60},         # 10 per minute
    '/api/auth/change-password': {'max_requests': 3, 'window': 300},  # 3 per 5 min
    '/api/auth/verify-password': {'max_requests': 10, 'window': 60},  # 10 per minute

    # Upload endpoints — moderate limits
    '/api/upload/members': {'max_requests': 5, 'window': 300},        # 5 per 5 min

    # General API — relaxed limits
    '__default__': {'max_requests': 100, 'window': 60},                # 100 per minute
}


def get_client_ip():
    """Get the real client IP, respecting X-Forwarded-For behind proxies."""
    forwarded = request.headers.get('X-Forwarded-For', '')
    if forwarded:
        # Take the first (client) IP from the chain
        return forwarded.split(',')[0].strip()
    return request.remote_addr or '0.0.0.0'


def init_rate_limiter(app):
    """Register rate limiting middleware on the Flask app."""

    @app.before_request
    def check_rate_limit():
        """Check rate limits before processing the request."""
        path = request.path
        ip = get_client_ip()

        # Find matching rate limit config
        config = RATE_LIMITS.get(path, RATE_LIMITS['__default__'])

        if request.path == "/api/auth/login":
    data = request.get_json(silent=True) or {}
    email = data.get("email", "unknown")
    key = f"{email}:{path}"
else:
    key = f"{ip}:{path}"
        

        is_limited, retry_after = limiter.is_rate_limited(
            key, config['max_requests'], config['window']
        )

        if is_limited:
            response = jsonify({
                'error': 'Too many requests. Please try again later.',
                'retry_after': retry_after
            })
            response.status_code = 429
            response.headers['Retry-After'] = str(retry_after)
            response.headers['X-RateLimit-Limit'] = str(config['max_requests'])
            response.headers['X-RateLimit-Remaining'] = '0'
            return response

    @app.after_request
    def add_rate_limit_headers(response):
        """Add rate limit info to response headers."""
        path = request.path
        config = RATE_LIMITS.get(path, RATE_LIMITS['__default__'])
        response.headers['X-RateLimit-Limit'] = str(config['max_requests'])
        return response

    # Periodic cleanup every 10 minutes (via background thread)
    def _cleanup_loop():
        import time as _time
        while True:
            _time.sleep(600)
            limiter.cleanup_expired()

    cleanup_thread = threading.Thread(target=_cleanup_loop, daemon=True)
    cleanup_thread.start()
