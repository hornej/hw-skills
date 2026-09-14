"""Read parsed source parameters; binary writer mechanics live in consolidate.py."""
from collections import defaultdict
from typing import Any


def parameter_map(symbol: Any) -> dict[str, list[str]]:
    result: dict[str, list[str]] = defaultdict(list)
    for parameter in symbol.parameters:
        name = str(getattr(parameter, "name", "") or "").strip()
        if name:
            result[name].append(str(getattr(parameter, "text", "") or ""))
    return dict(result)
