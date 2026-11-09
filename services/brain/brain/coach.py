"""One coach turn in the idea studio: it answers what the employee asked, says what it really thinks
and asks the one question that matters most next.

The app sends the reading of the idea (brain/read.py), so the coach works from the same judgement
the page shows: the question comes from what the reading still finds open. The company's goals and
routing map come along, so it can answer questions about them. It never states a score.
"""

import re
import time

from brain import guard
from brain.llm import LLMClient
from brain.schemas import CoachIn, CoachOut, CoachTurn

# Stored with every coach turn the app keeps (IdeaTurn.promptVersion). Bump on prompt changes.
PROMPT_VERSION = "brain-coach-v11"
MAX_HISTORY = 12  # the latest turns only; the idea itself carries everything the author said
WEAK = 50  # a dial at or below this is not ready: its scale in prompts/read.md only turns good above it

# "72/100", "72 points", "score of 72": the page shows the numbers, the coach does not repeat them.
SCORE = re.compile(r"\b\d{1,3}\s*(/\s*100|points?\b|punkte?n?\b)|\bscores?\s+(of\s+)?\d|\b(bewertung|punktzahl)\s+(von\s+)?\d", re.I)

# "You've raised this issue before": earlier items are almost always someone else's, and small
# models keep writing it anyway - so it is reworded here rather than retried.
YOU_RAISED = re.compile(r"\b([Yy])ou(?:'ve| have)?(?: already)? raised (?:this|that|it)( issue| idea| problem)?")
# The same in German, in both word orders; only the capitalised, formal "Sie".
SIE_RAISED = re.compile(r"\bSie haben (?:das|dies|es)(?: Problem| Thema)?(?: bereits| schon)? (gemeldet|eingebracht|vorgeschlagen|angesprochen)")
SIE_RAISED_FRONT = re.compile(r"\b(?:Das|Dies) haben Sie(?: bereits| schon)? (gemeldet|eingebracht|vorgeschlagen|angesprochen)")

# "You said your idea is...": repeating the message back is not a reaction to it.
PARROT = re.compile(
    r"^\s*(?:so\s+)?you(?:'ve| have)?\s+(?:just\s+)?(?:said|say|want|asked|ask|mentioned|wrote|stated|explained|told|described)\b"
    r"|^\s*(?:also\s+)?sie\s+(?:haben\s+)?(?:gerade\s+|eben\s+)?(?:sagen|sagten|gesagt|schreiben|geschrieben|möchten|wollen|fragen|gefragt|erwähnen|erwähnt|erklären|erklärt|beschreiben|beschrieben)\b",
    re.I)

QUESTION = re.compile(r"[^.?!\n]*\?")
STOP = {"the", "a", "an", "is", "are", "do", "does", "this", "that", "it", "you", "your", "of", "to", "in", "on", "for",
        "how", "what", "why", "which", "who", "when", "and", "or", "with", "there", "be", "can", "would"}
STOP_DE = {"wie", "viel", "viele", "was", "wer", "wann", "warum", "wo", "ist", "sind", "der", "die", "das", "den", "dem", "des",
           "ein", "eine", "es", "und", "oder", "für", "mit", "wird", "kann", "gibt", "sie", "ihre", "ihr", "ihnen", "zu", "von",
           "bei", "nach", "auf", "im", "hat", "haben", "nicht", "wenn", "dann"}

# What the prompts say in place of the language: the page shows the model's words as they are.
_FORMAL = 'Address the employee formally with "Sie", never "du".'
LANGUAGE = {
    "en": {"language_rule": "Always write in English, even when {writes} in German.", "address": 'Talk to the employee directly as "you".',
           "for_example": "For example:", "nothing_more": "Nothing more is needed.",
           "language_reminder": "Write every sentence in English."},
    "de": {"language_rule": f"Always write in German, even when {{writes}} in English. {_FORMAL}", "address": 'Talk to the employee directly, as "Sie".',
           "for_example": "Zum Beispiel:", "nothing_more": "Mehr ist nicht nötig.",
           "language_reminder": "Write every sentence in German, also when the idea or the earlier items are in English. Names of things may stay as they are."},
}


def language(locale: str, writes: str) -> dict[str, str]:
    words = LANGUAGE[locale]
    return {**words, "language_rule": words["language_rule"].format(writes=writes)}


GERMAN_WORDS = {"der", "die", "das", "und", "ist", "nicht", "ein", "eine", "für", "mit", "wird", "auf", "den", "von", "zu"}
ENGLISH_WORDS = {"the", "and", "is", "not", "a", "for", "with", "it", "to", "of", "on", "this", "that"}


def slipped_into_english(texts: list[str], locale: str) -> bool:
    """On a German page: does any one field read as English? Small models switch field by field, so
    the whole answer can look German while one note is not. A short field or a quoted name is no sign."""
    if locale != "de":
        return False
    for text in texts:
        words = re.findall(r"[a-zäöüß]+", text.lower())
        english = sum(w in ENGLISH_WORDS for w in words)
        if english >= 3 and english > sum(w in GERMAN_WORDS for w in words):
            return True
    return False


def id_pattern(ids: list[str]) -> re.Pattern[str] | None:
    """What a sentence must not show. A company may name its routing rows with plain words ("it",
    "budget"), and those are ordinary words in a sentence: only what looks like an ID counts."""
    real = [i for i in ids if re.search(r"[\d_-]", i)]
    return re.compile(r"\b(" + "|".join(map(re.escape, real)) + r")\b") if real else None


def not_you(text: str) -> str:
    text = YOU_RAISED.sub(lambda m: ("T" if m.group(1) == "Y" else "t") + "his" + (m.group(2) or "") + " was raised", text)
    return SIE_RAISED_FRONT.sub(r"Das wurde bereits \1", SIE_RAISED.sub(r"Das wurde bereits \1", text))


def asked_before(body: CoachIn) -> list[str]:
    """The questions the coach already asked in this conversation, from its own turns."""
    return [q.strip() for t in body.history if t.role == "assistant" for q in QUESTION.findall(t.text) if len(q.strip()) > 8]


def _words(s: str) -> set[str]:
    return set(re.findall(r"[a-zäöüß0-9]+", s.lower())) - STOP - STOP_DE


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


def _nothing_open(body: CoachIn) -> str:
    """No question left is not the same as ready: the employee may just not know the answers yet."""
    weak = [d for d in body.reading.dials if d.score <= WEAK]
    if not weak:
        return "nothing is open - tell them it is ready for the person who decides, and that more detail only sharpens it"
    d = min(weak, key=lambda x: x.score)
    return f"nothing is open that they can answer now, but it is not ready for the person who decides. Say so plainly and never call it ready. What it lacks most: {d.note}"


def _masked(body: CoachIn) -> tuple[CoachIn, list[str]]:
    """The request with every addressed colleague masked (brain/guard.py), and the names found."""
    names: list[str] = []

    def m(s: str) -> str:
        out, found = guard.mask_names(s)
        names.extend(found)
        return out

    idea = body.idea.model_copy(update={"title": m(body.idea.title), "body": m(body.idea.body)})
    history = [t.model_copy(update={"text": m(t.text)}) for t in body.history]
    known = [k.model_copy(update={"title": m(k.title)}) for k in body.known]
    reading = body.reading.model_copy(update={"summary": m(body.reading.summary), "open": [m(q) for q in body.reading.open]})
    return body.model_copy(update={"idea": idea, "history": history, "known": known, "reading": reading}), names


def _said(body: CoachIn) -> str:
    """Everything a number in the coach's answer may come from: the employee and the company's records."""
    return "\n".join([body.idea.title, body.idea.body, *(t.text for t in body.history if t.role == "user"),
                      *(k.title for k in body.known), *(g.name + " " + g.kpi for g in body.goals), *(r.type for r in body.routes)])


def coach(llm: LLMClient, body: CoachIn) -> CoachOut:
    started = time.perf_counter()
    body, names = _masked(body)
    known_ids = [k.id for k in body.known]
    ids = id_pattern(known_ids)
    asked = asked_before(body)
    safety = guard.is_safety(body.idea.title + " " + body.idea.body)
    owner = guard.owner_of(guard.safety_row(body.routes), body.locale) if safety else ""
    open_now = [q for q in body.reading.open if not (safety and guard.ACCEPTABLE.search(q))]
    point = open_now[0] if open_now else (guard.SAFETY_QUESTION[body.locale] if safety else "")
    latest = next((t.text for t in reversed(body.history) if t.role == "user"), body.idea.title)
    asks = guard.asks_something(latest)
    said = _said(body)
    pushed_back = {"once": False}

    def invented(s: str) -> set[float]:
        return guard.novel_numbers(s, said)

    def check(t: CoachTurn) -> None:
        t.question = t.question.strip()
        # Nothing was asked: nothing to answer (8 Nov: the field was filled in the person's voice, with made-up figures).
        if not asks:
            t.answer = ""
        if point:
            if not t.question.endswith("?") or t.question.count("?") != 1:
                raise ValueError("question must be exactly one question, ending with a question mark")
            if same := near_copy(t.question, asked):
                raise ValueError("you already asked that - ask it differently or offer concrete options")
        else:
            t.question = ""
        if any(SCORE.search(s) for s in (t.answer, t.note, t.question, t.why)):
            raise ValueError("do not state a score or points - the page shows them")
        if ids and ids.search(" ".join((t.answer, t.note, t.question, t.why, t.recommended))):
            raise ValueError("never show item IDs - name an earlier item by its title")
        # Pushed back once, all together: none is a reason to lose the whole answer, and what the retry
        # leaves is fixed in code below (invented figures, warnings and names go, a hazard is named).
        if pushed_back["once"]:
            return
        problems = []
        if new := invented(" ".join((t.answer, t.note, t.why))):
            problems.append("do not state numbers the employee never gave (" + ", ".join(f"{n:g}" for n in sorted(new)) + ") - ask for them instead")
        if guard.DISCIPLINE.search(" ".join((t.answer, t.note, t.question, t.why, t.recommended))):
            problems.append("never suggest a warning, a dismissal or any disciplinary step - talk about the process, not the person")
        if safety and (not guard.NAMES_SAFETY.search(t.note) or not guard.URGENT.search(t.note) or guard.ACCEPTABLE.search(t.question)):
            problems.append("this is a safety hazard: the note must say it is a safety matter that cannot wait, and the question must not ask whether it is acceptable")
        if slipped_into_english([t.answer, t.note, t.question, t.why, t.recommended], body.locale):
            problems.append("write every field in German, not English")
        if PARROT.search(t.note):
            problems.append("do not repeat what they said back to them - say what it adds or leaves out")
        if problems:
            pushed_back["once"] = True
            raise ValueError("; ".join(problems))

    # One retry at most: on a CPU server every try costs seconds the app may not wait for.
    t = llm.structured("coach", CoachTurn, {
        **language(body.locale, "the employee writes"),
        "company": body.company,
        "point": point or _nothing_open(body),
        "safety": guard.SAFETY_PROMPT.format(owner=owner) if safety else "",
        "idea": body.idea.title + ("\n" + body.idea.body if body.idea.body else ""),
        "goals": _lines([f"- {g.name}" + (f" (measured on: {g.kpi})" if g.kpi else "") for g in body.goals]),
        "routes": _lines([f"- {r.type} -> {r.owner}" for r in body.routes]),
        "reading": _reading(body),
        # No IDs: the coach has no field for one (earlier_id comes from the reading), and one it repeats costs the answer.
        "known": _lines([f"- {k.title}" + (f" [{k.status}]" if k.status else "") for k in body.known]),
        "facts": _facts(body),
        "history": _history(body),
        "asked": _lines([f"- {q}" for q in asked]),
    }, check=check, retries=1)

    # What the retry did not fix is fixed here: the guarantees do not depend on the model listening.
    def clean(s: str) -> str:
        s = guard.drop_sentences(guard.scrub_names(not_you(s.strip()), names), lambda x: bool(guard.DISCIPLINE.search(x) or guard.PAYROLL.search(x)))
        return guard.drop_sentences(s, lambda x: bool(invented(x)))

    answer, note, why = clean(t.answer if asks else ""), clean(t.note), clean(t.why) if t.question else ""
    question = guard.scrub_names(not_you(t.question), names)
    recommended = guard.scrub_names(t.recommended.strip(), names) if t.question else ""
    if guard.DISCIPLINE.search(question):
        question = ""
    if guard.DISCIPLINE.search(recommended):
        recommended = ""
    if safety:
        if not (guard.NAMES_SAFETY.search(note) and guard.URGENT.search(note)):
            note = (guard.SAFETY_NOTE[body.locale].format(owner=owner) + " " + note).strip()
        if not question or guard.ACCEPTABLE.search(question):
            question, why, recommended = guard.SAFETY_QUESTION[body.locale], guard.SAFETY_WHY[body.locale], guard.SAFETY_GUESS[body.locale]
    elif point and not question:
        recommended = why = ""
    # A guess with a figure nobody gave is offered as an example, never as what they said.
    prefix = LANGUAGE[body.locale]["for_example"]
    if recommended and invented(recommended) and not recommended.lower().startswith(prefix.lower()):
        recommended = f"{prefix} {recommended}"

    return CoachOut(
        open_point="open" if point else "none",
        earlier_id=body.reading.same_as if body.reading.same_as in known_ids else None,
        answer=answer, note=note, question=question, why=why, recommended=recommended,
        model=llm.model_used, tokens_in=llm.tokens_in, tokens_out=llm.tokens_out, version=PROMPT_VERSION,
        ms=round((time.perf_counter() - started) * 1000),
    )
