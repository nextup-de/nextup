from typing import Literal

from pydantic import BaseModel, ConfigDict, Field


class Strict(BaseModel):
    model_config = ConfigDict(extra="forbid")


# ---------------------------------------------------------------- request (sent by the app)
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
    version: str
    ms: int


# ---------------------------------------------------------------- coach (grilling), sent by the app
class Turn(Strict):
    role: Literal["user", "assistant"]
    text: str = Field(max_length=4000)


class CoachIn(Strict):
    company: str = Field(min_length=1, max_length=120)
    idea: Idea                                   # the author's own words so far, never the coach's
    history: list[Turn] = Field(default=[], max_length=20)
    # What the app computed: the scores, what each bar is missing, the gap to ask about. The
    # numbers are the app's; the coach may not change or restate them.
    brief: str = Field(max_length=3000)
    known: list[KnownItem] = Field(default=[], max_length=80)


# The "raised before?" check on its own, as in routing: a match found here is handed to the coach
# as a fact to raise. The model alone rarely brings up history; this check finds 10 of 13 repeats.
class Match(Strict):
    closest_id: str = Field(description="ID of the earlier item closest to the new idea, or empty string")
    comparison: str = Field(description="One sentence: the new idea's problem against the closest item's problem")
    same_problem: bool = Field(description="True only if solving the closest item would also solve the new idea")


Point = Literal["problem", "context", "impact", "solution", "evidence", "risks", "success_measure"]
OpenPoint = Literal["problem", "context", "impact", "solution", "evidence", "risks", "success_measure", "none"]


# The coach's notes: per point, the employee's own words so far ("n/a" when the point does not
# matter for this idea). A separate, short model call writes them (brain/coach.py, prompt
# sheet.md); quoting is something a small model does reliably, judging "what is still open" is not.
class Sheet(Strict):
    # Which points the coach's own questions were about. Every question got a reply (the last
    # message is always the employee's), so these points are done whatever the reply said - the
    # code never asks about one again. Sorting a question is easier than sorting an answer.
    asked: list[Point] = Field(max_length=20, description="The points the coach's earlier questions were about, one per question")
    problem: str = Field(max_length=120, description="What goes wrong, in the employee's words; empty if not said")
    context: str = Field(max_length=120, description="Where, since when, how often; empty if not said")
    impact: str = Field(max_length=120, description="Time, cost, quality, safety or people affected; empty if not said")
    solution: str = Field(max_length=120, description="What they propose, or the first step; empty if not said")
    evidence: str = Field(max_length=120, description="Numbers, observations or examples that show it; empty if not said")
    risks: str = Field(max_length=120, description="What could go wrong or who might object; empty if not said")
    success_measure: str = Field(max_length=120, description="How we would know it worked; empty if not said")


# One question about the point the code chose (the first one the notes leave empty). The model
# only phrases - it cannot pick a point that was already answered.
class CoachTurn(Strict):
    earlier_id: str = Field(max_length=40, description="ID of an earlier item about the same problem, or empty string")
    note: str = Field(max_length=300, description="One or two sentences reacting to the latest message, naming something specific in it")
    question: str = Field(max_length=200, description="Exactly one short question about the chosen point, ending with a question mark")
    why: str = Field(max_length=250, description="One sentence: why the person who decides will ask this")
    recommended: str = Field(max_length=300, description="Your concrete best-guess answer, written as the employee would say it, one or two sentences")


class CoachOut(BaseModel):
    covered: list[Point]
    open_point: OpenPoint
    earlier_id: str | None
    note: str
    question: str
    why: str
    recommended: str
    model: str
    version: str
    ms: int


# ---------------------------------------------------------------- after the decision (docs/plans/2026-10-15_idea-to-project.md)
# Plan: an accepted idea in, the first steps and what to measure out. The lead adds what fits; the
# number itself is always taken by people, never by the model.
class Goal(Strict):
    name: str = Field(min_length=1, max_length=200)
    kpi: str = Field("", max_length=200, description="What the goal is measured on, e.g. minutes per changeover")


class PlanIn(Strict):
    company: str = Field(min_length=1, max_length=120)
    idea: Idea
    goals: list[Goal] = Field(default=[], max_length=20)


class PlanDraft(Strict):
    steps: list[str] = Field(min_length=1, max_length=5, description="3 to 5 concrete steps, each one action a person can finish within two weeks, at most 15 words, in order")
    metric: str = Field(max_length=80, description="The one number that shows the idea worked, measured the same way before and after; empty string if there is none")
    unit: str = Field(max_length=20, description="The metric's unit, e.g. min, %, parts per shift; empty string if none")
    better: Literal["up", "down"] = Field(description="Whether a higher or a lower number is better")


class PlanMetric(BaseModel):
    name: str
    unit: str
    better: Literal["up", "down"]


class PlanOut(BaseModel):
    steps: list[str]
    metric: PlanMetric | None
    model: str
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


class CheckinDraft(Strict):
    note: str = Field(max_length=400, description="Two or three sentences: what changed in this round and what people said, naming roles not people")
    open: list[str] = Field(max_length=6, description="What is still open, each at most 8 words; empty if nothing")
    ready: bool = Field(description="True only if what was missing at the start is now answered")


class CheckinOut(BaseModel):
    next: Literal["round", "decide"]
    open: list[str]
    note: str
    model: str
    version: str
    ms: int
