"""The hint on a no's reason (plan AGT, decision D24): is the reason clear, and if not, the one thing to add.

One model call (hint.md). The page shows the sentence under the reason field, or "Looks clear"; nothing is stored and nothing is blocked or changed.
The reason is data: a colleague named in it reaches the model masked (brain/guard.py), and the sentence that comes back never repeats a name or
adds a number that is not in the idea, the reason or the category. What the model gets wrong is fixed here, not hoped for.
"""

import re
import time

from brain import guard
from brain.llm import LLMClient
from brain.schemas import HintDraft, HintIn, HintOut

# Stored by nobody (nothing is kept), but returned with the answer so a prompt change can be told apart. Bump it with any change to hint.md or the rules below.
HINT_VERSION = "brain-hint-v1"
MAX_HINT = 200

LANGUAGE = {
    "en": "Write the hint in English.",
    "de": 'Write the hint in German and address the person formally with "Sie", never "du".',
}
# What the code says when the model found something missing but could not say it without a name or a made-up number.
FALLBACK = {
    "en": "Say why, and what would make it a yes.",
    "de": "Sagen Sie, warum, und was daraus ein Ja machen würde.",
}


_SENTENCE_END = re.compile(r"(?<=[.!?])\s+")


def one_sentence(text: str, limit: int = MAX_HINT) -> str:
    """The first sentence, at most `limit` characters (cut at its last word)."""
    text = " ".join(text.split())
    first = _SENTENCE_END.split(text, maxsplit=1)[0].strip()
    if len(first) <= limit:
        return first
    return first[:limit].rsplit(" ", 1)[0].rstrip(" ,;:-")


def hint(llm: LLMClient, body: HintIn) -> HintOut:
    started = time.perf_counter()
    names: list[str] = []

    def mask(s: str) -> str:
        out, found = guard.mask_names(s)
        names.extend(found)
        return out

    idea, reason = mask(body.idea), mask(body.reason)
    source = " ".join([body.idea, body.reason, body.category])
    pushed_back = {"once": False}

    def check(d: HintDraft) -> None:
        if d.ok:
            return
        if not d.hint.strip():
            raise ValueError("when the reason is not clear, hint must say what is missing in one sentence")
        problems = []
        if new := guard.novel_numbers(d.hint, source):
            problems.append("do not add numbers that are not in the idea or the reason (" + ", ".join(f"{n:g}" for n in sorted(new)) + ")")
        if guard.scrub_names(d.hint, names) != d.hint:
            problems.append("do not repeat a person's name from the reason")
        if problems and not pushed_back["once"]:
            pushed_back["once"] = True
            raise ValueError("; ".join(problems))

    d = llm.structured("hint", HintDraft, {
        "language_rule": LANGUAGE[body.locale],
        "company": body.company,
        "category": body.category,
        "idea": idea,
        "reason": reason,
    }, check=check)

    text = ""
    if not d.ok:
        text = one_sentence(guard.scrub_names(d.hint, names))
        # A number the model made up, or what is left of a sentence that was only a name, is not shown: the plain fallback says what a good reason has.
        if not text or guard.novel_numbers(text, source) or guard.DISCIPLINE.search(text):
            text = FALLBACK[body.locale]
    return HintOut(
        ok=d.ok, hint=text,
        model=llm.model_used, tokens_in=llm.tokens_in, tokens_out=llm.tokens_out,
        version=HINT_VERSION, ms=round((time.perf_counter() - started) * 1000),
    )
