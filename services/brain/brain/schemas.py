from typing import Literal

from pydantic import BaseModel, ConfigDict, Field, SecretStr


# hide_input_in_errors: a validation error is logged, and the model's answer in it is about the idea.
class Strict(BaseModel):
    model_config = ConfigDict(extra="forbid", hide_input_in_errors=True)


# ---------------------------------------------------------------- request (sent by the app)
# The company's own model endpoint for this one request (azure-openai, openai-compatible). Used
# instead of LLM_*; never stored, never logged: the key is a SecretStr and has no repr.
class LlmOverride(Strict):
    base_url: str = Field(min_length=8, max_length=300, pattern=r"^https?://")
    model: str = Field(min_length=1, max_length=200)
    api_key: SecretStr = Field(min_length=1, max_length=500)
    # azure-openai wants max_completion_tokens and the default temperature; the rest keeps max_tokens.
    provider: Literal["openai-compatible", "azure-openai"] = "openai-compatible"


# Amazon Bedrock: no key here, the brain's own AWS credentials sign the request.
class BedrockOverride(Strict):
    provider: Literal["bedrock"]
    region: str = Field(pattern=r"^[a-z]{2}(-[a-z]+)+-\d$")
    model: str = Field(min_length=1, max_length=200)



# Everything the model needs comes with the request: the service stores nothing and knows no
# company. Route rows carry the owner's role, never a name - the AI points to roles.
class RouteRow(Strict):
    id: str = Field(min_length=1, max_length=40)
    type: str = Field(min_length=1, max_length=200, description="The kind of request this row covers")
    owner: str = Field(max_length=200, description="The owner's role and department, e.g. 'Quality lead, Quality'")


class KnownItem(Strict):
    id: str = Field(min_length=1, max_length=40)
    title: str = Field(min_length=1, max_length=300)
    status: str = Field("", max_length=40, description="e.g. open, shipped, rejected")


class Idea(Strict):
    title: str = Field(min_length=3, max_length=300)
    body: str = Field("", max_length=5000)


class RouteIn(Strict):
    company: str = Field(min_length=1, max_length=120)
    idea: Idea
    routes: list[RouteRow] = Field(min_length=1, max_length=50)
    known: list[KnownItem] = Field(default=[], max_length=80)
    llm: LlmOverride | BedrockOverride | None = None


# ---------------------------------------------------------------- what the model answers
# Small questions instead of one label: small models call everything nearby a "duplicate" when
# asked for the label directly. The code derives duplicate / related / new from these, and the
# reasoning fields come first so the model compares before it commits.
class Judgement(Strict):
    closest_id: str = Field(description="ID of the earlier item closest to the new idea, or empty string if none is about the same thing")
    comparison: str = Field(description="One or two sentences: the new idea's problem, the closest item's problem, how they differ")
    same_problem: bool = Field(description="True only if solving the closest item would also solve the new idea")
    same_topic: bool = Field(description="True if both are about the same object or process, even with a different problem or fix")
    reason: str = Field(description="One sentence: which row covers this idea and why")
    route_id: str = Field(description="ID of the routing row that owns the decision, or 'none'")
    confidence: float = Field(ge=0, le=1)


# ---------------------------------------------------------------- response
class RouteOut(BaseModel):
    route_id: str | None
    confidence: int = Field(ge=0, le=100)
    reason: str
    same_as: str | None      # an earlier item that is the same idea
    related: str | None      # an earlier item about the same thing, different problem or fix
    model: str
    tokens_in: int = 0
    tokens_out: int = 0
    version: str
    ms: int


# ---------------------------------------------------------------- coach (grilling), sent by the app
class Turn(Strict):
    role: Literal["user", "assistant"]
    text: str = Field(max_length=4000)


# ---------------------------------------------------------------- the reading of an idea (brain/read.py)
# Everything the model judges the idea against comes with the request. `skip` holds the questions the
# author said they cannot answer yet; `previous` the last reading, so a score only moves for a reason.
class DialBrief(Strict):
    key: Literal["value", "feasibility", "cost", "fit", "risk"]
    score: int = Field(ge=0, le=100)
    note: str = Field(max_length=500)


class Goal(Strict):
    name: str = Field(min_length=1, max_length=200)
    kpi: str = Field("", max_length=200, description="What the goal is measured on, e.g. minutes per changeover")


Locale = Literal["en", "de"]


class ReadIn(Strict):
    company: str = Field(min_length=1, max_length=120)
    idea: Idea                                   # the author's own words so far, never the coach's
    goals: list[Goal] = Field(default=[], max_length=20)
    routes: list[RouteRow] = Field(default=[], max_length=50)
    known: list[KnownItem] = Field(default=[], max_length=80)
    affected: int = Field(0, ge=0, le=50)
    attachments: int = Field(0, ge=0, le=20)
    spend_limit_eur: float | None = None
    skip: list[str] = Field(default=[], max_length=20)
    previous: list[DialBrief] = Field(default=[], max_length=5)
    locale: Locale = "en"                        # the language of the page that shows the answer
    llm: LlmOverride | BedrockOverride | None = None


DIALS = ("value", "feasibility", "cost", "fit", "risk")


# The reasoning fields come first, so the model reasons before it commits to a number.
class DialRead(Strict):
    note: str = Field(max_length=500, description="One or two sentences on why it has this score, naming what is in this idea")
    basis: str = Field(max_length=300, description="One sentence on what would move this score most")
    score: int = Field(ge=0, le=100)


class IdeaRead(Strict):
    value: DialRead
    feasibility: DialRead
    cost: DialRead
    fit: DialRead
    risk: DialRead
    summary: str = Field(max_length=600, description="What this idea really is and whether it holds up, in your own words")
    closest_id: str = Field(description="ID of the closest earlier item about the same thing, or empty string")
    comparison: str = Field(max_length=400, description="One sentence: this idea's problem against the closest item's problem")
    same_problem: bool = Field(description="True only if solving the closest item would also solve this idea")
    route_id: str = Field(description="ID of the routing row that owns this decision, or 'none'")
    route_reason: str = Field(max_length=300, description="One sentence: why that row")
    pattern: str = Field(max_length=300, description="One sentence: a one-off, or part of something bigger")
    advice: Literal["approve", "pilot", "info"]
    advice_why: str = Field(max_length=300, description="One sentence: why this advice, for this idea")
    # No limit here: read.py keeps the first six, and a seventh question is no reason to redo the reading.
    open: list[str] = Field(description="What the person who decides would still ask, most important first, at most six")


class ReadDial(BaseModel):
    key: Literal["value", "feasibility", "cost", "fit", "risk"]
    score: int = Field(ge=0, le=100)
    note: str
    basis: str


class ReadOut(BaseModel):
    dials: list[ReadDial]
    overall: int = Field(ge=0, le=100)           # the mean of the five dials, computed here
    summary: str
    advice: Literal["approve", "pilot", "info"]
    advice_why: str
    pattern: str
    route_id: str | None
    route_reason: str
    same_as: str | None                          # an earlier item with the same problem
    related: str | None                          # an earlier item about the same thing
    open: list[str]
    model: str
    tokens_in: int = 0
    tokens_out: int = 0
    version: str
    ms: int


# ---------------------------------------------------------------- the coach, sent by the app
class CoachReading(Strict):
    summary: str = Field(max_length=800)
    dials: list[DialBrief] = Field(max_length=5)
    open: list[str] = Field(default=[], max_length=8)
    same_as: str | None = Field(None, max_length=40)


class CoachIn(Strict):
    company: str = Field(min_length=1, max_length=120)
    idea: Idea                                   # the author's own words so far, never the coach's
    history: list[Turn] = Field(default=[], max_length=20)
    reading: CoachReading                        # the same judgement the page shows
    goals: list[Goal] = Field(default=[], max_length=20)
    routes: list[RouteRow] = Field(default=[], max_length=50)
    known: list[KnownItem] = Field(default=[], max_length=80)
    locale: Locale = "en"                        # the language of the page that shows the answer
    llm: LlmOverride | BedrockOverride | None = None


class CoachTurn(Strict):
    answer: str = Field(max_length=800, description="The answer to what their latest message asks, from the company's facts; empty if it asks nothing")
    note: str = Field(max_length=600, description="Your honest read of their latest message: what it adds, leaves out, or what you doubt. Never repeat it back")
    question: str = Field(max_length=300, description="Exactly one short question about the chosen point, ending with a question mark; empty if nothing is open")
    why: str = Field(max_length=350, description="One sentence: what the person who decides does differently once they know; empty if no question")
    recommended: str = Field(max_length=400, description="Your concrete best-guess answer, written as the employee would say it; empty if no question")


class CoachOut(BaseModel):
    open_point: Literal["open", "none"]
    earlier_id: str | None
    answer: str
    note: str
    question: str
    why: str
    recommended: str
    model: str
    tokens_in: int = 0
    tokens_out: int = 0
    version: str
    ms: int


# ---------------------------------------------------------------- after the decision (docs/plans/2026-10-15_idea-to-project.md)
# Plan: an accepted idea in, the first steps and what to measure out. The lead adds what fits; the
# number itself is always taken by people, never by the model.
class PlanTemplateStep(Strict):
    title: str = Field(max_length=200)
    role: str = Field(max_length=80, description="lead, sponsor or team")


class PlanTemplate(Strict):
    key: str = Field(min_length=1, max_length=40)
    title: str = Field(max_length=120)
    steps: list[PlanTemplateStep] = Field(max_length=20)


class PlanIn(Strict):
    company: str = Field(min_length=1, max_length=120)
    idea: Idea
    goals: list[Goal] = Field(default=[], max_length=20)
    # Present: a whole plan against these templates (version 2, brain-plan-v2). Absent: the first steps and the metric, as before (v1).
    templates: list[PlanTemplate] | None = Field(None, max_length=10)
    llm: LlmOverride | BedrockOverride | None = None


class PlanDraft(Strict):
    steps: list[str] = Field(min_length=1, max_length=5, description="3 to 5 concrete steps, each one action a person can finish within two weeks, at most 15 words, in order")
    metric: str = Field(max_length=80, description="The one number that shows the idea worked, measured the same way before and after; empty string if there is none")
    unit: str = Field(max_length=20, description="The metric's unit, e.g. min, %, parts per shift; empty string if none")
    better: Literal["up", "down"] = Field(description="Whether a higher or a lower number is better")


class PlanMetric(BaseModel):
    name: str
    unit: str
    better: Literal["up", "down"]


# Plan v2 (plan AGT, D19): the whole plan a request with templates gets. Shapes fixed in apps/app/src/features/agent/contract.ts (PlanV2Reply).
class PlanStepV2(Strict):
    title: str = Field(max_length=200, description="One action a person can finish, at most 15 words, no names, no numbers you made up")
    role: str = Field(max_length=80, description="The role that does it, never a name: lead, sponsor, team or a role of the company")


class PlanMetricV2(Strict):
    name: str = Field(max_length=100)
    unit: str = Field(max_length=30)
    better: Literal["up", "down"]
    target: float | None = Field(description="The number to reach, or null when none can be justified")


class PlanEffort(Strict):
    min_days: int = Field(description="Working days at the least")
    max_days: int = Field(description="Working days at the most")


class PlanV2Draft(Strict):
    template: str | None = Field(description="The key of the fitting template from the request, or null when none fits")
    template_why: str = Field(max_length=300, description="One sentence: why this template, or why none fits")
    steps: list[PlanStepV2] = Field(min_length=1, max_length=20, description="The plan's steps in order, with roles, at most 12")
    team_roles: list[str] = Field(max_length=10, description="The roles the team needs, at most 6")
    metric: PlanMetricV2 | None
    effort: PlanEffort
    risks: list[str] = Field(max_length=10, description="What could go wrong, at most 5, each one sentence")
    approvals: list[str] = Field(max_length=10, description="The approvals this likely needs, at most 3; empty if none")


class PlanV2(BaseModel):
    template: str | None
    template_why: str
    steps: list[PlanStepV2]
    team_roles: list[str]
    metric: PlanMetricV2 | None
    effort: PlanEffort
    risks: list[str]
    approvals: list[str]


class PlanOut(BaseModel):
    steps: list[str]
    metric: PlanMetric | None
    model: str
    tokens_in: int = 0
    tokens_out: int = 0
    version: str
    ms: int
    # Only on a version 2 answer; a version 1 answer is exactly as before (the endpoint leaves an unset field out).
    plan: PlanV2 | None = None


# ---------------------------------------------------------------- the hint on a no's reason (brain/hint.py, plan AGT, D24)
class HintIn(Strict):
    company: str = Field(min_length=1, max_length=120)
    idea: str = Field(max_length=5000)
    category: str = Field(max_length=80)
    reason: str = Field(max_length=2000)
    locale: Locale
    llm: LlmOverride | BedrockOverride | None = None


class HintDraft(Strict):
    ok: bool = Field(description="True when the reason says why and what would make it a yes, in the sense of its category")
    hint: str = Field(max_length=400, description="When not ok: one sentence on what is missing; empty when ok")


class HintOut(BaseModel):
    ok: bool
    hint: str
    model: str
    tokens_in: int = 0
    tokens_out: int = 0
    version: str
    ms: int


# Check-in: a discussion's round in, a short draft of the check-in out. The desk holder edits it.
class Said(Strict):
    who: str = Field(max_length=120, description="A role, never a name, e.g. Quality lead, or the author")
    text: str = Field(max_length=2000)


class CheckinIn(Strict):
    company: str = Field(min_length=1, max_length=120)
    idea: Idea
    missing: str = Field("", max_length=500, description="What the desk holder said was missing when the discussion started")
    said: list[Said] = Field(default=[], max_length=30, description="What was said in this round, oldest first")
    weak: list[str] = Field(default=[], max_length=10, description="The points the app's analysis still finds weak")
    round: int = Field(ge=1, le=20)
    llm: LlmOverride | BedrockOverride | None = None


class CheckinDraft(Strict):
    note: str = Field(max_length=400, description="Two or three sentences: what changed in this round and what people said, naming roles not people")
    open: list[str] = Field(max_length=6, description="What is still open, each at most 8 words; empty if nothing")
    ready: bool = Field(description="True only if what was missing at the start is now answered")


class CheckinOut(BaseModel):
    next: Literal["round", "decide"]
    open: list[str]
    note: str
    model: str
    tokens_in: int = 0
    tokens_out: int = 0
    version: str
    ms: int


# ---------------------------------------------------------------- the project agent (brain/agent.py, plan AGT)
# The shapes are fixed in apps/app/src/features/agent/contract.ts (AgentRequest, AgentReply): a change goes to both. A step's owner is a
# role or "no owner", never a name; the brain stores nothing and sees only the reduced project.
AgentKind = Literal["unblock", "report", "plan"]
AgentColumn = Literal["todo", "doing", "blocked", "done"]
RideKind = Literal["quiet", "stalled", "late", "blocked"]


class AgentStep(Strict):
    id: str = Field(min_length=1, max_length=40)
    title: str = Field(max_length=200)
    role: str | None = Field(None, max_length=80, description="The role the step waits on, or null")
    column: AgentColumn
    due_day: int | None = None
    owner: str = Field(max_length=80, description="A role, or 'no owner': never a name")
    blocked_why: str | None = Field(None, max_length=400)


class AgentFact(Strict):
    id: str = Field(min_length=1, max_length=60)
    kind: RideKind
    step_id: str | None = Field(None, max_length=40)
    day: int


class AgentUpdate(Strict):
    week: int
    day: int


class AgentProject(Strict):
    id: str = Field(min_length=1, max_length=40)
    title: str = Field(max_length=300)
    goal: str | None = Field(None, max_length=400)
    done_when: str | None = Field(None, max_length=400)
    done_by: int | None = None
    paused_until: int | None = None
    last_activity_day: int | None = None
    latest_update: AgentUpdate | None = None
    check_in_day: int | None = None
    week_sent: bool
    steps: list[AgentStep] = Field(max_length=60)
    facts: list[AgentFact] = Field(max_length=40)


class AgentIn(Strict):
    company: str = Field(min_length=1, max_length=120)
    locale: Locale
    today: int
    project: AgentProject
    kinds: list[AgentKind] = Field(max_length=3, description="The kinds the app can take today")
    llm: LlmOverride | BedrockOverride | None = None


class AgentStepProposal(Strict):
    title: str = Field(max_length=120, description="The one missing step, one action, at most 15 words")
    role: str = Field(max_length=80, description="The role that should do it, never a name")
    due_in_days: int = Field(ge=1, le=60, description="Working days from today")


# The why comes before the draft: the model says why before it writes.
class AgentSuggestionDraft(Strict):
    kind: AgentKind
    step_id: str | None = Field(description="unblock: the open step it is about; otherwise null")
    fact_id: str | None = Field(description="unblock: the id of the clock fact it rides on; otherwise null")
    title: str = Field(max_length=120, description="A short line naming what is suggested")
    why: str = Field(max_length=300, description="One or two sentences: why now, from what the project shows")
    draft: str = Field(max_length=1500, description="unblock: the nudge to the role the step waits on; report: the week's update; plan: one sentence on why the step is missing")
    step: AgentStepProposal | None = Field(description="plan: the step to add; otherwise null")


class AgentDraft(Strict):
    suggestions: list[AgentSuggestionDraft] = Field(max_length=3, description="At most one per kind; empty when there is nothing to say")


class AgentSuggestion(BaseModel):
    kind: AgentKind
    step_id: str | None
    fact_id: str | None
    title: str
    why: str
    draft: str
    step: AgentStepProposal | None


class AgentOut(BaseModel):
    suggestions: list[AgentSuggestion]
    model: str
    tokens_in: int = 0
    tokens_out: int = 0
    version: str
    ms: int
