"""The shared reserve for admission and live volume-space checks."""

import os

from runtime_protocol.errors import ValidationError


def free_disk_floor_bytes() -> int:
    try:
        floor = int(os.environ.get("ASTRID_RUNTIME_FREE_DISK_FLOOR_BYTES", str(1024**3)))
    except ValueError as exc:
        raise ValidationError("ASTRID_RUNTIME_FREE_DISK_FLOOR_BYTES must be an integer") from exc
    if floor < 0:
        raise ValidationError("ASTRID_RUNTIME_FREE_DISK_FLOOR_BYTES must be nonnegative")
    return floor
