import pytest

from brain.llm import LLMOutputError
from brain.route import PROMPT_VERSION, route
from brain.schemas import RouteIn
from tests.conftest import FakeLLM, judgement


def test_routes_and_scales_confidence(body):
    llm = FakeLLM([judgement(confidence=0.83)])
    out = route(llm, RouteIn.model_validate(body))
    assert (out.route_id, out.confidence, out.same_as, out.related) == ("r3", 83, None, None)
    assert out.model == "fake-model" and out.version == PROMPT_VERSION


def test_prompt_gets_rows_and_known_items_but_no_names(body):
    llm = FakeLLM([judgement()])
    route(llm, RouteIn.model_validate(body))
    user = llm.calls[0]["user"]
    assert "r3: Quality data, measurements, tolerances (owner: Quality lead, Quality)" in user
    assert "c4: Tolerance drift on station 7 [open]" in user
    assert "Acme Components" in llm.calls[0]["system"]


def test_ids_are_constrained_in_the_schema(body):
    llm = FakeLLM([judgement()])
    route(llm, RouteIn.model_validate(body))
    props = llm.calls[0]["schema"]["properties"]
    assert props["route_id"]["enum"] == ["r1", "r3", "none"]
    assert props["closest_id"]["enum"] == ["c4", "i6", ""]


def test_verdict_is_derived_from_the_small_questions(body):
    def ask(**j):
        out = route(FakeLLM([judgement(**j)]), RouteIn.model_validate(body))
        return out.same_as, out.related
    assert ask(closest_id="c4", same_problem=True, same_topic=True) == ("c4", None)
    assert ask(closest_id="i6", same_problem=False, same_topic=True) == (None, "i6")
    assert ask(closest_id="i6", same_problem=False, same_topic=False) == (None, None)
    assert ask(closest_id="", same_problem=True, same_topic=True) == (None, None)


def test_none_means_no_row_and_zero_confidence(body):
    out = route(FakeLLM([judgement(route_id="none", confidence=0.7)]), RouteIn.model_validate(body))
    assert (out.route_id, out.confidence) == (None, 0)


def test_unknown_route_id_is_retried(body):
    llm = FakeLLM([judgement(route_id="r99"), judgement(route_id="r1")])
    out = route(llm, RouteIn.model_validate(body))
    assert out.route_id == "r1" and len(llm.calls) == 2
    assert "invalid" in llm.calls[1]["user"]


def test_unknown_earlier_item_counts_as_new_without_a_retry(body):
    llm = FakeLLM([judgement(closest_id="x1", same_problem=True, same_topic=True)])
    out = route(llm, RouteIn.model_validate(body))
    assert (out.same_as, out.related) == (None, None) and len(llm.calls) == 1


def test_invalid_json_retried_then_gives_up(body):
    llm = FakeLLM(["not json", "{}", "[]"])
    with pytest.raises(LLMOutputError):
        route(llm, RouteIn.model_validate(body))
    assert len(llm.calls) == 3 and llm.invalid == 3
