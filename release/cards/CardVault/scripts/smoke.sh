#!/usr/bin/env bash
set -euo pipefail
temp="${RUNNER_TEMP:?Missing simulator runner temp directory}"
device="$(xcrun simctl list devices available -j | python3 -c '
import json,sys
for runtime, devices in sorted(json.load(sys.stdin)["devices"].items(), reverse=True):
    for device in devices:
        if device["isAvailable"] and device["name"].startswith("iPhone"):
            print(device["udid"])
            sys.exit(0)
sys.exit("No installed iPhone simulator")
')"
trap 'xcrun simctl shutdown "$device" >/dev/null 2>&1 || true' EXIT
xcrun simctl boot "$device"
xcrun simctl bootstatus "$device" -b
xcrun simctl status_bar "$device" override --time '9:41' --dataNetwork wifi --wifiMode active --wifiBars 3 --cellularMode active --cellularBars 4 --batteryState discharging --batteryLevel 100
xcrun simctl ui "$device" appearance dark
xcrun simctl install "$device" "$temp/cards-derived/Build/Products/Debug-iphonesimulator/CardVault.app"
xcrun simctl launch --terminate-running-process "$device" com.hoooho.cards
mkdir -p "$temp/cards-smoke"
sleep 3
xcrun simctl io "$device" screenshot "$temp/cards-smoke/Lock.png"
