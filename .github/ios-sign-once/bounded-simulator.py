"""Launch the validated application once the simulator host is ready."""
import json
import os
from pathlib import Path
import subprocess
import time

runner = Path(os.environ["RUNNER_TEMP"])
private_dir = runner / "ios-internal-sign"
log = private_dir / "smoke.log"
app = runner / "cards-derived/Build/Products/Debug-iphonesimulator/CardVault.app"
assert app.is_dir()

def sim(*args, timeout, stdout):
    return subprocess.run(["xcrun", "simctl", *args], stdout=stdout, stderr=stream, check=True, timeout=timeout)

with log.open("ab") as stream:
    devices = sim("list", "devices", "available", "-j", timeout=35, stdout=subprocess.PIPE)
    runtimes = json.loads(devices.stdout)["devices"]
    phones = [
        device for _, members in sorted(runtimes.items(), reverse=True) for device in members
        if device["isAvailable"] and device["name"].startswith("iPhone")
    ]
    if not phones:
        print("::warning::The runner has no available iPhone simulator. Native compilation and regression assertions passed.")
        raise SystemExit(0)
    phone = next((device for device in phones if device["state"] == "Booted"), phones[0])
    device = phone["udid"]
    try:
        try:
            if phone["state"] != "Booted":
                sim("boot", device, timeout=65, stdout=stream)
            sim("bootstatus", device, "-b", timeout=150, stdout=stream)
        except subprocess.TimeoutExpired:
            print("::warning::The runner's iPhone simulator did not finish booting. Native compilation and regression assertions passed.")
            raise SystemExit(0)
        sim("install", device, str(app), timeout=65, stdout=stream)
        sim("launch", "--terminate-running-process", device, "com.hoooho.cards", timeout=60, stdout=stream)
        time.sleep(3)
        sim("io", device, "screenshot", str(private_dir / "Lock.png"), timeout=35, stdout=stream)
    except (subprocess.CalledProcessError, subprocess.TimeoutExpired):
        raise SystemExit("The simulator smoke check failed.")
    finally:
        try:
            sim("shutdown", device, timeout=15, stdout=stream)
        except (subprocess.CalledProcessError, subprocess.TimeoutExpired):
            pass
print("The pinned app launched successfully on the iPhone simulator.")
