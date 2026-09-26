import json
from importlib.resources import files

from fleetrl.procedural_map import generate_map
from fleetrl.map_validation import validate_map


def test_seeded_procedural_map_is_deterministic_and_symmetric() -> None:
    for seed in (1, 7, 99):
        first, second = generate_map(seed), generate_map(seed)
        assert first == second
        assert validate_map(first) == []
        north_islands = [item for item in first["islands"] if item["id"].endswith("-north")]
        assert north_islands
        for north_island in north_islands:
            south_id = north_island["id"].removesuffix("-north") + "-south"
            south = next(item for item in first["islands"] if item["id"] == south_id)["polygon"]
            assert south == [[round(1600 - x, 6), round(900 - y, 6)] for x, y in reversed(north_island["polygon"])]


def test_seed_controls_archipelago_count_and_coastline_shape() -> None:
    maps = [generate_map(seed) for seed in (1, 2, 3, 7)]
    assert len({len(item["islands"]) for item in maps}) > 1
    vertex_counts = {
        len(island["polygon"])
        for item in maps
        for island in item["islands"]
        if island["id"].startswith("archipelago-")
    }
    assert len(vertex_counts) > 1


def test_matches_shared_procedural_map_conformance_fixture() -> None:
    fixture = json.loads(files("fleetrl").joinpath("data/conformance/procedural-maps-v1.json").read_text(encoding="utf-8"))
    for item in fixture["seeds"]:
        assert generate_map(item["seed"]) == item["map"]
