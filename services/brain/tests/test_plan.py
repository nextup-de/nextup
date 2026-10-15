"""The proposals after a decision (brain/plan.py): plan steps and a metric, a check-in draft."""

import pytest
from fastapi.testclient import TestClient

from brain import main
from brain.plan import checkin, plan
from brain.schemas import CheckinIn, PlanIn
from tests.conftest import FakeLLM

IDEA = {"title": "A shared setup cart for line 3", "body": "*First step* A one-week trial with one cart on line 3"}


def draft(**over) -> dict:
    base = {"steps": ["Stock one cart with spare tools", "  One-week trial on line 3 ", "stock ONE cart with spare tools"],
            "metric": "Changeover time, line 3", "unit": "min", "better": "down"}
    return {**base, **over}


def test_plan_cleans_steps_and_keeps_the_metric():
    llm = FakeLLM([draft()])
    out = plan(llm, PlanIn(company="Acme", idea=IDEA, goals=[{"name": "Every changeover under 20 minutes", "kpi": "minutes per changeover"}]))
    assert out.steps == ["Stock one cart with spare tools", "One-week trial on line 3"]
    assert out.metric is not None and out.metric.name == "Changeover time, line 3" and out.metric.better == "down"
    assert out.version == "brain-plan-v1"
    assert "Every changeover under 20 minutes (measured on: minutes per changeover)" in llm.calls[0]["user"]


def test_plan_without_a_metric_says_none():
    out = plan(FakeLLM([draft(metric="  ", unit="")]), PlanIn(company="Acme", idea=IDEA))
    assert out.metric is None


def test_plan_retries_steps_that_are_only_marks():
    llm = FakeLLM([draft(steps=[" - ", "*"]), draft()])
    assert plan(llm, PlanIn(company="Acme", idea=IDEA)).steps[0] == "Stock one cart with spare tools"
    assert len(llm.calls) == 2


def check(**over) -> dict:
    return {"note": "Quality posted the  measured time.", "open": [], "ready": True, **over}


def checkin_body(**over) -> CheckinIn:
    return CheckinIn(**{"company": "Acme", "idea": IDEA, "missing": "a measured number", "round": 1,
                        "said": [{"who": "Quality lead", "text": "MES says 38 minutes."}], "weak": ["Cost"], **over})


def test_checkin_ready_only_without_open_points():
    assert checkin(FakeLLM([check()]), checkin_body()).next == "decide"
    out = checkin(FakeLLM([check(open=["Who stocks the cart", "who stocks the cart"])]), checkin_body())
    assert out.next == "round" and out.open == ["Who stocks the cart"]
    assert checkin(FakeLLM([check(ready=False)]), checkin_body()).next == "round"


def test_checkin_prompt_carries_the_round():
    llm = FakeLLM([check()])
    out = checkin(llm, checkin_body(round=2))
    assert out.note == "Quality posted the measured time."
    assert "Said in round 2:" in llm.calls[0]["user"] and "- Quality lead: MES says 38 minutes." in llm.calls[0]["user"]
    assert "Missing at the start: a measured number" in llm.calls[0]["user"]


@pytest.fixture
def client(monkeypatch):
    def make(answers):
        monkeypatch.setattr(main.settings, "api_key", "")
        main.app.state.llm = FakeLLM(answers)
        return TestClient(main.app)
    yield make
    del main.app.state.llm


def test_endpoints(client):
    r = client([draft()]).post("/v1/plan", json={"company": "Acme", "idea": IDEA})
    assert r.status_code == 200 and r.json()["metric"]["unit"] == "min"
    r = client([check()]).post("/v1/checkin", json={"company": "Acme", "idea": IDEA, "round": 1})
    assert r.status_code == 200 and r.json()["next"] == "decide"
    assert client([]).post("/v1/checkin", json={"company": "Acme", "idea": IDEA, "round": 0}).status_code == 422
    assert client(["x", "x", "x"]).post("/v1/plan", json={"company": "Acme", "idea": IDEA}).status_code == 502
