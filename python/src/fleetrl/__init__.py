"""FleetRL native headless simulation and training package."""

from .core import create_world, step_world
from .adapters import decode_discrete_v1, discrete_action_mask_v1, encode_ship_v1
from .observation import build_observation
from .resources import load_config, load_map
from .procedural_map import generate_map

__all__ = ["create_world", "step_world", "build_observation", "encode_ship_v1", "decode_discrete_v1", "discrete_action_mask_v1", "load_config", "load_map", "generate_map"]
__version__ = "0.1.0"
ENGINE_VERSION = "fleetrl-engine-py-v5"
RULES_VERSION = "fleetrl-rules-v5"
API_VERSION = "fleetrl-agent-v1"
