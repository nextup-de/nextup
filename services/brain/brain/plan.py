"""After the decision (docs/plans/2026-10-15_idea-to-project.md): two small proposals, people decide.

  plan     an accepted idea -> its first steps and the one number to measure it on (plan.md)
  checkin  a discussion's round -> a draft of the check-in: what changed, what is still open (checkin.md)

One model call each. The model never enters a number, never moves a step and never decides: the
lead adds the steps they want and takes the baseline themselves; the desk holder edits the check-in.
"""

import time

from brain.llm import LLMClient
from brain.schemas import CheckinDraft, CheckinIn, CheckinOut, PlanDraft, PlanIn, PlanMetric, PlanOut

# Stored with what the app keeps of an answer. Bump whenever a prompt or the rules below change.
PLAN_VERSION = "brain-plan-v1"
CHECKIN_VERSION = "brain-checkin-v1"


def _clean(items: list[str], limit: int) -> list[str]:
    """Trimmed, bullet marks dropped, no repeats (ignoring case), at most `limit`."""
    out: list[str] = []
    for s in items:
        s = " ".join(s.split()).strip(" -*")
        if s and s.lower() not in (x.lower() for x in out):
            out.append(s[:120])
    return out[:limit]


def plan(llm: LLMClient, body: PlanIn) -> PlanOut:
    started = time.perf_counter()

    def check(d: PlanDraft) -> None:
        if not _clean(d.steps, 5):
            raise ValueError("steps must name at least one action")

    goals = "\n".join(f"- {g.name}" + (f" (measured on: {g.kpi})" if g.kpi else "") for g in body.goals) or "(none)"
    d = llm.structured("plan", PlanDraft, {
        "company": body.company,
        "idea": body.idea.title + ("\n" + body.idea.body if body.idea.body else ""),
        "goals": goals,
    }, check=check)
    metric = d.metric.strip()
    return PlanOut(
        steps=_clean(d.steps, 5),
        metric=PlanMetric(name=metric[:80], unit=d.unit.strip()[:20], better=d.better) if metric else None,
        model=llm.settings.llm_model,
        version=PLAN_VERSION,
        ms=round((time.perf_counter() - started) * 1000),
    )


def checkin(llm: LLMClient, body: CheckinIn) -> CheckinOut:
    started = time.perf_counter()
    said = "\n".join(f"- {s.who}: {s.text}" for s in body.said) or "(nobody said anything this round)"
    d = llm.structured("checkin", CheckinDraft, {
        "company": body.company,
        "idea": body.idea.title + ("\n" + body.idea.body if body.idea.body else ""),
        "missing": body.missing or "(not said)",
        "said": said,
        "weak": ", ".join(body.weak) or "(none)",
        "round": str(body.round),
    })
    open_ = _clean(d.open, 6)
    return CheckinOut(
        # Ready only when the model says so AND leaves nothing open: a round with open points goes on.
        next="decide" if d.ready and not open_ else "round",
        open=open_,
        note=" ".join(d.note.split())[:400],
        model=llm.settings.llm_model,
        version=CHECKIN_VERSION,
        ms=round((time.perf_counter() - started) * 1000),
    )
