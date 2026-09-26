from __future__ import annotations

import json
from importlib.resources import files
from typing import Any


def _read_json(relative: str) -> Any:
    resource = files("fleetrl").joinpath("data", *relative.split("/"))
    return json.loads(resource.read_text(encoding="utf-8"))


def load_config() -> dict[str, Any]:
    return _read_json("default-config.json")


def load_map(map_id: str = "twin-harbors-v1") -> dict[str, Any]:
    if map_id != "twin-harbors-v1":
        raise ValueError(f"Unknown packaged map: {map_id}")
    return _read_json("maps/twin-harbors.map.json")


def load_conformance(name: str) -> Any:
    return _read_json(f"conformance/{name}")
