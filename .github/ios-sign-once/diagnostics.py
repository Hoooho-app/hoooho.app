"""Select signing errors for an encrypted operator-only diagnostic."""
import os
from pathlib import Path
import re
import sys

out = Path(sys.argv[1])
runner = Path(os.environ["RUNNER_TEMP"])
sources = [runner / "ios-internal-sign/upload.log"]
sources.extend(sorted((runner / "hoooho-cards-signing/logs").glob("*.log")))
patterns = re.compile(r"error:|failed|Exception|CodeSign|Signing Identity|provisioning profile|note: Using|CARDS_SIGN_STAGE|fastlane finished", re.I)
secret_names = ("ASC_API_KEY_P8", "ASC_KEY_ID", "ASC_ISSUER_ID",
                "IOS_DISTRIBUTION_P12_BASE64", "IOS_DISTRIBUTION_P12_PASSWORD")
secrets = [os.environ.get(k) for k in secret_names if os.environ.get(k)]
lines = []
for path in sources:
    if not path.is_file():
        continue
    text = path.read_text(errors="replace")
    for value in secrets:
        text = text.replace(value, "[redacted]")
    text = re.sub(r"-----BEGIN [^-]+-----.*?-----END [^-]+-----", "[redacted]", text, flags=re.S)
    text = re.sub(r"eyJ[A-Za-z0-9_-]+\.eyJ[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+", "[redacted]", text)
    text = re.sub(r"(?<=\?)[^\s]+(?=(?:\s|$))", "[redacted query]", text)
    matched = [line[:4500] for line in text.splitlines() if patterns.search(line)]
    if matched:
        lines.extend([path.name, *matched[-160:]])
out.write_text("\n".join(lines)[:210000] or "No signing-specific diagnostics were available.", encoding="utf-8")
