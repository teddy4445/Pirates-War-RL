from __future__ import annotations

import argparse
import hashlib
import io
import json
import zipfile
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
PYTHON = ROOT / "python"
OUTPUT = ROOT / "public" / "downloads" / "FleetRL_Python_Training_Bundle.zip"
DOCS = ("PYTHON_TRAINING_GUIDE.md", "MODEL_EXPORT_AND_COMPATIBILITY.md", "CROSS_LANGUAGE_PARITY.md")


def files() -> list[tuple[str, bytes]]:
    records: list[tuple[str, bytes]] = []
    for path in sorted(PYTHON.rglob("*")):
        relative = path.relative_to(PYTHON)
        if not path.is_file() or any(part in {".venv", "__pycache__", ".pytest_cache"} or part.startswith("smoke-") for part in relative.parts) or path.suffix == ".pyc":
            continue
        records.append((relative.as_posix(), path.read_bytes()))
    for name in DOCS:
        path = ROOT / "docs" / name
        if path.exists(): records.append((f"docs/{name}", path.read_bytes()))
    compatibility = {"bundleVersion": "fleetrl-python-bundle-v1", "packageVersion": "0.1.0", "python": ">=3.10", "engine": "fleetrl-engine-py-v6", "rules": "fleetrl-rules-v6", "api": "fleetrl-agent-v1", "featureEncoder": "ship-64-v1", "actionDecoder": "discrete-22-v1", "modelExport": "dense-json-v1", "websiteBackend": False}
    records.append(("COMPATIBILITY.json", json.dumps(compatibility, indent=2).encode()))
    manifest = {"schemaVersion": "fleetrl-python-bundle-manifest-v1", "generatedBy": "tools/package_python.py", "files": [{"path": name, "bytes": len(data), "sha256": hashlib.sha256(data).hexdigest()} for name, data in records]}
    records.append(("BUNDLE_MANIFEST.json", json.dumps(manifest, indent=2).encode()))
    return records


def build() -> bytes:
    output = io.BytesIO()
    with zipfile.ZipFile(output, "w", zipfile.ZIP_DEFLATED, compresslevel=9) as archive:
        for name, data in files():
            info = zipfile.ZipInfo(name, date_time=(2026, 9, 26, 0, 0, 0)); info.compress_type = zipfile.ZIP_DEFLATED; info.external_attr = 0o100644 << 16
            archive.writestr(info, data)
    return output.getvalue()


def main() -> None:
    parser = argparse.ArgumentParser(); parser.add_argument("--check", action="store_true"); args = parser.parse_args(); data = build(); digest = hashlib.sha256(data).hexdigest()
    if args.check:
        if not OUTPUT.exists() or OUTPUT.read_bytes() != data: raise SystemExit("Python training ZIP is missing or stale; run npm run python:package")
        print(f"fresh {OUTPUT.relative_to(ROOT)} sha256={digest}"); return
    OUTPUT.parent.mkdir(parents=True, exist_ok=True); OUTPUT.write_bytes(data); OUTPUT.with_suffix(".zip.sha256").write_text(f"{digest}  {OUTPUT.name}\n", encoding="ascii")
    print(f"wrote {OUTPUT.relative_to(ROOT)} bytes={len(data)} sha256={digest}")


if __name__ == "__main__":
    main()
