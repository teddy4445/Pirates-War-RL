from __future__ import annotations

MASK32 = 0xFFFFFFFF
ZERO_REMAP = 0x6D2B79F5


class XorShift32:
    """Exact unsigned xorshift32 counterpart to the browser implementation."""

    def __init__(self, seed: int):
        normalized = int(seed) & MASK32
        self.state = normalized if normalized else ZERO_REMAP

    def next_uint32(self) -> int:
        value = self.state
        value ^= (value << 13) & MASK32
        value ^= value >> 17
        value ^= (value << 5) & MASK32
        self.state = value & MASK32
        return self.state

    def random(self) -> float:
        return self.next_uint32() / 4294967296.0


def derive_seed(root_seed: int, stream_name: str) -> int:
    value = (0x811C9DC5 ^ (int(root_seed) & MASK32)) & MASK32
    for byte in stream_name.encode("utf-8"):
        value ^= byte
        value = (value * 0x01000193) & MASK32
    value ^= value >> 16
    value = (value * 0x7FEB352D) & MASK32
    value ^= value >> 15
    value = (value * 0x846CA68B) & MASK32
    value ^= value >> 16
    value &= MASK32
    return value if value else ZERO_REMAP
