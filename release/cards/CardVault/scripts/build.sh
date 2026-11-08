#!/usr/bin/env bash
set -euo pipefail
cd "$(dirname "$0")/.."

if [[ "$(uname -s)" != Darwin ]]; then
    echo 'CardVault requires macOS and Xcode 26 or later for a native build.' >&2
    exit 1
fi

# Runners can change their default Xcode. Choose a compatible installed copy.
if [[ -z "${DEVELOPER_DIR:-}" ]]; then
    DEVELOPER_DIR="$(python3 - <<'PY'
import plistlib
import subprocess
from pathlib import Path

def version(developer):
    try:
        with (developer.parent / "Info.plist").open("rb") as file:
            value = plistlib.load(file)["CFBundleShortVersionString"]
        return tuple(int(part) for part in value.split("."))
    except (KeyError, OSError, ValueError):
        return ()

active = subprocess.run(["xcode-select", "-p"], capture_output=True, text=True)
choices = [Path(active.stdout.strip())] if active.returncode == 0 else []
choices.extend(app / "Contents" / "Developer" for app in Path("/Applications").glob("Xcode*.app"))
supported = [choice for choice in choices if version(choice) >= (26,)]
if not supported:
    raise SystemExit("No Xcode 26 or later found.")
print(max(supported, key=version))
PY
)"
fi
export DEVELOPER_DIR
if [[ -n "${GITHUB_ENV:-}" ]]; then
    printf 'DEVELOPER_DIR=%s\n' "$DEVELOPER_DIR" >> "$GITHUB_ENV"
fi
xcodebuild -version
sdk_version="$(xcrun --sdk iphoneos --show-sdk-version)"
if [[ "${sdk_version%%.*}" -lt 26 ]]; then
    echo 'The selected Xcode does not provide the iOS 26 or later SDK.' >&2
    exit 1
fi

XCODEGEN_VERSION=2.44.1
if [[ -n "${XCODEGEN_BIN:-}" ]]; then
    generator="$XCODEGEN_BIN"
elif command -v xcodegen >/dev/null && [[ "$(xcodegen --version)" == "Version: $XCODEGEN_VERSION" ]]; then
    generator="$(command -v xcodegen)"
else
    generator_dir="$(mktemp -d "${RUNNER_TEMP:-${TMPDIR:-/tmp}}/cards-xcodegen.XXXXXXXX")"
    trap 'rm -rf "$generator_dir"' EXIT
    curl --fail --location --silent --show-error --retry 3 \
        "https://github.com/yonaskolb/XcodeGen/releases/download/$XCODEGEN_VERSION/xcodegen.zip" \
        --output "$generator_dir/xcodegen.zip"
    printf '%s  %s\n' 'a2e905fb68446e9bb4008cdfe2e13e3f176d0cbcca828b71770f8e53fca91b73' \
        "$generator_dir/xcodegen.zip" | shasum -a 256 -c
    ditto -x -k "$generator_dir/xcodegen.zip" "$generator_dir"
    generator="$(find "$generator_dir" -type f -name xcodegen -print -quit)"
fi
if [[ -z "$generator" || "$("$generator" --version)" != "Version: $XCODEGEN_VERSION" ]]; then
    echo "XcodeGen $XCODEGEN_VERSION is required." >&2
    exit 1
fi

plutil -lint Info.plist
"$generator" generate --spec project.yml

case "${1:-simulator}" in
    project)
        ;;
    simulator)
        xcodebuild -project CardVault.xcodeproj -scheme CardVault -configuration Debug \
            -destination 'generic/platform=iOS Simulator' \
            -derivedDataPath "${RUNNER_TEMP:-$PWD/.build}/cards-derived" \
            CODE_SIGNING_ALLOWED=NO CODE_SIGNING_REQUIRED=NO build
        ;;
    *)
        echo 'Usage: build.sh [project|simulator]' >&2
        exit 2
        ;;
esac
