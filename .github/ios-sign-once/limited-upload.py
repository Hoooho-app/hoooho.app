"""Run the pinned lane with a deadline and allowlisted progress labels."""

import os
import re
import signal
import subprocess
import sys
import time
from pathlib import Path

log_path = Path(sys.argv[1])
env = dict(os.environ, GITHUB_RUN_NUMBER="202511", GITHUB_RUN_ATTEMPT="20")
allowed = {
    "archive": "Archiving the verified app source.",
    "upload": "Submitting the signed build to Apple.",
    "accepted": "Apple accepted the signed upload.",
}
seen = set()
with log_path.open("wb") as log:
    child = subprocess.Popen(
        ["fastlane", "ios", "cards_beta"], stdout=log, stderr=subprocess.STDOUT,
        env=env, start_new_session=True
    )
    deadline = time.monotonic() + 9 * 60
    while True:
        text = log_path.read_text(errors="replace")
        for stage in re.findall(r"CARDS_SIGN_STAGE:([a-z-]+)", text):
            if stage in allowed and stage not in seen:
                print(allowed[stage], flush=True)
                seen.add(stage)
        status = child.poll()
        if status is not None:
            sys.exit(status)
        if time.monotonic() >= deadline:
            os.killpg(child.pid, signal.SIGTERM)
            try:
                child.wait(timeout=8)
            except subprocess.TimeoutExpired:
                os.killpg(child.pid, signal.SIGKILL)
                child.wait()
            log.write(b"\nerror: The bounded signing and upload operation timed out.\n")
            sys.exit(1)
        time.sleep(2)
