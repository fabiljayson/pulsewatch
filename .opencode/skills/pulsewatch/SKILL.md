---
name: pulsewatch
description: PulseWatch API-health monitoring work (FastAPI uv backend on 8001 + React/Vite frontend). Use for ANY task under /home/fabiljayson/Projects/pulsewatch — covers ports, SSRF outbound policy, scheduler env vars and test commands.
---

# PulseWatch

API Health & Reliability Observatory: scheduled + on-demand HTTP checks, monotonic latency, SQLite event log, availability/latency reports. Outbound requests are governed by an **SSRF-aware URL policy**: public destinations only, no credentials embedded in URLs, redirects disabled by default — do not loosen the policy when adding features.

## Ports & run

- API runs on **8001** (`uv run uvicorn app.main:app --reload`), because 8000 is taken by `django-project`. The frontend proxy is pinned by `VITE_API_PROXY_TARGET=http://127.0.0.1:8001` — keep both matched.
- Frontend: `cd frontend && npm run dev` (Vite, 5173).
- Admin demo login is `admin123`.

## Scheduler

Global automatic checks are controlled by `PULSEWATCH_CHECK_INTERVAL_SECONDS` (default 300, `0` = disabled), surfaced in Settings as "Automatic checks" and by `GET /api/v1/scheduler`.

## Tests

- Backend: `uv run pytest` (197 green).
- Frontend: vitest (44 green) + eslint.
- Keep the SSRF test coverage in mind whenever touching the outbound request path.
