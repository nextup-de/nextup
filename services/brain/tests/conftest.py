import json

import pytest

from brain.config import Settings
from brain.llm import LLMClient


class FakeLLM(LLMClient):
    """Answers from a queue instead of a model; records what it was asked."""

    def __init__(self, answers: list[dict | str]):
        super().__init__(Settings(llm_model="fake-model", llm_max_retries=2, _env_file=None))
        self.answers = list(answers)
        self.calls: list[dict] = []

    def complete_json(self, system: str, user: str, schema: dict, name: str) -> str:
        self.calls.append({"system": system, "user": user, "schema": schema})
        a = self.answers.pop(0)
        return a if isinstance(a, str) else json.dumps(a)

    def health(self) -> dict:
        return {"reachable": True, "model_available": True}


def judgement(**over) -> dict:
    base = {"closest_id": "", "comparison": "-", "same_problem": False, "same_topic": False,
            "reason": "Quality data is its row.", "route_id": "r3", "confidence": 0.8}
    return {**base, **over}


@pytest.fixture
def body() -> dict:
    return {
        "company": "Acme Components",
        "idea": {"title": "Gauge on station 7 reads off", "body": "Parts get scrapped."},
        "routes": [
            {"id": "r1", "type": "Spend under €5k", "owner": "Team lead, Production"},
            {"id": "r3", "type": "Quality data, measurements, tolerances", "owner": "Quality lead, Quality"},
        ],
        "known": [
            {"id": "c4", "title": "Tolerance drift on station 7", "status": "open"},
            {"id": "i6", "title": "One measurement record, one place", "status": "Awaiting decision"},
        ],
    }
