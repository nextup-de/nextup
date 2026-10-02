"""One coach turn in the idea studio: the grilling method, one question at a time.

Two steps, so it cannot ask the same thing twice:
  1. notes     a short model call writes, per point, what the employee has said so far (sheet.md)
  2. the code  picks the first point the notes leave empty, in NextUp's order
  3. question  the model phrases one question about that point, with its best-guess answer

On an idea's first message there is nothing to note yet - the notes are the idea itself - and the
"raised before?" check runs instead, so a repeat of an earlier case is raised first. The coach
never states or changes a score; the app computes those.
"""

import re
import time

from brain.llm import LLMClient
from brain.schemas import CoachIn, CoachOut, CoachTurn, Match, Sheet

# Stored with every coach turn the app keeps (IdeaTurn.promptVersion). Bump on prompt changes.
PROMPT_VERSION = "brain-coach-v6"
MAX_HISTORY = 12  # the latest turns only; the idea itself carries everything the author said

# "72/100", "72 points", "score of 72": the numbers are the app's, never the model's.
SCORE = re.compile(r"\b\d{1,3}\s*(/\s*100|points?\b)|\bscores?\s+(of\s+)?\d", re.I)

# "You've raised this issue before": earlier items are almost always someone else's, and small
# models keep writing it anyway - so it is reworded here rather than retried.
YOU_RAISED = re.compile(r"\b([Yy])ou(?:'ve| have)?(?: already)? raised (?:this|that|it)( issue| idea| problem)?")


def not_you(text: str) -> str:
    return YOU_RAISED.sub(lambda m: ("T" if m.group(1) == "Y" else "t") + "his" + (m.group(2) or "") + " was raised", text)


# NextUp's order: what goes wrong, where and how often, what it costs, the first step - the
# questions the person who decides asks first, and what the app's four scores need - then the rest.
ORDER = ["problem", "context", "impact", "solution", "evidence", "risks", "success_measure"]
POINTS = {
    "problem": "problem - what exactly goes wrong",
    "context": "context - where it happens, since when, how often",
    "impact": "impact - what it costs: time, money, quality, safety, people affected",
    "solution": "solution - what they propose, or the smallest first step",
    "evidence": "evidence - numbers, observations or examples that show it is real",
    "risks": "risks - what could go wrong, who might object",
    "success_measure": "success measure - how we would know it worked",
}
READY = ("That covers what the person who decides will ask: the problem, where it happens, what it "
         "costs and a first step. Publish it when you are ready - every answer from here only sharpens it.")
QUESTION = re.compile(r"[^.?!\n]*\?")
STOP = {"the", "a", "an", "is", "are", "do", "does", "this", "that", "it", "you", "your", "of", "to", "in", "on", "for",
        "how", "what", "why", "which", "who", "when", "and", "or", "with", "there", "be", "can", "would"}


def covered(sheet: Sheet) -> list[str]:
    """The points that are done: the employee said something about them (or they do not matter),
    or the coach already asked about them and got a reply. So no point is ever asked twice."""
    return [p for p in ORDER if getattr(sheet, p).strip() or p in sheet.asked]


# The four points the person who decides always needs; these can never be "n/a".
CORE = {"problem", "context", "impact", "solution"}
WORD = re.compile(r"[a-zäöüß0-9]{4,}|\d+")


# The brief's weakest score -> the point that feeds it, for when everything has been asked once
# and the idea is still below the line: then the coach sharpens that point instead.
GAP = {"Impact & reach": "impact", "Feasibility": "solution", "Novelty & clarity": "problem", "Strategic fit": "success_measure"}


def sharpen_point(brief: str) -> str:
    named = re.search(r'raise "([^"]+)"', brief) or re.search(r"^- ([^:]+):", brief, re.M)
    return GAP.get(named.group(1).strip(), "impact") if named else "impact"


def grounded(sheet: Sheet, said: str, questions: int) -> Sheet:
    """Keep only notes the employee actually said: a note must share a word (4+ letters, or a
    number) with their own messages, and the core points cannot be waved away as "n/a". Small
    models write confident notes about things nobody said - that made the coach call ideas
    ready after one exchange."""
    own = set(WORD.findall(said.lower()))
    # One point per question asked, no more: a padded list made the coach call ideas ready early.
    asked = list(dict.fromkeys(sheet.asked))[:questions]
    clean = {}
    for p in ORDER:
        v = getattr(sheet, p).strip()
        if v.lower() == "n/a":
            v = "" if p in CORE else v
        elif v and not (set(WORD.findall(v.lower())) & own):
            v = ""
        clean[p] = v
    return Sheet(asked=asked, **clean)


def take_notes(llm: LLMClient, body: CoachIn, first: bool) -> Sheet:
    """What the employee has said, per point. On the first message that is the idea itself."""
    if first:
        return Sheet(asked=[], problem=body.idea.title[:200], context="", impact="", solution="", evidence="", risks="", success_measure="")
    mine = "\n".join(("Employee: " if t.role == "user" else "Coach: ") + t.text.strip() for t in body.history[-MAX_HISTORY:])
    said = " ".join(t.text for t in body.history if t.role == "user")
    questions = sum(t.role == "assistant" for t in body.history)
    return grounded(llm.structured("sheet", Sheet, {"company": body.company, "history": mine}), said, questions)


def _notes(sheet: Sheet) -> str:
    return "\n".join(f"- {p}: {getattr(sheet, p)}" for p in ORDER if getattr(sheet, p).strip()) or "(nothing yet)"


def asked_before(body: CoachIn) -> list[str]:
    """The questions the coach already asked in this conversation, from its own turns."""
    return [q.strip() for t in body.history if t.role == "assistant" for q in QUESTION.findall(t.text) if len(q.strip()) > 8]


def _words(s: str) -> set[str]:
    return set(re.findall(r"[a-z0-9]+", s.lower())) - STOP


def near_copy(question: str, earlier: list[str]) -> str:
    """The earlier question this one mostly repeats (shared words), or ''."""
    w = _words(question)
    return next((e for e in earlier if w and len(w & _words(e)) / len(w | _words(e)) >= 0.6), "")


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
    first = sum(t.role == "user" for t in body.history) <= 1
    # History on the first message: an earlier item about the same problem is raised before anything
    # else. Later turns see the coach's own question about it in the conversation.
    match = earlier_match(llm, body) if first else ""
    sheet = take_notes(llm, body, first)
    done = covered(sheet)
    point = next((p for p in ORDER if p not in done), "none")
    # Everything asked once, but the app still calls - so the idea is below the publish line. "Ready"
    # would be wrong: go back to the point the weakest score needs and ask for something sharper.
    sharpen = point == "none" and "ready to publish" not in body.brief.lower()
    if sharpen:
        point = sharpen_point(body.brief)
    ids = re.compile(r"\b(" + "|".join(map(re.escape, known_ids)) + r")\b") if known_ids else None
    asked = asked_before(body)

    if point == "none" and not match:
        return CoachOut(covered=done, open_point="none", earlier_id=None, note=READY, question="", why="",
                        recommended="", model=llm.settings.llm_model, version=PROMPT_VERSION,
                        ms=round((time.perf_counter() - started) * 1000))

    def check(t: CoachTurn) -> None:
        t.question, t.earlier_id = t.question.strip(), t.earlier_id.strip()
        if t.earlier_id not in known_ids:
            t.earlier_id = ""  # an id it was not sent is no match, not worth a retry
        if not t.question.endswith("?") or t.question.count("?") != 1:
            raise ValueError("question must be exactly one question, ending with a question mark")
        if same := near_copy(t.question, asked):
            raise ValueError(f"you already asked \"{same}\" - ask something new about {POINTS.get(point, point)}")
        if any(SCORE.search(s) for s in (t.note, t.question, t.why)):
            raise ValueError("do not state a score or points - the numbers are not yours")
        if ids and ids.search(" ".join((t.note, t.question, t.why, t.recommended))):
            raise ValueError("never show item IDs - name an earlier item by its title")

    schema = CoachTurn.model_json_schema()
    schema["properties"]["earlier_id"]["enum"] = known_ids + [""]  # constrained decoding where supported
    # One retry at most: on a CPU server every try costs seconds the app may not wait for.
    t = llm.structured("coach", CoachTurn, {
        "company": body.company,
        "point": POINTS.get(point, "the earlier item") + (
            " (they already answered this, but the person who decides needs it sharper: ask for a number, an example "
            "or one concrete detail they have not given yet - in new words, not the earlier question)" if sharpen else ""),
        "idea": body.idea.title + ("\n" + body.idea.body if body.idea.body else ""),
        "brief": body.brief,
        "known": _known(body),
        "facts": _facts(body, match),
        "notes": _notes(sheet),
        "history": _history(body),
        "asked": "\n".join("- " + q for q in asked) or "(none yet)",
    }, schema_override=schema, check=check, retries=1)
    if match:
        t.earlier_id = match  # the check found it; the fact named it by title only

    return CoachOut(
        covered=done, open_point=point, earlier_id=t.earlier_id or None, note=not_you(t.note.strip()),
        question=not_you(t.question), why=not_you(t.why.strip()), recommended=t.recommended.strip(),
        model=llm.settings.llm_model, version=PROMPT_VERSION,
        ms=round((time.perf_counter() - started) * 1000),
    )
