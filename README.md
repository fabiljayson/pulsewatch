# PulseWatch

> Every request tells a story. Every failure leaves a trace.

**PulseWatch — API Health & Reliability Observatory** is a lightweight API
monitoring service. It checks HTTP/HTTPS endpoints automatically and on demand, measures response
latency with a monotonic clock, records success and failure events in SQLite,
and computes reliability reports — availability percentage, average latency,
and check counts over an explicit time window.

Outbound requests are governed by an SSRF-aware URL policy: only public
destinations are allowed, credentials embedded in URLs are rejected, and
redirects are disabled by default.

## Features

- **Endpoint management** — register, list, retrieve, update, and delete
  monitored endpoints (`/api/v1/endpoints`).
- **On-demand health checks** — `POST /api/v1/endpoints/{id}/check` issues one
  outbound request, measures latency, and persists the result. HTTP 200–399
  count as success; 400+ as failure. Timeouts, connection errors, DNS failures,
  and invalid responses are captured as safe error categories — never as crashes.
- **Monitoring history** — `GET .../history` returns recent checks newest-first
  with bounded pagination.
- **Reliability reports** — `GET .../report?hours=24` returns total/success/failure
  counts, availability percentage, average latency, and the explicit report window.
- **SSRF-aware outbound policy** — see [Security](#security).
- **Interactive API docs** — OpenAPI schema and a Swagger UI at `/docs`.
- **Zero infrastructure** — a single Python process and one SQLite file.

## Technology stack

| Layer      | Choice                                          |
|------------|-------------------------------------------------|
| Language   | Python ≥ 3.12                                   |
| API        | FastAPI + Uvicorn                               |
| HTTP client| HTTPX (async, `trust_env=False`)                |
| Database   | SQLite via the standard `sqlite3` module        |
| Validation | Pydantic v2                                     |
| Tests      | Pytest + pytest-cov + `httpx.MockTransport`     |
| Lint/format| Ruff                                            |
| Packaging  | `uv` + hatchling                                |
| CI         | GitHub Actions                                  |

## Architecture overview

```
client ──HTTP──▶ FastAPI routes (app/api)
                    │  Pydantic schemas (app/schemas)
                    ▼
              services layer
              ├── checker      — outbound check engine (HTTPX)
              ├── reports      — availability / latency aggregation
              └── url_validation — SSRF policy (syntax + DNS/IP checks)
                    │
                    ▼
              repository (app/repository)   ← parameterized SQL only
                    │
                    ▼
              SQLite (app/database)         ← FK-enforced, WAL
```

Design notes:

- **Layered, no SQL in routes.** Routes call the repository; the repository owns
  every SQL statement; the database module owns connections and schema.
- **Dependency injection.** The application factory accepts settings, an HTTP
  transport, and a DNS resolver, so tests run entirely offline.
- **Connection-per-operation SQLite access** with `PRAGMA foreign_keys = ON`
  and `ON DELETE CASCADE` from check results to endpoints.

## Project structure

```
pulsewatch/
├── app/
│   ├── __init__.py            # package version
│   ├── main.py                # create_app() factory, lifespan, /health, OpenAPI
│   ├── config.py              # Settings from PULSEWATCH_* environment variables
│   ├── database.py            # Database wrapper, schema initialization
│   ├── models.py              # domain dataclasses
│   ├── schemas.py             # Pydantic request/response models
│   ├── repository.py          # all SQL (parameterized)
│   ├── api/
│   │   ├── deps.py            # FastAPI dependency providers
│   │   └── endpoints.py       # CRUD, check, history, report routers
│   └── services/
│       ├── checker.py         # check engine (timing, redirects, error taxonomy)
│       ├── reports.py         # report computation
│       └── url_validation.py  # SSRF policy
├── tests/                     # 144 offline tests
├── .github/workflows/tests.yml
├── .env.example
├── pyproject.toml
├── uv.lock
├── SECURITY.md
└── LICENSE                    # MIT
```

## Prerequisites

- Linux (or any OS with Python and `uv`)
- Python ≥ 3.12 (managed automatically by `uv` if needed)
- [`uv`](https://docs.astral.sh/uv/) ≥ 0.5

## Installation (Linux, with uv)

```bash
git clone https://github.com/fabiljayson/pulsewatch.git
cd pulsewatch

uv sync --dev          # create .venv, install runtime + dev deps + lockfile
```

## Configuration

All configuration is environment-driven with safe defaults (see
`.env.example`). No secrets are required.

| Variable                                 | Default         | Purpose                                      |
|------------------------------------------|-----------------|----------------------------------------------|
| `PULSEWATCH_DB_PATH`                     | `pulsewatch.db` | SQLite file path                             |
| `PULSEWATCH_HTTP_TIMEOUT_SECONDS`        | `5.0`           | Overall outbound request timeout             |
| `PULSEWATCH_HTTP_CONNECT_TIMEOUT_SECONDS`| `3.0`           | TCP connect timeout                          |
| `PULSEWATCH_ALLOW_REDIRECTS`             | `false`         | Follow redirects (each hop re-validated)    |
| `PULSEWATCH_MAX_REDIRECTS`               | `3`             | Redirect hop cap when enabled                |
| `PULSEWATCH_HISTORY_MAX_LIMIT`           | `100`           | Upper bound for history `limit`             |
| `PULSEWATCH_REPORT_DEFAULT_HOURS`        | `24`            | Default report window                        |
| `PULSEWATCH_CHECK_INTERVAL_SECONDS`      | `300`           | Background pass frequency (`0` disables)     |

## Running the service

```bash
uv run uvicorn app.main:app --reload
```

The database file and its tables are created automatically on startup.

- Interactive API docs (Swagger UI): <http://127.0.0.1:8000/docs>
- OpenAPI schema: <http://127.0.0.1:8000/openapi.json>
- Health probe: <http://127.0.0.1:8000/health>

## API endpoints and examples

| Method | Path                                  | Purpose                          |
|--------|---------------------------------------|----------------------------------|
| GET    | `/health`                             | Service liveness                 |
| POST   | `/api/v1/endpoints`                   | Register an endpoint             |
| GET    | `/api/v1/endpoints`                   | List endpoints (paginated)       |
| GET    | `/api/v1/endpoints/{id}`              | Retrieve one endpoint            |
| PATCH  | `/api/v1/endpoints/{id}`              | Update name and/or `is_active`   |
| DELETE | `/api/v1/endpoints/{id}`              | Delete endpoint + its history    |
| POST   | `/api/v1/endpoints/{id}/check`        | Execute a health check now       |
| GET    | `/api/v1/endpoints/{id}/history`      | Recent checks, newest first      |
| GET    | `/api/v1/endpoints/{id}/report`       | Reliability report               |

### Health

```bash
curl -s http://127.0.0.1:8000/health
```

```json
{"status": "ok", "service": "pulsewatch", "version": "0.1.0"}
```

### Register an endpoint

```bash
curl -s -X POST http://127.0.0.1:8000/api/v1/endpoints \
  -H 'Content-Type: application/json' \
  -d '{"name": "Example health", "url": "https://example.com/", "is_active": true}'
```

```json
{
  "id": 1,
  "name": "Example health",
  "url": "https://example.com/",
  "is_active": true,
  "created_at": "2026-10-16T08:00:00.000000+00:00",
  "updated_at": "2026-10-16T08:00:00.000000+00:00"
}
```

### Run a check

```bash
curl -s -X POST http://127.0.0.1:8000/api/v1/endpoints/1/check
```

```json
{
  "id": 1,
  "endpoint_id": 1,
  "checked_at": "2026-10-16T08:01:00.000000+00:00",
  "status_code": 200,
  "latency_ms": 143.21,
  "success": true,
  "error_type": null
}
```

A failed check (e.g. the host is down):

```json
{
  "id": 2,
  "endpoint_id": 1,
  "checked_at": "2026-10-16T08:02:00.000000+00:00",
  "status_code": null,
  "latency_ms": null,
  "success": false,
  "error_type": "connection_error"
}
```

`error_type` is one of: `timeout`, `connection_error`, `invalid_response`,
`dns_error`, `blocked_destination`, `too_many_redirects`, `transport_error`,
`http_error` — or `null` on success.

### History

```bash
curl -s 'http://127.0.0.1:8000/api/v1/endpoints/1/history?limit=20&offset=0'
```

```json
{
  "endpoint_id": 1,
  "total": 2,
  "limit": 20,
  "offset": 0,
  "items": [
    {"id": 2, "endpoint_id": 1, "checked_at": "2026-10-16T08:02:00.000000+00:00",
     "status_code": null, "latency_ms": null, "success": false,
     "error_type": "connection_error"},
    {"id": 1, "endpoint_id": 1, "checked_at": "2026-10-16T08:01:00.000000+00:00",
     "status_code": 200, "latency_ms": 143.21, "success": true, "error_type": null}
  ]
}
```

### Report

```bash
curl -s 'http://127.0.0.1:8000/api/v1/endpoints/1/report?hours=24'
```

```json
{
  "endpoint_id": 1,
  "total_checks": 2,
  "successful_checks": 1,
  "failed_checks": 1,
  "availability_percent": 50.0,
  "average_latency_ms": 143.21,
  "first_check_at": "2026-10-16T08:01:00.000000+00:00",
  "last_check_at": "2026-10-16T08:02:00.000000+00:00",
  "window": {
    "hours": 24,
    "from": "2026-10-15T08:05:00.000000+00:00",
    "to": "2026-10-16T08:05:00.000000+00:00"
  }
}
```

### Update / delete

```bash
curl -s -X PATCH http://127.0.0.1:8000/api/v1/endpoints/1 \
  -H 'Content-Type: application/json' \
  -d '{"name": "Renamed", "is_active": false}'

curl -s -o /dev/null -w '%{http_code}\n' -X DELETE http://127.0.0.1:8000/api/v1/endpoints/1
```

`DELETE` returns `204` and cascade-deletes all stored check history.

### Quick demo script

```bash
BASE=http://127.0.0.1:8000
curl -s -X POST $BASE/api/v1/endpoints -H 'Content-Type: application/json' \
  -d '{"name": "Example", "url": "https://example.com/"}'
curl -s -X POST $BASE/api/v1/endpoints/1/check
curl -s $BASE/api/v1/endpoints/1/history
curl -s "$BASE/api/v1/endpoints/1/report?hours=24"
```

## Running tests and linting

```bash
uv run pytest                                        # run the suite (144 tests)
uv run pytest --cov=app --cov-report=term-missing    # coverage report
uv run ruff check .                                  # lint
uv run ruff format --check .                         # format check
```

All tests run **fully offline**: outbound HTTP is mocked with
`httpx.MockTransport` and DNS resolution is replaced with a fake resolver.
The last verified run: **144 passed, 96% line coverage** (your numbers may
differ as the code evolves — see CI for authoritative results).

## How availability and latency are calculated

- **Availability** = `successful_checks / total_checks × 100` over the report
  window (rounded to 2 decimals). HTTP 200–399 responses count as successful.
  With zero checks in the window, availability is `0.0`.
- **Average latency** = mean of `latency_ms` over checks **for which a response
  was received** (any status code). Timeouts, connection errors, and DNS
  failures store `latency_ms = NULL` and are **excluded** from the average —
  they are never treated as 0 ms. If no check in the window produced a
  measured latency, the report returns `null`.
- **Latency measurement** uses `time.perf_counter()` (monotonic), captured
  around the outbound request only.
- **Report window** is explicit: `from`/`to` timestamps and the `hours` size
  are part of every report. The default is the last 24 hours; `hours` accepts
  1–8760.

## Security

PulseWatch issues outbound requests to client-supplied URLs — a classic SSRF
surface. The implemented policy:

- Only `http`/`https` URLs are accepted; all other schemes are rejected.
- URLs with embedded credentials (`user:pass@`) are rejected.
- Loopback, private, link-local, multicast, unspecified, reserved, and
  IPv4-mapped-IPv6 equivalents are rejected (via the `ipaddress` module).
  This blocks `127.0.0.1`, `10/8`, `172.16/12`, `192.168/16`, `169.254.169.254`
  (cloud metadata), `::1`, `fe80::/10`, `fc00::/7`, `::ffff:…` mapped forms, etc.
- Well-known hostnames (`localhost`, `metadata.google.internal`, `*.local`,
  `*.internal`, …) are blocked at registration, before any DNS lookup.
- At check time, **every** DNS-resolved address is validated; a single bad
  address blocks the request. Redirect targets are re-validated hop-by-hop
  (redirects are disabled by default).
- Request timeouts are always applied; response bodies and headers are never
  stored; public errors expose only safe category strings, never IPs or
  exception details.
- All SQL is parameterized; inputs and result sets are length-bounded.

**Known limitations (be honest with yourself before deploying):**

- There is a **DNS-rebinding TOCTOU window** between address validation and
  the TCP connect, because HTTPX resolves the hostname again internally.
  Full DNS pinning is not achievable with HTTPX's public transport API.
- The service has **no authentication** and is intended for local development
  and controlled, trusted networks only. It is **not** hardened for
  unrestricted public deployment; see `SECURITY.md`.

## Known limitations (Day 01)

- The scheduler applies **one global interval** to every endpoint (`PULSEWATCH_CHECK_INTERVAL_SECONDS`); per-endpoint frequencies are not supported yet.
- Checking an inactive endpoint returns `409 Conflict`; activate it first.
- Single-process, single-file SQLite storage; fine for one operator, not for
  multi-tenant scale.
- No response-body or header inspection — status code and latency only.
- No alerting/notification channels.

## Roadmap

- Per-endpoint intervals and jittered execution for the scheduler (today: one global interval)
- Multi-status expectations (assert a specific status, not just 2xx/3xx)
- Response-time SLOs and rolling-window availability (e.g. 30-day)
- Webhook / email / Slack alerting on failure streaks
- Optional Prometheus metrics exporter
- TLS certificate expiry monitoring
- Import/export of endpoint configurations
- Optional authentication and multi-user support

## License

[MIT](LICENSE) © fabiljayson

## Contributing

Issues and pull requests are welcome.

1. Fork and create a feature branch: `git checkout -b feature/my-change`
2. Keep changes focused; add tests for new behavior
3. Ensure `uv run pytest` and `uv run ruff check .` pass
4. Open a pull request describing the motivation and behavior change

By contributing you agree your contributions are licensed under the MIT License.
