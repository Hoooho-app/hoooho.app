#!/usr/bin/env python3
"""Retrieve a single sealed package through an encrypted temporary download pointer."""
from __future__ import annotations

import argparse
import base64
import io
import json
from pathlib import Path
import re
import stat
import sys
import time
import urllib.error
import urllib.parse
import urllib.request
import zipfile

from transport import unseal_bytes, write_private

POINTER_LIMIT = 16 * 1024
URL_LIMIT = 4096
ZIP_LIMIT = 4 * 1024 * 1024
POLL_SECONDS = 600
SOCKET_SECONDS = 8
REPOSITORY = re.compile(r"[A-Za-z0-9_-]+/[A-Za-z0-9_.-]+")
REF_PART = re.compile(r"[A-Za-z0-9_-][A-Za-z0-9_.-]*")
ASSET_HOST = re.compile(r"sdmntpr[a-z0-9]*\.oaiusercontent\.com")
ASSET_PATH = re.compile(
    r"/files/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/raw"
)
SAS_PARAMETERS = re.compile(r"[A-Za-z0-9%+/_:.=&~-]+")
SAS_SIGNATURE = re.compile(r"[A-Za-z0-9+/]+={0,2}")
RETRY_STATUS = {404, 408, 425, 429, 500, 502, 503, 504}


class RelayError(ValueError):
    pass


class NoRedirect(urllib.request.HTTPRedirectHandler):
    def redirect_request(self, req, fp, code, msg, headers, newurl):
        return None


OPENER = urllib.request.build_opener(urllib.request.ProxyHandler({}), NoRedirect())


def pointer_base(repo: str, branch: str) -> str:
    if len(repo) > 150 or REPOSITORY.fullmatch(repo) is None:
        raise RelayError("Invalid repository.")
    components = branch.split("/")
    if (
        len(branch) > 160
        or any(
            REF_PART.fullmatch(part) is None
            or ".." in part
            or part.endswith((".", ".lock"))
            for part in components
        )
    ):
        raise RelayError("Invalid branch.")
    return f"https://raw.githubusercontent.com/{repo}/refs/heads/{branch}/sealed-url.json"


def read_https(url: str, limit: int, deadline: float) -> bytes:
    remaining = deadline - time.monotonic()
    if remaining <= 0:
        raise TimeoutError
    request = urllib.request.Request(
        url, headers={"Accept-Encoding": "identity", "User-Agent": "HooohoReleaseRelay/1"}
    )
    with OPENER.open(request, timeout=min(remaining, SOCKET_SECONDS)) as response:
        if response.status != 200 or response.geturl() != url:
            raise RelayError("Unexpected download response.")
        encoding = response.headers.get("Content-Encoding")
        if encoding not in (None, "identity"):
            raise RelayError("Unexpected download encoding.")
        declared = response.headers.get("Content-Length")
        if declared is not None and (not declared.isdecimal() or int(declared) > limit):
            raise RelayError("Download exceeds size limit.")
        result = bytearray()
        while len(result) <= limit:
            if time.monotonic() >= deadline:
                raise TimeoutError
            chunk = response.read1(min(65536, limit + 1 - len(result)))
            if not chunk:
                break
            result.extend(chunk)
        if not 0 < len(result) <= limit:
            raise RelayError("Download is empty or exceeds the size limit.")
        return bytes(result)


def poll_pointer(base: str) -> bytes:
    deadline = time.monotonic() + POLL_SECONDS
    while time.monotonic() < deadline:
        try:
            return read_https(f"{base}?relay={time.time_ns()}", POINTER_LIMIT, deadline)
        except urllib.error.HTTPError as error:
            try:
                if error.code not in RETRY_STATUS:
                    raise RelayError("Pointer request was rejected.") from None
            finally:
                error.close()
        except (urllib.error.URLError, TimeoutError, ConnectionError):
            pass
        time.sleep(max(0, min(4, deadline - time.monotonic())))
    raise RelayError("Timed out waiting for the encrypted release pointer.")


def asset_url(private_pem: Path, pointer: bytes) -> str:
    obj = json.loads(pointer)
    if (
        not isinstance(obj, dict)
        or set(obj) != {"sha256", "seal"}
        or any(not isinstance(item, str) for item in obj.values())
    ):
        raise RelayError("Invalid encrypted pointer.")
    envelope = base64.b64decode(obj["seal"], validate=True)
    plain = unseal_bytes(private_pem, envelope, obj["sha256"])
    if not 0 < len(plain) <= URL_LIMIT or any(char < 33 or char > 126 for char in plain):
        raise RelayError("Invalid package URL.")
    url = plain.decode("ascii")
    parts = urllib.parse.urlsplit(url)
    if (
        not url.startswith("https://")
        or parts.scheme != "https"
        or ASSET_HOST.fullmatch(parts.netloc) is None
        or ASSET_PATH.fullmatch(parts.path) is None
        or "#" in url
        or SAS_PARAMETERS.fullmatch(parts.query) is None
        or re.search(r"%(?:0[ad]|25)", parts.query, re.IGNORECASE) is not None
    ):
        raise RelayError("Package URL is outside the allowed download origin.")

    entries = urllib.parse.parse_qsl(
        parts.query, keep_blank_values=True, strict_parsing=True, max_num_fields=28
    )
    query = dict(entries)
    if (
        len(entries) != len(query)
        or any(not re.fullmatch(r"[a-z]+", key) for key in query)
        or query.get("sp") != "r"
        or query.get("sr") != "b"
        or not query.get("se")
        or SAS_SIGNATURE.fullmatch(query.get("sig", "")) is None
    ):
        raise RelayError("Expected a read-only signed blob URL.")
    return url


def package_from_zip(data: bytes) -> bytes:
    with zipfile.ZipFile(io.BytesIO(data)) as zipped:
        members = zipped.infolist()
        if len(members) != 1:
            raise RelayError("Expected exactly one sealed package in the download.")
        member = members[0]
        mode = stat.S_IFMT(member.external_attr >> 16)
        if (
            member.orig_filename != "Package.sealed"
            or member.is_dir()
            or mode not in (0, stat.S_IFREG)
            or member.flag_bits & 1
            or member.compress_type not in (zipfile.ZIP_STORED, zipfile.ZIP_DEFLATED)
            or not 0 < member.file_size <= ZIP_LIMIT
        ):
            raise RelayError("Unexpected sealed package entry.")
        with zipped.open(member) as source:
            value = source.read(ZIP_LIMIT + 1)
        if len(value) != member.file_size or len(value) > ZIP_LIMIT:
            raise RelayError("Sealed package exceeds the size limit.")
    return value


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("private_pem", type=Path)
    parser.add_argument("repository")
    parser.add_argument("branch")
    parser.add_argument("output_seal", type=Path)
    args = parser.parse_args()
    try:
        pointer = poll_pointer(pointer_base(args.repository, args.branch))
        url = asset_url(args.private_pem, pointer)
        zipped = read_https(url, ZIP_LIMIT, time.monotonic() + 40)
        write_private(args.output_seal, package_from_zip(zipped))
    except RelayError as error:
        print(f"Release relay failed: {error}", file=sys.stderr)
        return 1
    except Exception:
        print("Release relay failed to authenticate or retrieve the package.", file=sys.stderr)
        return 1
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
