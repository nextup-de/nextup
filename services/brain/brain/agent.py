"""The project agent (plan AGT, decisions D12, D20, D22): at most three suggestions for one running project, one per kind.

  unblock  a short nudge to the role a step waits on, riding on a clock fact that already exists (quiet, stalled, late, blocked)
  report   the week's update for sponsor and raiser, from the board as it stands
  plan     one missing step, with the role that should do it

One model call (agent.md). The model drafts and never acts: it does not decide, move, send, approve or enter a number, and the app asks a
person before anything it wrote reaches anyone. Nothing here trusts the model to follow that: the checks below push a wrong suggestion back
once, and what is still wrong afterwards is dropped, so the answer holds whatever the model did. Nothing to say is a valid answer (an empty list).
"""

import re
import time

from brain import guard
from brain.llm import LLMClient
from brain.schemas import AgentDraft, AgentIn, AgentOut, AgentSuggestion, AgentSuggestionDraft

# Stored with every suggestion the app keeps. Bump whenever agent.md or the rules below change.
AGENT_VERSION = "brain-agent-v1"
MAX_DRAFT = 600  # contract.ts Suggestion.draft; a longer one is cut at a sentence

LANGUAGE = {
    "en": "Write title, why and draft in English.",
    "de": 'Write title, why and draft in German and address people formally with "Sie", never "du".',
}
_SENTENCE_END = re.compile(r"[.!?](?=\s|$)")


def cut_at_sentence(text: str, limit: int = MAX_DRAFT) -> str:
    """The text itself when it fits, else up to its last full sentence within `limit`, else up to its last word."""
    text = " ".join(text.split())
    if len(text) <= limit:
        return text
    head = text[:limit]
    ends = [m.end() for m in _SENTENCE_END.finditer(head)]
    if ends:
        return head[: ends[-1]].strip()
    return head.rsplit(" ", 1)[0].rstrip(" ,;:-") or head


def _title(s: str) -> str:
    return " ".join(s.lower().split())


def _source(body: AgentIn) -> str:
    """Everything a number in a suggestion may come from: the request's words and its day numbers, the step's due days included."""
    p = body.project
    numeric = [body.today, p.done_by, p.paused_until, p.last_activity_day, p.check_in_day,
               *(s.due_day for s in p.steps), *(f.day for f in p.facts)]
    if p.latest_update:
        numeric += [p.latest_update.week, p.latest_update.day]
    return "\n".join([
        body.company, p.title, p.goal or "", p.done_when or "",
        *(f"{s.title} {s.role or ''} {s.owner} {s.blocked_why or ''}" for s in p.steps),
        *(str(n) for n in numeric if n is not None),
    ])


def _numbers_of(s: AgentSuggestionDraft) -> str:
    return " ".join([s.title, s.why, s.draft, s.step.title if s.step else ""])


def agent(llm: LLMClient, body: AgentIn) -> AgentOut:
    started = time.perf_counter()
    p = body.project
    wanted = list(dict.fromkeys(body.kinds))
    open_steps = {s.id for s in p.steps if s.column != "done"}
    fact_ids = {f.id for f in p.facts}
    existing = {_title(s.title) for s in p.steps}
    source = guard.numbers(_source(body))
    pushed_back = {"once": False}

    def problems(s: AgentSuggestionDraft) -> list[str]:
        out: list[str] = []
        if s.kind not in wanted:
            out.append(f"a {s.kind} suggestion is not wanted today (wanted: {', '.join(wanted) or 'none'})")
        if s.kind == "unblock":
            if s.step_id not in open_steps:
                out.append("an unblock names a step that is not open - use the id of an open step from the list")
            if s.fact_id not in fact_ids:
                out.append("an unblock rides on a fact from the list - use its id")
        if s.kind == "plan":
            if s.step is None:
                out.append("a plan proposes one step: fill in step")
            elif _title(s.step.title) in existing or not s.step.title.strip():
                out.append("a plan proposes a step the project does not have yet")
        if new := guard.numbers(_numbers_of(s)) - source:
            out.append("do not state numbers the project never gave (" + ", ".join(f"{n:g}" for n in sorted(new)) + ")")
        return out

    def check(d: AgentDraft) -> None:
        # Pushed back once, all together; what the retry leaves is dropped in code below, so the guarantees do not depend on the model listening.
        found = [msg for s in d.suggestions for msg in problems(s)]
        kinds = [s.kind for s in d.suggestions]
        if len(set(kinds)) < len(kinds):
            found.append("at most one suggestion per kind")
        if found and not pushed_back["once"]:
            pushed_back["once"] = True
            raise ValueError("; ".join(dict.fromkeys(found)))

    d = llm.structured("agent", AgentDraft, {
        "language_rule": LANGUAGE[body.locale],
        "company": body.company,
        "today": str(body.today),
        "title": p.title,
        "goal": p.goal or "(not set)",
        "done_when": p.done_when or "(not set)",
        "done_by": "(none)" if p.done_by is None else f"day {p.done_by}",
        "paused": "no" if p.paused_until is None else f"until day {p.paused_until}",
        "activity": "(none yet)" if p.last_activity_day is None else f"day {p.last_activity_day}",
        "update": "(none sent yet)" if p.latest_update is None else f"sent on day {p.latest_update.day}, for the check-in of day {p.latest_update.week}",
        "week": "(no check-in day yet)" if p.check_in_day is None else f"the check-in day is {p.check_in_day}; this week's update is {'sent' if p.week_sent else 'not sent yet'}",
        "steps": "\n".join(
            f"- {s.id} [{s.column}] {s.title} | role: {s.role or 'none'} | owner: {s.owner}"
            + (f" | due day {s.due_day}" if s.due_day is not None else "") + (f" | blocked: {s.blocked_why}" if s.blocked_why else "")
            for s in p.steps) or "(no steps)",
        "facts": "\n".join(f"- {f.id}: {f.kind}" + (f" on step {f.step_id}" if f.step_id else " on the project") + f" (day {f.day})" for f in p.facts) or "(none)",
        "kinds": ", ".join(wanted) or "(none)",
    }, check=check)

    # What the retry did not fix is dropped here: a kind not wanted or a second one of a kind, an unblock with no open step or no fact,
    # a plan with no step or a step the project has, anything with a number the request never gave.
    kept: list[AgentSuggestion] = []
    for s in d.suggestions:
        if problems(s) or any(k.kind == s.kind for k in kept):
            continue
        kept.append(AgentSuggestion(
            kind=s.kind,
            step_id=s.step_id if s.kind == "unblock" else None,
            fact_id=s.fact_id if s.kind == "unblock" else None,
            title=" ".join(s.title.split()), why=" ".join(s.why.split()), draft=cut_at_sentence(s.draft),
            step=s.step if s.kind == "plan" else None,
        ))
    return AgentOut(
        suggestions=kept[: len(wanted)],
        model=llm.model_used, tokens_in=llm.tokens_in, tokens_out=llm.tokens_out,
        version=AGENT_VERSION, ms=round((time.perf_counter() - started) * 1000),
    )
