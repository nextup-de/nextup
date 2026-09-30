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
