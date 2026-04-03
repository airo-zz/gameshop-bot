"""
Hook: auto-format Python files with ruff after Edit/Write.
Reads Claude Code's hook JSON from stdin.
"""
import json
import subprocess
import sys


def posix_to_win(path: str) -> str:
    """Convert /c/Users/... to C:/Users/..."""
    if len(path) > 2 and path[0] == "/" and path[2] == "/":
        return path[1].upper() + ":" + path[2:]
    return path


data = json.loads(sys.stdin.read())
f = data.get("tool_input", {}).get("file_path", "")

if f and f.endswith(".py"):
    f = posix_to_win(f)
    subprocess.run(["python3", "-m", "ruff", "format", f], check=False)
    subprocess.run(["python3", "-m", "ruff", "check", "--fix", f], check=False)
