"""One coach turn in the idea studio: it answers what the employee asked, says what it really thinks
and asks the one question that matters most next.

The app sends the reading of the idea (brain/read.py), so the coach works from the same judgement
the page shows: the question comes from what the reading still finds open. The company's goals and
routing map come along, so it can answer questions about them. It never states a score.
"""

import re
import time

from brain.llm import LLMClient
from brain.schemas import CoachIn, CoachOut, CoachTurn

# Stored with every coach turn the app keeps (IdeaTurn.promptVersion). Bump on prompt changes.
PROMPT_VERSION = "brain-coach-v7"
MAX_HISTORY = 12  # the latest turns only; the idea itself carries everything the author said

# "72/100", "72 points", "score of 72": the page shows the numbers, the coach does not repeat them.
SCORE = re.compile(r"\b\d{1,3}\s*(/\s*100|points?\b)|\bscores?\s+(of\s+)?\d", re.I)

# "You've raised this issue before": earlier items are almost always someone else's, and small
# models keep writing it anyway - so it is reworded here rather than retried.
YOU_RAISED = re.compile(r"\b([Yy])ou(?:'ve| have)?(?: already)? raised (?:this|that|it)( issue| idea| problem)?")

# "You said your idea is...": repeating the message back is not a reaction to it.
PARROT = re.compile(r"^\s*(?:so\s+)?you(?:'ve| have)?\s+(?:just\s+)?(?:said|say|want|asked|ask|mentioned|wrote|stated|explained|told|described)\b", re.I)

QUESTION = re.compile(r"[^.?!\n]*\?")
STOP = {"the", "a", "an", "is", "are", "do", "does", "this", "that", "it", "you", "your", "of", "to", "in", "on", "for",
        "how", "what", "why", "which", "who", "when", "and", "or", "with", "there", "be", "can", "would"}


def not_you(text: str) -> str:
    return YOU_RAISED.sub(lambda m: ("T" if m.group(1) == "Y" else "t") + "his" + (m.group(2) or "") + " was raised", text)


def asked_before(body: CoachIn) -> list[str]:
    """The questions the coach already asked in this conversation, from its own turns."""
    return [q.strip() for t in body.history if t.role == "assistant" for q in QUESTION.findall(t.text) if len(q.strip()) > 8]


def _words(s: str) -> set[str]:
    return set(re.findall(r"[a-z0-9]+", s.lower())) - STOP


def near_copy(question: str, earlier: list[str]) -> str:
    """The earlier question this one mostly repeats (shared words), or ''."""
    w = _words(question)
    return next((e for e in earlier if w and len(w & _words(e)) / len(w | _words(e)) >= 0.6), "")


def _lines(items: list[str]) -> str:
    return "\n".join(items) or "(none)"


def _history(body: CoachIn) -> str:
    turns = body.history[-MAX_HISTORY:]
    return "\n".join(("Employee: " if t.role == "user" else "Coach: ") + t.text.strip() for t in turns) or "(first message)"


def _reading(body: CoachIn) -> str:
    r = body.reading
    return "\n".join([r.summary, *(f"- {d.key}: {d.note}" for d in r.dials),
                      "Still open:", *(f"- {q}" for q in r.open or ["(nothing)"])])


def _facts(body: CoachIn) -> str:
    k = next((k for k in body.known if k.id == body.reading.same_as), None)
    if not k:
        return "(none found)"
    # No ID in the sentence: the model repeats what it is shown, and IDs are never shown to people.
    return f"Someone else already raised the same problem: \"{k.title}\" ({k.status or 'open'}). Raise it now."


def coach(llm: LLMClient, body: CoachIn) -> CoachOut:
    started = time.perf_counter()
    known_ids = [k.id for k in body.known]
    ids = re.compile(r"\b(" + "|".join(map(re.escape, known_ids)) + r")\b") if known_ids else None
    asked = asked_before(body)
    point = body.reading.open[0] if body.reading.open else ""
    pushed_back = {"parrot": False}

    def check(t: CoachTurn) -> None:
        t.question = t.question.strip()
        if point:
            if not t.question.endswith("?") or t.question.count("?") != 1:
                raise ValueError("question must be exactly one question, ending with a question mark")
            if same := near_copy(t.question, asked):
                raise ValueError(f"you already asked \"{same}\" - ask it differently or offer concrete options")
        else:
            t.question = ""
        if any(SCORE.search(s) for s in (t.answer, t.note, t.question, t.why)):
            raise ValueError("do not state a score or points - the page shows them")
        if ids and ids.search(" ".join((t.answer, t.note, t.question, t.why, t.recommended))):
            raise ValueError("never show item IDs - name an earlier item by its title")
        # Pushed back once only: a dull note is no reason to lose the whole answer.
        if PARROT.search(t.note) and not pushed_back["parrot"]:
            pushed_back["parrot"] = True
            raise ValueError("do not repeat what they said back to them - say what it adds or leaves out")

    # One retry at most: on a CPU server every try costs seconds the app may not wait for.
    t = llm.structured("coach", CoachTurn, {
        "company": body.company,
        "point": point or "nothing is open - tell them it is ready for the person who decides, and that more detail only sharpens it",
        "idea": body.idea.title + ("\n" + body.idea.body if body.idea.body else ""),
        "goals": _lines([f"- {g.name}" + (f" (measured on: {g.kpi})" if g.kpi else "") for g in body.goals]),
        "routes": _lines([f"- {r.type} -> {r.owner}" for r in body.routes]),
        "reading": _reading(body),
        "known": _lines([f"- {k.id}: {k.title}" + (f" [{k.status}]" if k.status else "") for k in body.known]),
        "facts": _facts(body),
        "history": _history(body),
        "asked": _lines([f"- {q}" for q in asked]),
    }, check=check, retries=1)

    return CoachOut(
        open_point="open" if point else "none",
        earlier_id=body.reading.same_as if body.reading.same_as in known_ids else None,
        answer=not_you(t.answer.strip()), note=not_you(t.note.strip()), question=not_you(t.question),
        why=not_you(t.why.strip()) if t.question else "", recommended=t.recommended.strip() if t.question else "",
        model=llm.model_used, tokens_in=llm.tokens_in, tokens_out=llm.tokens_out, version=PROMPT_VERSION,
        ms=round((time.perf_counter() - started) * 1000),
    )
