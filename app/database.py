"""SQLite database access bootstrap.

Provides a small :class:`Database` wrapper that opens short-lived connections
with foreign-key enforcement and WAL journaling, plus schema initialization.
All SQL lives in :mod:`app.repository`, not in route handlers.
"""

from __future__ import annotations

import sqlite3
from collections.abc import Iterator
from contextlib import contextmanager
from pathlib import Path

SCHEMA_SQL = """
CREATE TABLE IF NOT EXISTS monitored_endpoints (
    id         INTEGER PRIMARY KEY AUTOINCREMENT,
    name       TEXT NOT NULL,
    url        TEXT NOT NULL,
    is_active  INTEGER NOT NULL DEFAULT 1,
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS check_results (
    id          INTEGER PRIMARY KEY AUTOINCREMENT,
    endpoint_id INTEGER NOT NULL,
    checked_at  TEXT NOT NULL,
    status_code INTEGER,
    latency_ms  REAL,
    success     INTEGER NOT NULL,
    error_type  TEXT,
    FOREIGN KEY (endpoint_id) REFERENCES monitored_endpoints (id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_check_results_endpoint_checked_at
    ON check_results (endpoint_id, checked_at);
"""


class Database:
    """Manages SQLite connections for a database file."""

    def __init__(self, path: Path | str) -> None:
        self._path = Path(path)

    @property
    def path(self) -> Path:
        """Filesystem path of the database."""
        return self._path

    @contextmanager
    def connection(self) -> Iterator[sqlite3.Connection]:
        """Yield a connection with foreign keys enabled; commit/rollback around use."""
        conn = sqlite3.connect(self._path, timeout=10.0)
        conn.row_factory = sqlite3.Row
        conn.execute("PRAGMA foreign_keys = ON")
        try:
            yield conn
            conn.commit()
        except Exception:
            conn.rollback()
            raise
        finally:
            conn.close()

    def initialize(self) -> None:
        """Create tables and indexes if they do not already exist."""
        self._path.parent.mkdir(parents=True, exist_ok=True)
        with self.connection() as conn:
            conn.execute("PRAGMA journal_mode = WAL")
            conn.executescript(SCHEMA_SQL)
