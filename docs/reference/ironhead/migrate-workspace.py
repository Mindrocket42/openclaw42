#!/usr/bin/env python3
"""Explicit, offline AGENTS-only Ironhead migration; dry-run unless --apply."""
import argparse
import hashlib
import os
from pathlib import Path
import tempfile

START = "<!-- ironhead-operating-contract:start -->"
END = "<!-- ironhead-operating-contract:end -->"


def digest(data):
    return hashlib.sha256(data).hexdigest()


def reject_symlinks(path):
    for entry in (path, *path.parents):
        if entry.is_symlink():
            raise ValueError("Symlink paths are not permitted for offline migration")


def merge(original, contract):
    text = original.decode("utf-8")
    block = (START + "\n" + contract.rstrip() + "\n" + END)
    if text.count(START) != text.count(END) or text.count(START) > 1:
        raise ValueError("Malformed or repeated Ironhead contract markers")
    if START in text:
        left, rest = text.split(START)
        _, right = rest.split(END)
        return (left + block + right).encode("utf-8")
    return (text + "\n\n" + block + "\n").encode("utf-8")


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("workspace", type=Path)
    parser.add_argument("--apply", action="store_true", help="Apply to an offline isolated workspace")
    args = parser.parse_args()
    workspace = Path(os.path.abspath(args.workspace))
    reject_symlinks(workspace)
    if not workspace.is_dir():
        raise ValueError("Workspace must already exist")
    target = workspace / "AGENTS.md"
    reject_symlinks(target)
    if not target.is_file():
        raise ValueError("Existing regular AGENTS.md is required")
    original = target.read_bytes()
    template = (Path(__file__).parent.parent / "templates" / "AGENTS.md").read_text()
    contract = template.split("## Ironhead Operating Contract\n", 1)[1].split("## First Run", 1)[0]
    # Last block makes precedence explicit while preserving all original bytes.
    contract = "## Ironhead Operating Contract\n\n" + (
        "For this explicitly migrated workspace, this block replaces conflicting\n"
        "generic autonomy, retry, and escalation defaults above. Preserve custom\n"
        "identity and user directives. The user's task and host authority controls\n"
        "still take precedence; this block grants no additional permission.\n\n"
    ) + contract
    updated = merge(original, contract)
    if updated == original:
        print("Already current; no files changed")
        return
    print("AGENTS.md change prepared; SOUL, IDENTITY, USER, memory, config, and credentials preserved")
    print("Original SHA256: " + digest(original))
    print("Result SHA256: " + digest(updated))
    if not args.apply:
        print("Dry run; stop workspace users and use --apply on an isolated workspace to write")
        return
    backup = workspace / ("AGENTS.md.ironhead-backup-" + digest(original)[:16])
    reject_symlinks(backup)
    if backup.exists():
        if backup.read_bytes() != original:
            raise ValueError("Existing backup does not match original; no overwrite")
    else:
        fd = os.open(backup, os.O_WRONLY | os.O_CREAT | os.O_EXCL, 0o600)
        with os.fdopen(fd, "wb") as output:
            output.write(original)
            output.flush()
            os.fsync(output.fileno())
    fd, temp_name = tempfile.mkstemp(prefix=".ironhead-agents-", dir=workspace)
    try:
        with os.fdopen(fd, "wb") as output:
            output.write(updated)
            output.flush()
            os.fsync(output.fileno())
        reject_symlinks(workspace)
        reject_symlinks(target)
        if target.read_bytes() != original:
            raise ValueError("AGENTS.md changed during preparation; no replacement")
        os.replace(temp_name, target)
        if target.read_bytes() != updated:
            raise ValueError("Written contract verification failed; preserve backup")
        print("Applied and verified; original retained in private AGENTS backup")
    finally:
        if os.path.exists(temp_name):
            os.unlink(temp_name)


if __name__ == "__main__":
    try:
        main()
    except (ValueError, OSError, UnicodeError) as error:
        raise SystemExit("Migration refused: " + str(error))
