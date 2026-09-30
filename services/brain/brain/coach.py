"""One coach turn in the idea studio: the grilling method, one question at a time.

The app computes the scores and says which gap is weakest; the coach decides which open point
comes first (problem before solution), confronts the idea with earlier items about the same
problem, and offers its own best-guess answer. It never states or changes a score.
"""

import re
import time

from brain.llm import LLMClient
from brain.schemas import CoachIn, CoachOut, CoachTurn

# Stored with every coach turn the app keeps (IdeaTurn.promptVersion). Bump on prompt changes.
PROMPT_VERSION = "brain-coach-v1"
MAX_HISTORY = 12  # the latest turns only; the idea itself carries everything the author said

# "72/100", "72 points", "score of 72": the numbers are the app's, never the model's.
SCORE = re.compile(r"\b\d{1,3}\s*(/\s*100|points?\b)|\bscores?\s+(of\s+)?\d", re.I)


def _known(body: CoachIn) -> str:
    return "\n".join(f"- {k.id}: {k.title}" + (f" [{k.status}]" if k.status else "") for k in body.known) or "(none)"


def _history(body: CoachIn) -> str:
    turns = body.history[-MAX_HISTORY:]
    return "\n".join(("Employee: " if t.role == "user" else "Coach: ") + t.text.strip() for t in turns) or "(first message)"


def coach(llm: LLMClient, body: CoachIn) -> CoachOut:
    started = time.perf_counter()
    known_ids = [k.id for k in body.known]
    ids = re.compile(r"\b(" + "|".join(map(re.escape, known_ids)) + r")\b") if known_ids else None

    def check(t: CoachTurn) -> None:
        t.question, t.earlier_id = t.question.strip(), t.earlier_id.strip()
        if t.earlier_id not in known_ids:
            t.earlier_id = ""  # an id it was not sent is no match, not worth a retry
        if t.open_point != "none" and (not t.question.endswith("?") or t.question.count("?") != 1):
            raise ValueError("question must be exactly one question, ending with a question mark")
        if not t.recommended.strip() and t.open_point != "none":
            raise ValueError("recommended must be a concrete answer")
        if any(SCORE.search(s) for s in (t.note, t.question, t.why)):
            raise ValueError("do not state a score or points - the numbers are not yours")
        shown = " ".join((t.note, t.question, t.why, t.recommended))
        if ids and ids.search(shown):
            raise ValueError("never show item IDs - name an earlier item by its title")

    schema = CoachTurn.model_json_schema()
    schema["properties"]["earlier_id"]["enum"] = known_ids + [""]  # constrained decoding where supported
    t = llm.structured("coach", CoachTurn, {
        "company": body.company,
        "idea": body.idea.title + ("\n" + body.idea.body if body.idea.body else ""),
        "brief": body.brief,
        "known": _known(body),
        "history": _history(body),
    }, schema_override=schema, check=check)

    ready = t.open_point == "none"
    return CoachOut(
        open_point=t.open_point, earlier_id=t.earlier_id or None, note=t.note.strip(),
        question="" if ready else t.question, why="" if ready else t.why.strip(),
        recommended="" if ready else t.recommended.strip(),
        model=llm.settings.llm_model, version=PROMPT_VERSION,
        ms=round((time.perf_counter() - started) * 1000),
    )
