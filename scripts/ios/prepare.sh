#!/usr/bin/env bash
set -euo pipefail
cd "$(dirname "$0")/../.."
test "$(uname -s)" = Darwin || { echo "This build requires a macOS Xcode runner."; exit 1; }
export DEVELOPER_DIR="$(python3 - <<'PY'
import glob,re,subprocess
choices=[]
for app in glob.glob('/Applications/Xcode*.app'):
    developer=app+'/Contents/Developer'
    try:
        text=subprocess.check_output([developer+'/usr/bin/xcodebuild','-version'],stderr=subprocess.DEVNULL,text=True)
        match=re.search(r'Xcode (\\d+(?:\\.\\d+)*)',text)
        if match:
            version=tuple(map(int,match.group(1).split('.')))
            if version[0]>=26: choices.append((version,developer))
    except (OSError,subprocess.CalledProcessError): pass
if not choices: raise SystemExit('No Xcode 26+ installation on this runner')
print(max(choices)[1])
PY
)"
if [ -n "${GITHUB_ENV:-}" ]; then printf 'DEVELOPER_DIR=%s\\n' "$DEVELOPER_DIR" >> "$GITHUB_ENV"; fi
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
