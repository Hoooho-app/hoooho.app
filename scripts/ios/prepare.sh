#!/usr/bin/env bash
set -euo pipefail
cd "$(dirname "$0")/../.."
test "$(uname -s)" = Darwin || { echo "This build requires a macOS Xcode runner."; exit 1; }
selected_developer="$(python3 scripts/ios/select-xcode.py)"
export DEVELOPER_DIR="$selected_developer"
if [ -n "${GITHUB_ENV:-}" ]; then echo "DEVELOPER_DIR=$DEVELOPER_DIR" >> "$GITHUB_ENV"; fi
xcodebuild -version
major="$(xcodebuild -version | awk '/Xcode/{split($2,v,".");print v[1]}')"
test "$major" -ge 26 || { echo "Xcode 26 or later is required."; exit 1; }
command -v xcodegen >/dev/null || brew install xcodegen
icon_dir="ios/Hoooho/App/Assets.xcassets/AppIcon.appiconset"
mkdir -p "$icon_dir"
sips -s format png -z 1024 1024 public/icons/app-icon-512-huhu-20261017.png --out "$icon_dir/AppIcon1024.png" >/dev/null
python3 - <<'PY'
import json
from pathlib import Path
root=Path("ios/Hoooho/App/Assets.xcassets")
(root/"Contents.json").write_text(json.dumps({"info":{"author":"xcode","version":1}}))
(root/"AppIcon.appiconset/Contents.json").write_text(json.dumps({"images":[{"filename":"AppIcon1024.png","idiom":"universal","platform":"ios","size":"1024x1024"}],"info":{"author":"xcode","version":1}}))
PY
xcodegen generate --spec ios/Hoooho/project.yml
