"""SSRF-aware URL validation and outbound request policy.

Two-stage validation:

* Registration (Stage A) — static checks with no DNS: scheme, credentials,
  malformed URLs, length, well-known blocked hostnames, and IP-literal
  destinations.
* Check time (Stage B) — DNS resolution plus validation of every resolved
  address; a redirect target is re-validated hop-by-hop with both stages.

Error messages are intentionally generic and never include resolved IP
addresses or other internal network details.
"""

from __future__ import annotations

import ipaddress
import socket
from collections.abc import Callable, Sequence
from urllib.parse import urljoin, urlsplit

MAX_URL_LENGTH = 2048

ALLOWED_SCHEMES = frozenset({"http", "https"})

# Well-known hostnames that must never be monitored. DNS-based checks also
# catch these at check time; this list blocks them at registration without DNS.
BLOCKED_HOSTNAMES = frozenset(
    {
        "localhost",
        "metadata.google.internal",
        "metadata.goog",
        "instance-data",
    }
)

BLOCKED_HOSTNAME_SUFFIXES = (".localhost", ".local", ".internal")

Resolver = Callable[[str, int], list[str]]


class UrlValidationError(ValueError):
    """The URL is malformed or uses a disallowed form (scheme, credentials...)."""


class BlockedDestinationError(UrlValidationError):
    """The URL points at a disallowed destination (private, loopback, metadata...)."""


class DnsResolutionError(Exception):
    """DNS resolution failed for the URL hostname."""


def _has_illegal_characters(url: str) -> bool:
    return any(ch.isspace() or ord(ch) < 0x20 or ord(ch) == 0x7F for ch in url)


def validate_url_syntax(url: str, *, max_length: int = MAX_URL_LENGTH) -> None:
    """Stage A without the destination policy: structural checks only."""
    if not url or not url.strip():
        raise UrlValidationError("URL must not be empty")
    if len(url) > max_length:
        raise UrlValidationError(f"URL must be at most {max_length} characters")
    if _has_illegal_characters(url):
        raise UrlValidationError("URL must not contain whitespace or control characters")
    parts = urlsplit(url)
    if parts.scheme.lower() not in ALLOWED_SCHEMES:
        raise UrlValidationError("URL scheme must be http or https")
    if not parts.netloc:
        raise UrlValidationError("URL must be absolute and include a host")
    try:
        hostname = parts.hostname
        _ = parts.port  # noqa: B018 - validates port syntax, raises ValueError
    except ValueError as exc:
        raise UrlValidationError("URL host or port is malformed") from exc
    if not hostname:
        raise UrlValidationError("URL must include a hostname")
    if parts.username is not None or parts.password is not None:
        raise UrlValidationError("URL must not include embedded credentials")


def _hostname_is_blocked(hostname: str) -> bool:
    normalized = hostname.strip().rstrip(".").lower()
    if not normalized:
        return True
    if normalized in BLOCKED_HOSTNAMES:
        return True
    return any(normalized.endswith(suffix) for suffix in BLOCKED_HOSTNAME_SUFFIXES)


def validate_ip_address(ip: str | ipaddress.IPv4Address | ipaddress.IPv6Address) -> None:
    """Reject loopback, private, link-local, multicast, unspecified, metadata IPs."""
    if isinstance(ip, str):
        try:
            address: ipaddress.IPv4Address | ipaddress.IPv6Address = ipaddress.ip_address(ip)
        except ValueError as exc:
            raise BlockedDestinationError("Destination address is not allowed") from exc
    else:
        address = ip
    if isinstance(address, ipaddress.IPv6Address) and address.ipv4_mapped is not None:
        address = address.ipv4_mapped
    forbidden = (
        address.is_loopback
        or address.is_private
        or address.is_link_local
        or address.is_multicast
        or address.is_unspecified
        or address.is_reserved
        or address.is_site_local
        or not address.is_global
    )
    if forbidden:
        raise BlockedDestinationError("Destination address is not allowed")


def validate_url_for_registration(url: str, *, max_length: int = MAX_URL_LENGTH) -> None:
    """Stage A: full static policy applied when an endpoint is registered."""
    validate_url_syntax(url, max_length=max_length)
    hostname = urlsplit(url).hostname
    assert hostname is not None
    if _hostname_is_blocked(hostname):
        raise BlockedDestinationError("URL hostname is not allowed")
    try:
        ipaddress.ip_address(hostname)
    except ValueError:
        return  # hostname is not an IP literal; DNS checks happen at check time
    validate_ip_address(hostname)


def resolve_host(hostname: str, port: int) -> list[str]:
    """Default resolver: synchronous getaddrinfo returning address strings."""
    try:
        infos = socket.getaddrinfo(hostname, port, proto=socket.IPPROTO_TCP)
    except socket.gaierror as exc:
        raise DnsResolutionError("DNS resolution failed") from exc
    return [info[4][0] for info in infos]


def validate_resolved_addresses(addresses: Sequence[str]) -> None:
    """Stage B: every resolved address must be a permitted public address."""
    if not addresses:
        raise DnsResolutionError("DNS resolution returned no addresses")
    for address in addresses:
        validate_ip_address(address)


def validate_url_destination(
    url: str,
    *,
    resolver: Resolver = resolve_host,
    max_length: int = MAX_URL_LENGTH,
) -> list[str]:
    """Stage A + Stage B: validate syntax, hostname policy, and DNS results."""
    validate_url_syntax(url, max_length=max_length)
    parts = urlsplit(url)
    hostname = parts.hostname
    assert hostname is not None
    if _hostname_is_blocked(hostname):
        raise BlockedDestinationError("URL hostname is not allowed")
    port = parts.port or (443 if parts.scheme.lower() == "https" else 80)
    try:
        addresses = resolver(hostname, port)
    except DnsResolutionError:
        raise
    except OSError as exc:
        raise DnsResolutionError("DNS resolution failed") from exc
    validate_resolved_addresses(addresses)
    return addresses


def validate_redirect_location(
    current_url: str,
    location: str,
    *,
    resolver: Resolver = resolve_host,
    max_length: int = MAX_URL_LENGTH,
) -> str:
    """Validate a redirect target (relative or absolute) and return its absolute form."""
    if not location or not location.strip():
        raise UrlValidationError("Redirect location is empty")
    absolute = urljoin(current_url, location.strip())
    validate_url_destination(absolute, resolver=resolver, max_length=max_length)
    return absolute
