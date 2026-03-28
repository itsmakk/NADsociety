"""
NADSOC — Database Connection Manager
Uses psycopg2 with connection pooling for PostgreSQL/Supabase.
All queries use parameterized statements (NO string formatting).
"""

import os
import psycopg2
from psycopg2 import pool, extras
from contextlib import contextmanager

# Connection pool (initialized on first use)
_connection_pool = None


def get_pool():
    """Get or create the connection pool."""
    global _connection_pool
    if _connection_pool is None or _connection_pool.closed:
        database_url = os.environ.get('DATABASE_URL')
        if not database_url:
            raise RuntimeError('DATABASE_URL environment variable is not set')
        _connection_pool = pool.ThreadedConnectionPool(
            minconn=2,
            maxconn=10,
            dsn=database_url
        )
    return _connection_pool


@contextmanager
def get_connection():
    """Get a database connection from the pool (context manager)."""
    conn = get_pool().getconn()
    try:
        yield conn
    finally:
        get_pool().putconn(conn)


@contextmanager
def get_cursor(commit=True):
    """
    Get a database cursor with automatic commit/rollback.
    Uses RealDictCursor for dict-style row access.

    Usage:
        with get_cursor() as cur:
            cur.execute("SELECT * FROM members WHERE gen_no = %s", (gen_no,))
            row = cur.fetchone()
    """
    with get_connection() as conn:
        cur = conn.cursor(cursor_factory=extras.RealDictCursor)
        try:
            yield cur
            if commit:
                conn.commit()
        except Exception:
            conn.rollback()
            raise
        finally:
            cur.close()


@contextmanager
def get_transaction():
    """
    Get a transactional cursor. Everything inside is atomic.
    MUST be used for multi-step financial operations.

    Usage:
        with get_transaction() as cur:
            cur.execute("INSERT INTO loan_master ...", (...))
            cur.execute("INSERT INTO loan_ledger ...", (...))
            # Both succeed or both fail
    """
    with get_connection() as conn:
        cur = conn.cursor(cursor_factory=extras.RealDictCursor)
        try:
            yield cur
            conn.commit()
        except Exception:
            conn.rollback()
            raise
        finally:
            cur.close()


def execute_query(query, params=None, fetch_one=False, fetch_all=False):
    """
    Execute a parameterized query.

    Args:
        query: SQL query with %s placeholders
        params: Tuple of parameters
        fetch_one: Return single row
        fetch_all: Return all rows

    Returns:
        Query results or None
    """
    with get_cursor() as cur:
        cur.execute(query, params)
        if fetch_one:
            return cur.fetchone()
        if fetch_all:
            return cur.fetchall()
        return None


def set_app_user(cursor, username):
    """
    Set the current user for audit trigger context.
    Call this at the start of every authenticated request.
    """
    cursor.execute(
        "SET LOCAL app.current_user = %s",
        (username,)
    )


def close_pool():
    """Close all connections in the pool."""
    global _connection_pool
    if _connection_pool and not _connection_pool.closed:
        _connection_pool.closeall()
        _connection_pool = None
