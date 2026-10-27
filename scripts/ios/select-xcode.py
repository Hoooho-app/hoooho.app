"""Select an installed non-beta Xcode 26+ without relying on runner defaults."""
import glob
import re
import subprocess
import sys

def version_from_output(text):
    match = re.search(r"Xcode ([0-9]+(?:[.][0-9]+)*)", text)
    return tuple(map(int, match.group(1).split("."))) if match else None

def choose(installations):
    choices = [(version, path) for path, text in installations
               if "beta" not in path.lower()
               for version in [version_from_output(text)]
               if version and version[0] >= 26]
    if not choices:
        raise ValueError("No non-beta Xcode 26+ installation on this runner")
    return max(choices)[1]

def main():
    installations = []
    for app in glob.glob("/Applications/Xcode*.app"):
        developer = app + "/Contents/Developer"
        try:
            text = subprocess.check_output([developer + "/usr/bin/xcodebuild", "-version"],
                                           stderr=subprocess.DEVNULL, text=True)
            installations.append((developer, text))
        except (OSError, subprocess.CalledProcessError):
            continue
    try:
        print(choose(installations))
    except ValueError as error:
        print(str(error), file=sys.stderr)
        for path, text in installations:
            print(path + ": " + text.splitlines()[0], file=sys.stderr)
        return 1
    return 0

if __name__ == "__main__":
    raise SystemExit(main())
