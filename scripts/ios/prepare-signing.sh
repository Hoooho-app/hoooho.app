#!/usr/bin/env bash
set -euo pipefail
umask 077
python3 - <<'PY'
import os,base64,plistlib,subprocess,json
from pathlib import Path
from datetime import datetime,timezone
root=Path(os.environ["RUNNER_TEMP"])/"hoooho-signing"
root.mkdir(parents=True,exist_ok=True,mode=0o700)
for key,name in [("IOS_DISTRIBUTION_P12_BASE64","distribution.p12"),("IOS_PROVISION_PROFILE_BASE64","app.mobileprovision")]:
    value=os.environ.get(key,"").strip()
    if not value: raise SystemExit("Missing secure signing material: "+key)
    data=base64.b64decode("".join(value.split()),validate=True)
    if not data: raise SystemExit("Empty signing material: "+key)
    (root/name).write_bytes(data)
    (root/name).chmod(0o600)
raw=subprocess.check_output(["security","cms","-D","-i",str(root/"app.mobileprovision")],stderr=subprocess.DEVNULL)
profile=plistlib.loads(raw)
team=os.environ["IOS_TEAM_ID"];bundle=os.environ["IOS_BUNDLE_ID"]
entitlements=profile.get("Entitlements",{})
if team not in profile.get("TeamIdentifier",[]): raise SystemExit("Profile team does not match configured Apple team")
if entitlements.get("application-identifier")!=team+"."+bundle: raise SystemExit("Profile does not match the exact bundle ID")
if profile.get("ProvisionedDevices") or entitlements.get("get-task-allow"): raise SystemExit("Use an App Store distribution profile")
expiry=profile.get("ExpirationDate")
if not expiry or expiry.replace(tzinfo=timezone.utc)<=datetime.now(timezone.utc): raise SystemExit("Distribution profile has expired")
uuid=profile.get("UUID","")
if not uuid or any(c not in "0123456789ABCDEFabcdef-" for c in uuid): raise SystemExit("Invalid profile UUID")
destination=Path.home()/"Library/MobileDevice/Provisioning Profiles"
destination.mkdir(parents=True,exist_ok=True)
(destination/(uuid+".mobileprovision")).write_bytes((root/"app.mobileprovision").read_bytes())
(root/"profile.json").write_text(json.dumps({"uuid":uuid,"name":profile["Name"]}))
print("Verified existing App Store signing profile. No certificate is created or revoked.")
PY
