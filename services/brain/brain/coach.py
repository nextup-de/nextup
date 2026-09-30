"""One coach turn in the idea studio: the grilling method, one question at a time.

The app computes the scores and says which gap is weakest; the coach decides which open point
comes first (problem before solution), confronts the idea with earlier items about the same
problem, and offers its own best-guess answer. It never states or changes a score.
"""

import re
import time

from brain.llm import LLMClient
from brain.schemas import CoachIn, CoachOut, CoachTurn, Match

# Stored with every coach turn the app keeps (IdeaTurn.promptVersion). Bump on prompt changes.
PROMPT_VERSION = "brain-coach-v1"
MAX_HISTORY = 12  # the latest turns only; the idea itself carries everything the author said

# "72/100", "72 points", "score of 72": the numbers are the app's, never the model's.
SCORE = re.compile(r"\b\d{1,3}\s*(/\s*100|points?\b)|\bscores?\s+(of\s+)?\d", re.I)

# "You've raised this issue before": earlier items are almost always someone else's, and small
# models keep writing it anyway - so it is reworded here rather than retried.
YOU_RAISED = re.compile(r"\b([Yy])ou(?:'ve| have)?(?: already)? raised (?:this|that|it)( issue| idea| problem)?")


def not_you(text: str) -> str:
    return YOU_RAISED.sub(lambda m: ("T" if m.group(1) == "Y" else "t") + "his" + (m.group(2) or "") + " was raised", text)


def _known(body: CoachIn) -> str:
    return "\n".join(f"- {k.id}: {k.title}" + (f" [{k.status}]" if k.status else "") for k in body.known) or "(none)"


def _history(body: CoachIn) -> str:
    turns = body.history[-MAX_HISTORY:]
    return "\n".join(("Employee: " if t.role == "user" else "Coach: ") + t.text.strip() for t in turns) or "(first message)"


def earlier_match(llm: LLMClient, body: CoachIn) -> str:
    """The earlier item about the same problem, found with the routing check's method, or ''."""
    known_ids = [k.id for k in body.known]
    if not known_ids:
        return ""
    schema = Match.model_json_schema()
    schema["properties"]["closest_id"]["enum"] = known_ids + [""]
    m = llm.structured("match", Match, {
        "company": body.company,
        "idea": body.idea.title + ("\n" + body.idea.body if body.idea.body else ""),
        "known": _known(body),
    }, schema_override=schema)
    return m.closest_id if m.same_problem and m.closest_id in known_ids else ""


def _facts(body: CoachIn, match: str) -> str:
    k = next((k for k in body.known if k.id == match), None)
    if not k:
        return "(none found)"
    # No ID in the sentence: the model repeats what it is shown, and IDs are never shown to people.
    # earlier_id is set from the match in coach() instead.
    return (f"Someone else already raised the same problem: \"{k.title}\" ({k.status or 'open'}). "
            "Raise it now, as the method says. It was not this employee - say it was raised before, never \"you raised\".")


def coach(llm: LLMClient, body: CoachIn) -> CoachOut:
    started = time.perf_counter()
    known_ids = [k.id for k in body.known]
    # History first: on the idea's first message, look for an earlier item about the same problem.
    # Later turns see the coach's own earlier question about it in the conversation.
    first = sum(t.role == "user" for t in body.history) <= 1
    match = earlier_match(llm, body) if first else ""
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
        "facts": _facts(body, match),
    }, schema_override=schema, check=check)
    if match:
        t.earlier_id = match  # the check found it; the fact named it by title only

    ready = t.open_point == "none"
    return CoachOut(
        open_point=t.open_point, earlier_id=t.earlier_id or None, note=not_you(t.note.strip()),
        question="" if ready else not_you(t.question), why="" if ready else not_you(t.why.strip()),
        recommended="" if ready else t.recommended.strip(),
        model=llm.settings.llm_model, version=PROMPT_VERSION,
        ms=round((time.perf_counter() - started) * 1000),
    )
