"""Make a Pydantic JSON schema acceptable to a provider's strict structured-output mode.

Bedrock and Azure OpenAI refuse some keywords in a strict schema and require every object to be
closed with all its properties required. Pydantic still validates the removed limits on the answer.
"""

from typing import Any

# Keywords a strict schema may not contain. `enum` and `description` stay.
UNSUPPORTED = frozenset({
    "minimum", "maximum", "exclusiveMinimum", "exclusiveMaximum", "multipleOf",
    "minLength", "maxLength", "minItems", "maxItems", "pattern", "default", "title",
})
# Keywords whose value maps a user-chosen name to a schema; the names are not keywords.
NAMED = frozenset({"properties", "$defs", "definitions", "patternProperties"})


def _walk(node: Any) -> Any:
    if isinstance(node, list):
        return [_walk(x) for x in node]
    if not isinstance(node, dict):
        return node
    out: dict[str, Any] = {}
    for key, value in node.items():
        if key in UNSUPPORTED:
            continue
        if key in NAMED and isinstance(value, dict):
            out[key] = {name: _walk(sub) for name, sub in value.items()}
        else:
            out[key] = _walk(value)
    if out.get("type") == "object" or isinstance(out.get("properties"), dict):
        props = out.setdefault("properties", {})
        out["additionalProperties"] = False
        out["required"] = list(props)
    return out


def strict_schema(schema: dict) -> dict:
    """A copy of `schema` with every object closed and fully required, unsupported keywords dropped."""
    return _walk(schema)
