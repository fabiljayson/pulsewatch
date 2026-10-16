# Security Policy

## Supported versions

This is a Day 01 MVP (v0.1.x). Security fixes are applied on a best-effort
basis to the latest `main` branch only.

## Threat model

PulseWatch issues outbound HTTP requests to URLs supplied by API clients. This
is a **server-side request forgery (SSRF)** surface: a malicious client could
otherwise aim the service at loopback interfaces, private networks, or cloud
metadata endpoints.

The service also stores monitoring data in a local SQLite file and exposes an
unauthenticated HTTP API.

## Implemented protections

- **Scheme allowlist** — only `http` and `https`.
- **Credential rejection** — URLs with `user:pass@` are refused.
- **Destination filtering** — loopback, private (RFC 1918 / ULA), link-local,
  multicast, unspecified, reserved, documentation, carrier-grade-NAT, and
  IPv4-mapped-IPv6 forms are rejected using Python's `ipaddress` module.
- **Cloud metadata** — `169.254.169.254` (and IPv6 `fd00:ec2::254`) fall in
  blocked ranges; `metadata.google.internal` and friends are hostname-blocked.
- **DNS validation at check time** — every resolved A/AAAA address is checked;
  mixed public/private answers are blocked. IP-literal URLs are checked
  directly, without DNS.
- **Redirect policy** — automatic redirects are **disabled**. When explicitly
  enabled, each `Location` target (absolute or relative) is re-validated with
  the full policy before following, with a hard hop cap.
- **Timeouts** — connect and overall request timeouts are always applied.
- **Data minimization** — response bodies and headers are never persisted;
  public error responses expose only fixed category strings.
- **SQL safety** — exclusively parameterized queries; bounded inputs and
  page sizes.
- **HTTPX hardening** — `trust_env=False` (environment proxies ignored),
  `follow_redirects=False` by default.

## Known limitations

- **DNS rebinding (TOCTOU).** Addresses are validated immediately before the
  request, but HTTPX performs its own resolution at connect time. A hostile
  DNS server could in principle return a public address during validation and
  a private address at connect. Full DNS pinning is not achievable with
  HTTPX's public transport API, so this is documented rather than papered over.
- **No authentication.** The API is unauthenticated by design in Day 01.
- **No TLS client authentication or encryption** beyond what Uvicorn provides.

## Safe-use guidance

- Run PulseWatch on a trusted network, behind an existing reverse proxy with
  authentication, or bound to `127.0.0.1`.
- Do **not** expose it directly to the public internet without a security
  review, an authentication layer, and network-level egress controls
  (firewall/egress proxy) as defense in depth.
- Treat every registered URL as untrusted input.

## Reporting a vulnerability

Please open a GitHub issue at
[github.com/fabiljayson/pulsewatch/issues](https://github.com/fabiljayson/pulsewatch/issues)
with the label `security`, or contact the maintainer privately via GitHub.
Please do **not** open a public issue for undisclosed vulnerabilities.

You can also run your own audit:

```bash
uv run pip-audit   # optional; install pip-audit first
uv run pytest --cov=app --cov-report=term-missing
```
