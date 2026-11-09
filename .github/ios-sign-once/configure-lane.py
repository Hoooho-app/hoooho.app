"""Separate Apple's processing check from the one-shot upload lane."""

from pathlib import Path

lane = Path("CardVault/fastlane/Fastfile")
source = lane.read_text(encoding="utf-8")
edits = [
    ("    ipa = build_app(", '    UI.message("CARDS_SIGN_STAGE:archive")\n    ipa = build_app('),
    ("    upload_to_testflight(", '    UI.message("CARDS_SIGN_STAGE:upload")\n    upload_to_testflight('),
    ("skip_waiting_for_build_processing: false", "skip_waiting_for_build_processing: true"),
    ('    UI.success("Cards upload and Apple processing finished. Assign the build to the Cards internal group in App Store Connect before calling it installable.")',
     '    UI.message("CARDS_SIGN_STAGE:accepted")')
]
for old, new in edits:
    if source.count(old) != 1:
        raise SystemExit("The pinned Fastfile differs from the reviewed release lane.")
    source = source.replace(old, new)
lane.write_text(source, encoding="utf-8")
