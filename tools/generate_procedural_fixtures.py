from __future__ import annotations

import json
from pathlib import Path

from fleetrl.procedural_map import generate_map

ROOT = Path(__file__).resolve().parents[1]
OUTPUT = ROOT / "python" / "src" / "fleetrl" / "data" / "conformance" / "procedural-maps-v1.json"
payload = {"schemaVersion": "fleetrl-procedural-map-conformance-v1", "generator": "fleetrl-archipelago-v3", "seeds": [{"seed": seed, "map": generate_map(seed)} for seed in (1, 7, 99)]}
OUTPUT.write_text(json.dumps(payload, indent=2) + "\n", encoding="utf-8")
print(f"wrote {OUTPUT} ({OUTPUT.stat().st_size} bytes, {len(payload['seeds'])} seeds)")
