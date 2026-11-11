#!/usr/bin/env python3
"""Seal one pinned release archive to an ephemeral RSA signing-runner key."""
from __future__ import annotations

import argparse
import hashlib
import hmac
import os
from pathlib import Path, PurePosixPath
import re
import shutil
import struct
import sys
import tarfile

from cryptography.hazmat.primitives import hashes, serialization
from cryptography.hazmat.primitives.asymmetric import padding, rsa
from cryptography.hazmat.primitives.ciphers.aead import AESGCM

MAGIC = b"HOOOHO-SEALED-1\x00"
LABEL = b"Hoooho one-shot release transport v1"
NONCE_BYTES = 12
TAG_BYTES = 16
MAX_TAR_BYTES = 20 * 1024 * 1024
MAX_UNPACKED_BYTES = 32 * 1024 * 1024
MAX_FILES = 2048
MAX_PEM_BYTES = 8192
MAX_ENVELOPE_BYTES = MAX_TAR_BYTES + len(MAGIC) + 2 + 512 + NONCE_BYTES + TAG_BYTES
SUPPORTED_RSA_BITS = {3072, 4096}
SHA256_PATTERN = re.compile(r"[a-f0-9]{64}")


class TransportError(ValueError):
    """An intentionally non-sensitive transport failure."""


def read_bounded(path: Path, maximum: int) -> bytes:
    with path.open("rb") as handle:
        value = handle.read(maximum + 1)
    if not 0 < len(value) <= maximum:
        raise TransportError("Input file is empty or exceeds the size limit.")
    return value


def write_private(path: Path, value: bytes) -> None:
    descriptor = os.open(path, os.O_WRONLY | os.O_CREAT | os.O_EXCL, 0o600)
    try:
        with os.fdopen(descriptor, "wb") as handle:
            handle.write(value)
    except BaseException:
        path.unlink(missing_ok=True)
        raise


def key_padding() -> padding.OAEP:
    return padding.OAEP(
        mgf=padding.MGF1(algorithm=hashes.SHA256()),
        algorithm=hashes.SHA256(),
        label=LABEL,
    )


def seal(public_pem: Path, archive_path: Path, output: Path) -> None:
    archive = read_bounded(archive_path, MAX_TAR_BYTES)
    key = serialization.load_pem_public_key(read_bounded(public_pem, MAX_PEM_BYTES))
    if not isinstance(key, rsa.RSAPublicKey) or key.key_size not in SUPPORTED_RSA_BITS:
        raise TransportError("Expected a 3072- or 4096-bit RSA public key.")

    data_key = AESGCM.generate_key(bit_length=256)
    wrapped_key = key.encrypt(data_key, key_padding())
    nonce = os.urandom(NONCE_BYTES)
    header = MAGIC + struct.pack(">H", len(wrapped_key)) + wrapped_key + nonce
    ciphertext = AESGCM(data_key).encrypt(nonce, archive, header)
    write_private(output, header + ciphertext)


def unseal_bytes(private_pem: Path, value: bytes, expected_sha256: str) -> bytes:
    if SHA256_PATTERN.fullmatch(expected_sha256) is None:
        raise TransportError("Expected a lowercase SHA-256 digest of the exact release archive.")
    key = serialization.load_pem_private_key(
        read_bounded(private_pem, MAX_PEM_BYTES), password=None
    )
    if not isinstance(key, rsa.RSAPrivateKey) or key.key_size not in SUPPORTED_RSA_BITS:
        raise TransportError("Expected a 3072- or 4096-bit RSA private key.")

    if not 0 < len(value) <= MAX_ENVELOPE_BYTES:
        raise TransportError("Envelope is empty or exceeds the size limit.")
    key_start = len(MAGIC) + 2
    if len(value) < key_start or not value.startswith(MAGIC):
        raise TransportError("Unrecognized envelope version.")
    wrapped_length = struct.unpack(">H", value[len(MAGIC):key_start])[0]
    if wrapped_length != key.key_size // 8:
        raise TransportError("Envelope key size does not match the runner key.")

    nonce_start = key_start + wrapped_length
    data_start = nonce_start + NONCE_BYTES
    if len(value) <= data_start + TAG_BYTES:
        raise TransportError("Truncated or empty envelope.")
    data_key = key.decrypt(value[key_start:nonce_start], key_padding())
    if len(data_key) != 32:
        raise TransportError("Envelope does not contain an AES-256 key.")

    archive = AESGCM(data_key).decrypt(
        value[nonce_start:data_start], value[data_start:], value[:data_start]
    )
    if len(archive) > MAX_TAR_BYTES:
        raise TransportError("Decrypted archive exceeds the size limit.")
    if not hmac.compare_digest(hashlib.sha256(archive).hexdigest(), expected_sha256):
        raise TransportError("Decrypted archive does not match the pinned release digest.")
    return archive


def unseal(private_pem: Path, sealed_path: Path, expected_sha256: str, output: Path) -> None:
    envelope = read_bounded(sealed_path, MAX_ENVELOPE_BYTES)
    write_private(output, unseal_bytes(private_pem, envelope, expected_sha256))


def safe_member_path(member: tarfile.TarInfo) -> PurePosixPath:
    name = member.name
    path = PurePosixPath(name)
    if (
        not name
        or path.is_absolute()
        or ".." in path.parts
        or "\\" in name
        or any(ord(char) < 32 or ord(char) == 127 for char in name)
        or len(name.encode("utf-8")) > 1024
    ):
        raise TransportError("Archive contains an unsafe path.")
    return path


def extract(archive_path: Path, output: Path) -> None:
    if output.is_symlink() or not output.is_dir() or any(output.iterdir()):
        raise TransportError("Extraction output must be an existing empty directory.")
    if not 0 < archive_path.stat().st_size <= MAX_TAR_BYTES:
        raise TransportError("Archive is empty or exceeds the size limit.")

    seen: set[PurePosixPath] = set()
    ordinary_files: set[PurePosixPath] = set()
    entries: list[tuple[PurePosixPath, tarfile.TarInfo]] = []
    total_bytes = 0
    with tarfile.open(archive_path, mode="r:*") as archive:
        for index, member in enumerate(archive, start=1):
            if index > MAX_FILES:
                raise TransportError("Archive contains too many entries.")
            path = safe_member_path(member)
            if member.isdir() and not path.parts:
                continue
            if (
                path in seen
                or not path.parts
                or not (member.isdir() or member.isfile())
                or member.sparse is not None
                or member.size < 0
                or (member.isdir() and member.size != 0)
            ):
                raise TransportError("Archive contains duplicate or unsupported entries.")
            total_bytes += member.size
            if total_bytes > MAX_UNPACKED_BYTES:
                raise TransportError("Extracted archive would exceed the size limit.")
            seen.add(path)
            if member.isfile():
                ordinary_files.add(path)
            entries.append((path, member))

        if not ordinary_files:
            raise TransportError("Archive contains no regular files.")
        for path, _ in entries:
            if any(parent in ordinary_files for parent in path.parents):
                raise TransportError("Archive contains conflicting file and directory paths.")

        for path, member in entries:
            target = output.joinpath(*path.parts)
            if member.isdir():
                target.mkdir(mode=0o700, parents=True, exist_ok=True)
                continue
            target.parent.mkdir(mode=0o700, parents=True, exist_ok=True)
            source = archive.extractfile(member)
            if source is None:
                raise TransportError("Archive is missing file contents.")
            mode = 0o700 if member.mode & 0o100 else 0o600
            with source, os.fdopen(
                os.open(target, os.O_WRONLY | os.O_CREAT | os.O_EXCL, mode), "wb"
            ) as destination:
                shutil.copyfileobj(source, destination)


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    commands = parser.add_subparsers(dest="operation", required=True)

    seal_args = commands.add_parser("seal")
    seal_args.add_argument("public_pem", type=Path)
    seal_args.add_argument("archive", type=Path)
    seal_args.add_argument("output", type=Path)

    open_args = commands.add_parser("open")
    open_args.add_argument("private_pem", type=Path)
    open_args.add_argument("envelope", type=Path)
    open_args.add_argument("expected_sha256")
    open_args.add_argument("output", type=Path)

    extract_args = commands.add_parser("extract")
    extract_args.add_argument("archive", type=Path)
    extract_args.add_argument("output", type=Path)
    args = parser.parse_args()

    try:
        if args.operation == "seal":
            seal(args.public_pem, args.archive, args.output)
        elif args.operation == "open":
            unseal(args.private_pem, args.envelope, args.expected_sha256, args.output)
        else:
            extract(args.archive, args.output)
    except TransportError as error:
        print(f"Release transport failed: {error}", file=sys.stderr)
        return 1
    except Exception:
        print("Release transport failed to process or authenticate input.", file=sys.stderr)
        return 1
    return 0


if __name__ == "__main__":
    raise SystemExit(main())

