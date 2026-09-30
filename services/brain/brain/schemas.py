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


OpenPoint = Literal["problem", "context", "evidence", "impact", "solution", "risks", "success_measure", "none"]


# The grilling method, one question per turn: the first open point in dependency order comes
# first, an earlier item about the same problem must be addressed, and the coach offers its own
# best-guess answer. The picks come first, so the model decides before it phrases.
class CoachTurn(Strict):
    earlier_id: str = Field(description="ID of an earlier item about the same problem, or empty string")
    open_point: OpenPoint = Field(description="The first point still unclear, in the order problem, context, evidence, impact, solution, risks, success_measure; 'none' if a decider could act now")
    note: str = Field(description="One or two sentences reacting to the latest message, naming something specific in it")
    question: str = Field(description="Exactly one short question, ending with a question mark")
    why: str = Field(description="One sentence: why the person who decides will ask this")
    recommended: str = Field(description="Your concrete best-guess answer, written as the employee would say it, one or two sentences")


class CoachOut(BaseModel):
    open_point: OpenPoint
    earlier_id: str | None
    note: str
    question: str
    why: str
    recommended: str
    model: str
    version: str
    ms: int
