"""The model's reading of an idea: five dials, the summary, advice, routing, repeats, what is still open.

The raise page shows this reading wherever the stack has a model. The app's keyword benchmark only
answers when there is no model or it failed. The overall score is the mean of the five dials, so the
model cannot state a different one. The idea's text is judged, never obeyed (prompts/read.md).
"""

import re
import time

from brain.coach import STOP, STOP_DE, id_pattern, language, slipped_into_english
from brain.llm import LLMClient
from brain.schemas import DIALS, IdeaRead, ReadDial, ReadIn, ReadOut

# Stored with every reading (IdeaTurn.reading). Bump on prompt changes.
PROMPT_VERSION = "brain-read-v4"
MAX_OPEN = 6
# The app rejects the whole reading for one question over 400 UTF-16 units (features/ideas/reading.ts).
# 200 characters is 400 units at worst, and far past "one short question".
MAX_QUESTION = 200
_WORD = re.compile(r"[a-zäöüß0-9]+")
_STOP = STOP | STOP_DE


def _key(question: str) -> set[str]:
    """The words that tell two questions apart: "how much does it cost/save" share only "much"."""
    words = set(_WORD.findall(question.lower()))
    return (words - _STOP) or words


def _lines(items: list[str]) -> str:
    return "\n".join(items) or "(none)"


def _previous(body: ReadIn) -> str:
    if not body.previous:
        return "(this is the first reading)"
    return "\n".join(f"- {d.key}: {d.score} - {d.note}" for d in body.previous)


def _open(found: list[str], skip: list[str]) -> list[str]:
    """Real questions only, each once, none the employee said they cannot answer yet."""
    known = [_key(q) for q in skip]
    out: list[str] = []
    for raw in found:
        q = raw.strip()
        k = _key(q)
        if not q.endswith("?") or not k or len(q) > MAX_QUESTION:
            continue
        if any(len(k & s) / len(k | s) >= 0.6 for s in known):
            continue
        out.append(q)
        known.append(k)
    return out[:MAX_OPEN]


def read_idea(llm: LLMClient, body: ReadIn) -> ReadOut:
    started = time.perf_counter()
    known_ids = [k.id for k in body.known]
    route_ids = [r.id for r in body.routes]
    shown = known_ids + route_ids
    ids = id_pattern(shown)
    pushed_back = {"open": False, "language": False}

    def check(r: IdeaRead) -> None:
        # Everything the page shows; `comparison` is the model's own reasoning and goes nowhere.
        texts = [r.summary, r.pattern, r.advice_why, r.route_reason, *r.open,
                 *(getattr(r, k).note for k in DIALS), *(getattr(r, k).basis for k in DIALS)]
        if ids and ids.search(" ".join(texts)):
            raise ValueError("never show item IDs or row IDs - name an earlier item by its title and a row by its owner")
        # A page in one language with one note in another. Pushed back once only, like the next one.
        if slipped_into_english(texts, body.locale) and not pushed_back["language"]:
            pushed_back["language"] = True
            raise ValueError("write every field in German, not English")
        # "More is needed" with nothing to ask leaves the coach no question. Pushed back once only:
        # it is no reason to lose the whole reading.
        if r.advice == "info" and not _open(r.open, body.skip) and not pushed_back["open"]:
            pushed_back["open"] = True
            raise ValueError('advice "info" needs at least one short question in open, ending in a question mark, not one from "They do not know yet"')

    schema = IdeaRead.model_json_schema()
    schema["properties"]["closest_id"]["enum"] = known_ids + [""]
    schema["properties"]["route_id"]["enum"] = route_ids + ["none"]
    r = llm.structured("read", IdeaRead, {
        **language(body.locale, "the idea is"),
        "company": body.company,
        "idea": body.idea.title + ("\n" + body.idea.body if body.idea.body else ""),
        "affected": str(body.affected),
        "attachments": str(body.attachments),
        "goals": _lines([f"- {g.name}" + (f" (measured on: {g.kpi})" if g.kpi else "") for g in body.goals]),
        "routes": _lines([f"- {x.id}: {x.type} -> {x.owner}" for x in body.routes]),
        "spend": f"a team may decide up to {body.spend_limit_eur} EUR alone" if body.spend_limit_eur is not None else "none set",
        "known": _lines([f"- {k.id}: {k.title}" + (f" [{k.status}]" if k.status else "") for k in body.known]),
        "skip": _lines([f"- {q}" for q in body.skip]),
        "previous": _previous(body),
    }, schema_override=schema, check=check)

    dials = [ReadDial(key=k, score=getattr(r, k).score, note=getattr(r, k).note.strip(), basis=getattr(r, k).basis.strip()) for k in DIALS]
    closest = r.closest_id if r.closest_id in known_ids else ""
    return ReadOut(
        dials=dials,
        overall=round(sum(d.score for d in dials) / len(dials)),
        summary=r.summary.strip(),
        advice=r.advice,
        advice_why=r.advice_why.strip(),
        pattern=r.pattern.strip(),
        route_id=r.route_id if r.route_id in route_ids else None,
        route_reason=r.route_reason.strip(),
        same_as=closest if closest and r.same_problem else None,
        related=closest if closest and not r.same_problem else None,
        open=_open(r.open, body.skip),
        model=llm.model_used,
        tokens_in=llm.tokens_in,
        tokens_out=llm.tokens_out,
        version=PROMPT_VERSION,
        ms=round((time.perf_counter() - started) * 1000),
    )
