import type { CSSProperties } from "react";

const asset = (path: string) => new URL(path, document.baseURI).href;
export const gameArtStyle = {
  "--hero-image": `url("${asset("assets/backgrounds/pirates-war-hero.png")}")`,
  "--strategy-image": `url("${asset("assets/backgrounds/strategy-fleets-v1.png")}")`,
  "--fog-chase-image": `url("${asset("assets/backgrounds/fog-chase-v1.png")}")`,
  "--water-image": `url("${asset("assets/terrain/water-mirror-tile.jpg")}")`,
  "--icons-image": `url("${asset("assets/icons/ui-icons.png")}")`,
  "--button-image": `url("${asset("assets/ui/button-states.png")}")`,
} as CSSProperties;
