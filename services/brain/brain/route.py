"""One idea in, one proposal out: the routing row that owns it and whether it was raised before.

A single model call on purpose - on a CPU-only server every call costs seconds. The company's
rows come with the request; a company with hundreds of earlier items will need a shortlist
(embeddings) in front of this, and that is the one place to add it.
"""

import time

from brain.llm import LLMClient
from brain.schemas import Judgement, RouteIn, RouteOut

# Stored with every proposal the app keeps (case.raised payload.proposal.version).
# Bump it whenever the prompt or the rules below change.
PROMPT_VERSION = "brain-route-v1"
NONE = "none"


def _rows(body: RouteIn) -> str:
    return "\n".join(f"- {r.id}: {r.type} (owner: {r.owner or '-'})" for r in body.routes)


def _known(body: RouteIn) -> str:
    return "\n".join(f"- {k.id}: {k.title}" + (f" [{k.status}]" if k.status else "") for k in body.known) or "(none)"


def route(llm: LLMClient, body: RouteIn) -> RouteOut:
    started = time.perf_counter()
    route_ids = [r.id for r in body.routes]
    known_ids = [k.id for k in body.known]

    def check(j: Judgement) -> None:
        j.route_id, j.closest_id = j.route_id.strip(), j.closest_id.strip()
        if j.route_id != NONE and j.route_id not in route_ids:
            raise ValueError(f"route_id must be one of {route_ids + [NONE]}")
        if j.closest_id not in known_ids:
            j.closest_id = ""  # no usable match is "new", not worth a retry

    schema = Judgement.model_json_schema()
    schema["properties"]["route_id"]["enum"] = route_ids + [NONE]   # constrained decoding where supported
    schema["properties"]["closest_id"]["enum"] = known_ids + [""]
    j = llm.structured("route", Judgement, {
        "company": body.company,
        "idea": body.idea.title + ("\n" + body.idea.body if body.idea.body else ""),
        "routes": _rows(body),
        "known": _known(body),
    }, schema_override=schema, check=check)

    routed = j.route_id != NONE
    match = j.closest_id or None
    same = match if j.same_problem else None
    return RouteOut(
        route_id=j.route_id if routed else None,
        confidence=round(j.confidence * 100) if routed else 0,
        reason=j.reason.strip(),
        same_as=same,
        related=match if match and not same and j.same_topic else None,
        model=llm.settings.llm_model,
        version=PROMPT_VERSION,
        ms=round((time.perf_counter() - started) * 1000),
    )
