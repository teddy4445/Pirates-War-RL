from __future__ import annotations

import hashlib
import json
import shutil
from pathlib import Path

from PIL import Image, ImageDraw, ImageOps

ROOT = Path(__file__).resolve().parents[1]
OUT = ROOT / "public" / "assets"
SOURCE_SHIPS = ROOT / "ChatGPT Image Sep 25, 2026, 08_35_53 PM (1).png"
SOURCE_ICONS = ROOT / "ChatGPT Image Sep 25, 2026, 08_38_26 PM.png"
SOURCE_EFFECTS = ROOT / "ChatGPT Image Sep 25, 2026, 08_38_21 PM.png"
SOURCE_WATER = ROOT / "ChatGPT Image Sep 25, 2026, 09_08_47 PM (1).png"
SOURCE_LAND = ROOT / "ChatGPT Image Sep 25, 2026, 09_08_47 PM (2).png"
SOURCE_OCEAN = ROOT / "ChatGPT Image Sep 25, 2026, 08_38_30 PM.png"
SOURCE_SHORE = ROOT / "ChatGPT Image Sep 25, 2026, 09_08_47 PM (3).png"
SOURCE_FOG = ROOT / "ChatGPT Image Sep 25, 2026, 09_08_48 PM (4).png"
HERO = OUT / "backgrounds" / "pirates-war-hero.png"


def digest(path: Path) -> str:
    return hashlib.sha256(path.read_bytes()).hexdigest()


def save(image: Image.Image, relative: str) -> dict:
    target = OUT / relative; target.parent.mkdir(parents=True, exist_ok=True)
    image.save(target, optimize=True)
    return {"path": f"assets/{relative.replace('\\', '/')}", "width": image.width, "height": image.height, "sha256": digest(target)}


def mirror_tile(source: Image.Image, crop: tuple[int, int, int, int]) -> Image.Image:
    base = source.crop(crop).resize((256, 256), Image.Resampling.LANCZOS)
    tile = Image.new("RGB", (512, 512))
    tile.paste(base, (0, 0)); tile.paste(ImageOps.mirror(base), (256, 0))
    bottom = ImageOps.flip(base); tile.paste(bottom, (0, 256)); tile.paste(ImageOps.mirror(bottom), (256, 256))
    return tile


def game_button_sprite() -> Image.Image:
    sprite = Image.new("RGBA", (640, 180), (0, 0, 0, 0))
    states = [((247, 200, 85), (202, 113, 36)), ((255, 224, 119), (224, 137, 45)), ((218, 154, 55), (160, 78, 24))]
    for frame, (top, bottom) in enumerate(states):
        y0 = frame * 60
        layer = Image.new("RGBA", (640, 60), (0, 0, 0, 0)); draw = ImageDraw.Draw(layer)
        for y in range(5, 54):
            t = (y - 5) / 49
            color = tuple(round(top[index] * (1 - t) + bottom[index] * t) for index in range(3)) + (255,)
            draw.line((8, y, 631, y), fill=color, width=1)
        draw.rounded_rectangle((5, 3, 634, 55), radius=12, outline=(255, 234, 158, 255), width=3)
        draw.rounded_rectangle((9, 7, 630, 51), radius=9, outline=(104, 53, 18, 160), width=2)
        draw.line((18, 12, 622, 12), fill=(255, 255, 255, 100), width=2)
        sprite.alpha_composite(layer, (0, y0))
    return sprite


def main() -> None:
    manifests = OUT / "manifests"; manifests.mkdir(parents=True, exist_ok=True)
    ship_source = Image.open(SOURCE_SHIPS).convert("RGBA")
    ship_atlas = Image.new("RGBA", (1024, 512))
    source_rows = [4, 5, 0, 1]  # Blue, Blue carrying red, Green, Green carrying blue.
    source_columns = [2, 1, 0, 7, 6, 5, 4, 3]  # E, SE, S, SW, W, NW, N, NE after visual calibration.
    for output_row, source_row in enumerate(source_rows):
        for heading, source_column in enumerate(source_columns):
            frame = ship_source.crop((source_column * 181, source_row * 181, (source_column + 1) * 181, (source_row + 1) * 181))
            frame = frame.resize((128, 128), Image.Resampling.LANCZOS)
            ship_atlas.paste(frame, (heading * 128, output_row * 128), frame)
    ships = save(ship_atlas, "ships/ship-atlas.png")
    ships.update({"id": "directional-ships-v1", "frameSize": [128, 128], "headingOrder": ["E", "SE", "S", "SW", "W", "NW", "N", "NE"], "rowOrder": ["blue", "blue-carrying-red", "green", "green-carrying-blue"], "pivot": [0.5, 0.5], "muzzle": [0.83, 0.5], "wake": [0.18, 0.5], "source": SOURCE_SHIPS.name, "sourceSha256": digest(SOURCE_SHIPS), "tool": "Pillow 12.3.0", "review": "calibrated from depicted bow direction; common cell-centered pivot"})

    water = save(mirror_tile(Image.open(SOURCE_WATER).convert("RGB"), (377, 126, 716, 508)), "terrain/water-mirror-tile.jpg")
    water.update({"id": "water-tile-v1", "source": SOURCE_WATER.name, "sourceSha256": digest(SOURCE_WATER), "crop": [377, 126, 716, 508], "seamMethod": "2x2 horizontal/vertical mirror", "collisionRole": "none"})
    grass = save(mirror_tile(Image.open(SOURCE_LAND).convert("RGB"), (589, 4, 862, 261)), "terrain/grass-mirror-tile.jpg")
    grass.update({"id": "grass-tile-v1", "source": SOURCE_LAND.name, "sourceSha256": digest(SOURCE_LAND), "crop": [589, 4, 862, 261], "seamMethod": "2x2 horizontal/vertical mirror", "collisionRole": "masked to authoritative polygons"})
    sand = save(mirror_tile(Image.open(SOURCE_LAND).convert("RGB"), (11, 4, 283, 261)), "terrain/sand-mirror-tile.jpg")
    sand.update({"id": "sand-tile-v1", "source": SOURCE_LAND.name, "sourceSha256": digest(SOURCE_LAND), "crop": [11, 4, 283, 261], "seamMethod": "2x2 horizontal/vertical mirror", "collisionRole": "presentation shoreline only"})

    icon_source = Image.open(SOURCE_ICONS).convert("RGBA")
    icon_atlas = Image.new("RGBA", (640, 128)); picks = [(0, 2), (7, 1), (7, 0), (4, 0), (5, 0)]
    for index, (column, row) in enumerate(picks):
        crop = icon_source.crop((column * 181, row * 217, (column + 1) * 181, min(1086, (row + 1) * 217))).resize((128, 128), Image.Resampling.LANCZOS)
        icon_atlas.paste(crop, (index * 128, 0), crop)
    icons = save(icon_atlas, "icons/ui-icons.png")
    icons.update({"id": "ui-icons-v1", "frames": ["play", "pause", "visibility", "red-flag", "blue-flag"], "frameSize": [128, 128], "source": SOURCE_ICONS.name, "sourceSha256": digest(SOURCE_ICONS), "review": "measured five-cell extraction; decorative DOM icons only"})

    effect_source = Image.open(SOURCE_EFFECTS).convert("RGBA")
    effect_atlas = Image.new("RGBA", (512, 128)); effect_picks = [(0, 0), (0, 1), (0, 4), (0, 6)]
    for index, (column, row) in enumerate(effect_picks):
        crop = effect_source.crop((column * 181, row * 136, (column + 1) * 181, min(1086, (row + 1) * 136))).resize((128, 128), Image.Resampling.LANCZOS)
        effect_atlas.paste(crop, (index * 128, 0), crop)
    effects = save(effect_atlas, "effects/combat-effects.png")
    effects.update({"id": "combat-effects-v1", "frames": ["cannonball", "impact", "splash", "sink"], "frameSize": [128, 128], "source": SOURCE_EFFECTS.name, "sourceSha256": digest(SOURCE_EFFECTS), "collisionRole": "none", "review": "decorative crops; procedural event markers remain accessibility fallback"})

    ocean_source = Image.open(SOURCE_OCEAN).convert("RGBA")
    ocean_fx = save(ocean_source.crop((0, 410, 660, 555)).resize((640, 140), Image.Resampling.LANCZOS), "overlays/ocean-ripples.png")
    ocean_fx.update({"id": "ocean-ripples-v1", "source": SOURCE_OCEAN.name, "sourceSha256": digest(SOURCE_OCEAN), "crop": [0, 410, 660, 555], "collisionRole": "none", "review": "measured transparent ripple and splash strip; decorative only"})
    shore_source = Image.open(SOURCE_SHORE).convert("RGBA")
    shore_fx = save(shore_source.crop((0, 0, 975, 225)).resize((768, 176), Image.Resampling.LANCZOS), "overlays/shore-foam.png")
    shore_fx.update({"id": "shore-foam-v1", "source": SOURCE_SHORE.name, "sourceSha256": digest(SOURCE_SHORE), "crop": [0, 0, 975, 225], "collisionRole": "none", "review": "measured transparent foam strip; clipped to authoritative island paths"})
    fog_source = Image.open(SOURCE_FOG).convert("RGBA")
    fog_fx = save(fog_source.crop((760, 285, 1448, 590)).resize((640, 284), Image.Resampling.LANCZOS), "overlays/fog-mist.png")
    fog_fx.update({"id": "fog-mist-v1", "source": SOURCE_FOG.name, "sourceSha256": digest(SOURCE_FOG), "crop": [760, 285, 1448, 590], "collisionRole": "none", "review": "measured cloud and mist forms; presentation layer after visibility filtering"})
    buttons = save(game_button_sprite(), "ui/button-states.png")
    buttons.update({"id": "gold-button-states-v1", "frames": ["released", "hover", "pressed"], "frameSize": [640, 60], "source": "tools/build_assets.py", "provenance": "project-authored procedural Pillow raster", "review": "three-state stretchable game button background"})
    hero = {"id": "pirates-war-hero-v1", "category": "background", "path": "assets/backgrounds/pirates-war-hero.png", "width": 1674, "height": 942, "sha256": digest(HERO), "source": "OpenAI built-in image generation", "provenance": "original project-specific generated raster; prompt recorded in release notes", "review": "inspected at generated resolution; text-free responsive background"}

    audio_source = ROOT / "FleetRL_Sound_Pack"
    audio_target = OUT / "audio"; audio_target.mkdir(parents=True, exist_ok=True)
    for source in (audio_source / "audio" / "ogg").glob("*.ogg"):
        shutil.copy2(source, audio_target / source.name)
    shutil.copy2(audio_source / "audio-manifest.json", manifests / "audio.json")

    payloads = {
        "ships.json": {"schemaVersion": "fleetrl-ship-assets-v1", "assets": [ships]},
        "terrain.json": {"schemaVersion": "fleetrl-terrain-assets-v1", "assets": [water, grass, sand]},
        "icons.json": {"schemaVersion": "fleetrl-icon-assets-v1", "assets": [icons, buttons]},
        "effects.json": {"schemaVersion": "fleetrl-effect-assets-v1", "assets": [effects]},
        "overlays.json": {"schemaVersion": "fleetrl-overlay-assets-v1", "assets": [ocean_fx, shore_fx, fog_fx]},
        "backgrounds.json": {"schemaVersion": "fleetrl-background-assets-v1", "assets": [hero]},
    }
    for name, payload in payloads.items():
        (manifests / name).write_text(json.dumps(payload, indent=2), encoding="utf-8")
    inventory_path = ROOT / "ASSET_MANIFEST.json"
    inventory = json.loads(inventory_path.read_text(encoding="utf-8"))
    inventory["status"] = "production-derivatives-built"
    inventory["derivedAt"] = "2026-09-26"
    inventory["assets"] = [ships, effects, icons, buttons, water, grass, sand, ocean_fx, shore_fx, fog_fx, hero, {
        "id": "fleetrl-audio-2.0.0", "category": "audio", "path": "public/assets/audio/",
        "manifest": "public/assets/manifests/audio.json", "files": 49,
        "source": "FleetRL_Sound_Pack", "provenance": "project-authored procedural synthesis",
        "review": "file and managed-browser QA supplied; human speaker/headphone audition still required",
    }]
    inventory_path.write_text(json.dumps(inventory, indent=2), encoding="utf-8")
    print(json.dumps({"built": [ships["path"], water["path"], grass["path"], sand["path"], icons["path"], effects["path"], buttons["path"], ocean_fx["path"], shore_fx["path"], fog_fx["path"], hero["path"]], "audioFiles": len(list(audio_target.glob("*.ogg")))}, indent=2))


if __name__ == "__main__":
    main()
