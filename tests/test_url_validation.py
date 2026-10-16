"""SSRF URL policy tests: schemes, credentials, IP ranges, DNS, redirects."""

from __future__ import annotations

import socket

import pytest

from app.services.url_validation import (
    BlockedDestinationError,
    DnsResolutionError,
    UrlValidationError,
    validate_ip_address,
    validate_redirect_location,
    validate_url_destination,
    validate_url_for_registration,
    validate_url_syntax,
)

from .conftest import PUBLIC_IP, fake_resolver


@pytest.mark.parametrize(
    "url",
    [
        "ftp://example.com/x",
        "file:///etc/passwd",
        "gopher://example.com/",
        "ws://example.com/socket",
        "javascript:alert(1)",
        "mailto:a@example.com",
    ],
)
def test_reject_unsupported_schemes(url: str) -> None:
    with pytest.raises(UrlValidationError):
        validate_url_syntax(url)


@pytest.mark.parametrize("url", ["https://example.com/health", "http://example.com/", "https://example.com:8443/x?y=1"])
def test_accept_valid_http_urls(url: str) -> None:
    validate_url_syntax(url)


@pytest.mark.parametrize(
    "url",
    [
        "https://user:pass@example.com/",
        "https://user@example.com/",
        "http://alice:hunter2@10.0.0.1/admin",
    ],
)
def test_reject_embedded_credentials(url: str) -> None:
    with pytest.raises(UrlValidationError):
        validate_url_syntax(url)


def test_reject_empty_and_whitespace() -> None:
    for url in ("", "   ", "https://exa mple.com/", "https://example.com/\n", "https://\texample.com/"):
        with pytest.raises(UrlValidationError):
            validate_url_syntax(url)


def test_reject_too_long_url() -> None:
    with pytest.raises(UrlValidationError):
        validate_url_syntax("https://example.com/" + "a" * 5000)


def test_reject_malformed_port() -> None:
    with pytest.raises(UrlValidationError):
        validate_url_syntax("https://example.com:99999/x")
    with pytest.raises(UrlValidationError):
        validate_url_syntax("https://example.com:notaport/x")


def test_reject_missing_host() -> None:
    for url in ("https://", "http:///path", "https:///"):
        with pytest.raises(UrlValidationError):
            validate_url_syntax(url)


@pytest.mark.parametrize(
    "hostname",
    ["localhost", "LOCALHOST", "localhost.", "foo.localhost", "metadata.google.internal", "metadata.goog", "service.internal", "printer.local", "instance-data"],
)
def test_reject_blocked_hostnames(hostname: str) -> None:
    with pytest.raises(BlockedDestinationError):
        validate_url_for_registration(f"https://{hostname}/x")


@pytest.mark.parametrize(
    "ip",
    [
        "127.0.0.1",
        "127.1.2.3",
        "10.0.0.1",
        "172.16.0.1",
        "172.31.255.255",
        "192.168.1.1",
        "169.254.169.254",  # cloud metadata (link-local)
        "169.254.0.1",
        "0.0.0.0",
        "224.0.0.1",  # multicast
        "255.255.255.255",  # reserved/broadcast
        "240.0.0.1",  # reserved
        "::1",
        "::",
        "fe80::1",  # link-local
        "fc00::1",  # unique local
        "ff02::1",  # multicast
        "::ffff:127.0.0.1",  # IPv4-mapped loopback
        "::ffff:10.0.0.1",  # IPv4-mapped private
    ],
)
def test_reject_forbidden_ip_literals(ip: str) -> None:
    with pytest.raises(BlockedDestinationError):
        validate_ip_address(ip)
    host = f"[{ip}]" if ":" in ip else ip
    with pytest.raises(BlockedDestinationError):
        validate_url_for_registration(f"http://{host}/")


@pytest.mark.parametrize("ip", ["93.184.216.34", "1.1.1.1", "2606:4700:4700::1111"])
def test_accept_public_ip_literals(ip: str) -> None:
    validate_ip_address(ip)
    host = f"[{ip}]" if ":" in ip else ip
    validate_url_for_registration(f"https://{host}/health")


def test_reject_invalid_ip_string() -> None:
    with pytest.raises(BlockedDestinationError):
        validate_ip_address("999.1.1.1")
    with pytest.raises(BlockedDestinationError):
        validate_ip_address("not-an-ip")


def test_destination_validation_uses_resolver() -> None:
    addresses = validate_url_destination(
        "https://api.example.com/health", resolver=fake_resolver
    )
    assert addresses == [PUBLIC_IP]


def test_destination_validation_blocks_private_dns_answer() -> None:
    def private(hostname: str, port: int) -> list[str]:
        del hostname, port
        return ["10.1.2.3"]

    with pytest.raises(BlockedDestinationError):
        validate_url_destination("https://api.example.com/x", resolver=private)


def test_destination_validation_blocks_mixed_dns_answers() -> None:
    """One bad address among good ones must still block."""

    def mixed(hostname: str, port: int) -> list[str]:
        del hostname, port
        return [PUBLIC_IP, "127.0.0.1"]

    with pytest.raises(BlockedDestinationError):
        validate_url_destination("https://api.example.com/x", resolver=mixed)


def test_destination_validation_dns_failure() -> None:
    def broken(hostname: str, port: int) -> list[str]:
        del hostname, port
        raise socket.gaierror("nxdomain")

    with pytest.raises(DnsResolutionError):
        validate_url_destination("https://api.example.com/x", resolver=broken)


def test_destination_validation_empty_dns_answer() -> None:
    def empty(hostname: str, port: int) -> list[str]:
        del hostname, port
        return []

    with pytest.raises(DnsResolutionError):
        validate_url_destination("https://api.example.com/x", resolver=empty)


def test_redirect_location_absolute_and_relative() -> None:
    absolute = validate_redirect_location(
        "https://api.example.com/a", "https://cdn.example.com/b", resolver=fake_resolver
    )
    assert absolute == "https://cdn.example.com/b"

    relative = validate_redirect_location(
        "https://api.example.com/a", "/b", resolver=fake_resolver
    )
    assert relative == "https://api.example.com/b"


def test_redirect_location_to_private_blocked() -> None:
    with pytest.raises(BlockedDestinationError):
        validate_redirect_location(
            "https://api.example.com/a",
            "http://169.254.169.254/latest/meta-data/",
            resolver=fake_resolver,
        )
    with pytest.raises(BlockedDestinationError):
        validate_redirect_location(
            "https://api.example.com/a", "//127.0.0.1/x", resolver=fake_resolver
        )


def test_redirect_location_empty_rejected() -> None:
    with pytest.raises(UrlValidationError):
        validate_redirect_location("https://api.example.com/a", "  ", resolver=fake_resolver)


def test_registration_does_not_leak_details_in_message() -> None:
    """Error text must never include addresses or internal details."""
    try:
        validate_url_for_registration("http://169.254.169.254/latest/meta-data/")
    except BlockedDestinationError as exc:
        message = str(exc)
        assert "169.254" not in message
        assert "meta-data" not in message
    else:  # pragma: no cover
        pytest.fail("expected BlockedDestinationError")
