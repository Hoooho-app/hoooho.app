#!/usr/bin/env python3
"""Stage and validate an existing, exact Cards App Store provisioning profile."""

import base64
import binascii
import hashlib
import json
import os
import plistlib
import re
import subprocess
from datetime import datetime, timezone
from pathlib import Path
from uuid import UUID

BUNDLE_ID = "com.hoooho.cards"


def required(name):
    value = os.environ.get(name, "").strip()
    if not value:
        raise SystemExit(f"Cards signing preflight: missing {name}.")
    return value


def decode_secret(name):
    try:
        return base64.b64decode("".join(required(name).split()), validate=True)
    except binascii.Error as error:
        raise SystemExit(f"Cards signing preflight: invalid base64 in {name}.") from error


def validate_profile(profile, team, now):
    entitlements = profile.get("Entitlements", {})
    if team not in profile.get("TeamIdentifier", ()):
        raise ValueError("Profile belongs to another Apple team.")
    if entitlements.get("application-identifier") != f"{team}.{BUNDLE_ID}":
        raise ValueError("Profile does not match the exact Cards bundle identifier.")
    if entitlements.get("com.apple.developer.team-identifier") != team:
        raise ValueError("Profile entitlements do not match the configured team.")
    if "iOS" not in profile.get("Platform", ()):
        raise ValueError("Profile does not support iOS.")
    if "ProvisionedDevices" in profile or profile.get("ProvisionsAllDevices") or entitlements.get("get-task-allow") is not False:
        raise ValueError("Use an App Store distribution profile.")
    expires = profile.get("ExpirationDate")
    if not isinstance(expires, datetime):
        raise ValueError("Profile expiry is missing.")
    if expires.replace(tzinfo=expires.tzinfo or timezone.utc) <= now:
        raise ValueError("Profile has expired.")
    uuid = str(UUID(profile.get("UUID", ""))).upper()
    name = profile.get("Name", "")
    certificates = profile.get("DeveloperCertificates", ())
    if not isinstance(name, str) or not name.strip() or not certificates:
        raise ValueError("Profile has no valid name or signing certificates.")
    if not all(isinstance(certificate, bytes) and certificate for certificate in certificates):
        raise ValueError("Profile contains an invalid signing certificate.")
    return {
        "uuid": uuid,
        "name": name,
        "certificate_fingerprints": [
            hashlib.sha1(certificate).hexdigest().upper() for certificate in certificates
        ],
    }


def main():
    team = required("CARDS_IOS_TEAM_ID")
    app_id = required("CARDS_ASC_APP_ID")
    if not re.fullmatch(r"[A-Z0-9]{10}", team) or not app_id.isascii() or not app_id.isdecimal():
        raise SystemExit("Cards signing preflight: invalid Team ID or App Store Connect numeric ID.")
    for name in ("CARDS_ASC_KEY_ID", "CARDS_ASC_ISSUER_ID", "CARDS_ASC_API_KEY_P8", "CARDS_IOS_DISTRIBUTION_P12_PASSWORD"):
        required(name)

    os.umask(0o077)
    root = Path(required("RUNNER_TEMP")) / "hoooho-cards-signing"
    root.mkdir(exist_ok=True, mode=0o700)
    cert = decode_secret("CARDS_IOS_DISTRIBUTION_P12_BASE64")
    profile_bytes = decode_secret("CARDS_IOS_PROVISION_PROFILE_BASE64")
    if not cert or not profile_bytes:
        raise SystemExit("Cards signing preflight: empty certificate or profile.")
    profile_path = root / "cards.mobileprovision"
    profile_path.write_bytes(profile_bytes)
    decoded = subprocess.run(["security", "cms", "-D", "-i", str(profile_path)], capture_output=True)
    if decoded.returncode:
        raise SystemExit("Cards signing preflight: unable to decode the Apple profile.")
    try:
        profile = validate_profile(plistlib.loads(decoded.stdout), team, datetime.now(timezone.utc))
    except (ValueError, TypeError, plistlib.InvalidFileException) as error:
        raise SystemExit(f"Cards signing preflight: {error}") from error
    (root / "distribution.p12").write_bytes(cert)
    (root / "AuthKey.p8").write_text(required("CARDS_ASC_API_KEY_P8") + "\n", encoding="utf-8")
    (root / "profile.json").write_text(json.dumps(profile), encoding="utf-8")
    # Modern Xcode uses UserData. The legacy location lets Fastlane discover
    # the same validated profile without downloading anything from Apple.
    for relative in ("Library/Developer/Xcode/UserData/Provisioning Profiles", "Library/MobileDevice/Provisioning Profiles"):
        destination = Path.home() / relative
        destination.mkdir(parents=True, exist_ok=True)
        (destination / f"{profile['uuid']}.mobileprovision").write_bytes(profile_bytes)
    print("Exact Cards App Store provisioning profile verified.")


if __name__ == "__main__":
    main()
