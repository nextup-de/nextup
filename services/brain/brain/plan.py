"""After the decision (docs/plans/2026-10-15_idea-to-project.md): two small proposals, people decide.

  plan     an accepted idea -> its first steps and the one number to measure it on (plan.md)
  checkin  a discussion's round -> a draft of the check-in: what changed, what is still open (checkin.md)

One model call each. The model never enters a number, never moves a step and never decides: the
lead adds the steps they want and takes the baseline themselves; the desk holder edits the check-in.
"""

import time

from brain.llm import LLMClient
from brain.schemas import CheckinDraft, CheckinIn, CheckinOut, PlanDraft, PlanEffort, PlanIn, PlanMetric, PlanMetricV2, PlanOut, PlanStepV2, PlanV2, PlanV2Draft

# Stored with what the app keeps of an answer. Bump whenever a prompt or the rules below change.
PLAN_VERSION = "brain-plan-v1"
PLAN_V2_VERSION = "brain-plan-v2"
MAX_STEPS, MAX_TEAM, MAX_RISKS, MAX_APPROVALS = 12, 6, 5, 3
EFFORT_MIN, EFFORT_MAX = 1, 250
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
    """A request with templates gets the whole plan (version 2); one without gets the first steps and the metric, exactly as before (version 1)."""
    if body.templates is not None:
        return plan_v2(llm, body)
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
        model=llm.model_used, tokens_in=llm.tokens_in, tokens_out=llm.tokens_out,
        version=PLAN_VERSION,
        ms=round((time.perf_counter() - started) * 1000),
    )


def plan_v2(llm: LLMClient, body: PlanIn) -> PlanOut:
    """The whole plan for an accepted idea (plan AGT, D19): the fitting template and why, steps with roles, the team's roles, a metric with a target,
    an effort range in working days, risks and likely approvals. People decide what to keep; the model enters no baseline and decides nothing."""
    started = time.perf_counter()
    templates = body.templates or []
    keys = {t.key for t in templates}

    pushed_back = {"once": False}

    def check(d: PlanV2Draft) -> None:
        # Pushed back once; a key the company does not have is still none afterwards, in code below.
        if d.template is not None and d.template not in keys and not pushed_back["once"]:
            pushed_back["once"] = True
            raise ValueError("template must be one of the keys in the request, or null when none fits: " + ", ".join(sorted(keys)))
        if not [x for x in d.steps if x.title.strip() and x.role.strip()]:
            raise ValueError("steps must name at least one action with the role that does it")

    goals = "\n".join(f"- {g.name}" + (f" (measured on: {g.kpi})" if g.kpi else "") for g in body.goals) or "(none)"
    shown = "\n".join(
        f"- {t.key}: {t.title}\n" + "\n".join(f"    {i + 1}. {x.title} ({x.role})" for i, x in enumerate(t.steps)) for t in templates) or "(none)"
    d = llm.structured("plan_v2", PlanV2Draft, {
        "company": body.company,
        "idea": body.idea.title + ("\n" + body.idea.body if body.idea.body else ""),
        "goals": goals,
        "templates": shown,
        "keys": ", ".join(sorted(keys)) or "(none)",
    }, check=check)

    # What the retry did not fix is fixed here: the answer holds whatever the model did.
    steps: list[PlanStepV2] = []
    for x in d.steps:
        title, role = " ".join(x.title.split()).strip(" -*")[:200], " ".join(x.role.split())[:80]
        if title and role and title.lower() not in (s.title.lower() for s in steps):
            steps.append(PlanStepV2(title=title, role=role))
    steps = steps[:MAX_STEPS]
    metric = None
    if d.metric is not None and d.metric.name.strip():
        metric = PlanMetricV2(name=" ".join(d.metric.name.split())[:100], unit=" ".join(d.metric.unit.split())[:30], better=d.metric.better, target=d.metric.target)
    low, high = sorted((d.effort.min_days, d.effort.max_days))
    effort = PlanEffort(min_days=min(max(low, EFFORT_MIN), EFFORT_MAX), max_days=min(max(high, EFFORT_MIN), EFFORT_MAX))
    template = d.template if d.template in keys else None
    v2 = PlanV2(
        template=template, template_why=" ".join(d.template_why.split())[:300], steps=steps, team_roles=_clean(d.team_roles, MAX_TEAM), metric=metric,
        effort=effort, risks=[r[:300] for r in _clean(d.risks, MAX_RISKS)], approvals=[a[:120] for a in _clean(d.approvals, MAX_APPROVALS)],
    )
    return PlanOut(
        # The v1 fields, from the plan: the first five steps and the metric without its target.
        steps=[x.title[:120] for x in steps[:5]],
        metric=PlanMetric(name=metric.name[:80], unit=metric.unit[:20], better=metric.better) if metric else None,
        plan=v2,
        model=llm.model_used, tokens_in=llm.tokens_in, tokens_out=llm.tokens_out,
        version=PLAN_V2_VERSION,
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
        model=llm.model_used, tokens_in=llm.tokens_in, tokens_out=llm.tokens_out,
        version=CHECKIN_VERSION,
        ms=round((time.perf_counter() - started) * 1000),
    )
