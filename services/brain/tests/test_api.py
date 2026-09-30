import pytest
from fastapi.testclient import TestClient

from brain import main
from tests.conftest import FakeLLM, judgement


@pytest.fixture
def client(monkeypatch):
    def make(answers, key=""):
        monkeypatch.setattr(main.settings, "api_key", key)
        main.app.state.llm = FakeLLM(answers)
        return TestClient(main.app)
    yield make
    del main.app.state.llm


def test_route_endpoint(client, body):
    r = client([judgement(closest_id="c4", same_problem=True)]).post("/v1/route", json=body)
    assert r.status_code == 200
    assert r.json()["route_id"] == "r3" and r.json()["same_as"] == "c4"


def test_api_key_required_except_health(client, body):
    c = client([judgement()], key="s3cret")
    assert c.post("/v1/route", json=body).status_code == 401
    assert c.post("/v1/route", json=body, headers={"x-api-key": "wrong"}).status_code == 401
    assert c.get("/health").status_code == 200
    assert c.post("/v1/route", json=body, headers={"x-api-key": "s3cret"}).status_code == 200


def test_invalid_model_output_is_502(client, body):
    assert client(["x", "x", "x"]).post("/v1/route", json=body).status_code == 502


def test_rejects_unknown_fields_and_empty_routes(client, body):
    c = client([])
    assert c.post("/v1/route", json={**body, "extra": 1}).status_code == 422
    assert c.post("/v1/route", json={**body, "routes": []}).status_code == 422


def test_health_reports_model_without_urls(client):
    j = client([]).get("/health").json()
    assert j["status"] == "ok" and j["llm"]["model"] == "fake-model" and "base_url" not in str(j)
