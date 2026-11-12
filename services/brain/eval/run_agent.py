"""Score the project agent (brain/agent.py, plan AGT, D20): does every case come out as a checked, useful answer?

    uv run python -m eval.run_agent --recorded    # the recorded answers through today's checks: no model, what CI replays
    uv run python -m eval.run_agent --offline     # a fake model that answers by rule: the plumbing, no model
    uv run python -m eval.run_agent --provider openai-compatible --model llama3.1 --endpoint http://localhost:11434/v1   # layer 2: Ollama
    AZURE_OPENAI_KEY=... uv run python -m eval.run_agent --provider azure-openai --model <deployment> --endpoint <url>      # layer 3, under the cap
    uv run python -m eval.run_agent --provider bedrock --model <id> [--region eu-central-1]

Cases are eval/agent_cases.json, recorded answers eval/recorded/agent.json: answers written by hand to be what a good model says (none of
them is a model's output), so --recorded and --offline measure the checks and the code, never the model. A live run is by hand and never
in CI; its cost per project goes into docs/process/AGT.md.

A case is good when none of these is found:
  kind      a kind that was not wanted, or two of one kind
  unblock   an unblock whose step is not open or whose fact is not in the request
  plan      a plan without a step, or with a step the project already has
  number    a number in title, why, draft or step that the request never gave
  long      a draft over 600 characters
  invalid   no answer came back
"""

import json
import re
import sys
import time
from pathlib import Path

from brain import guard
from brain.agent import MAX_DRAFT, agent
from brain.config import Settings, get_settings
from brain.llm import LLMClient, LLMOutputError
from brain.schemas import AgentIn, AgentOut, BedrockOverride, LlmOverride

HERE = Path(__file__).parent
LABELS = ("kind", "unblock", "plan", "number", "long", "invalid")


def load() -> tuple[list[dict], dict[str, dict]]:
    cases = json.loads((HERE / "agent_cases.json").read_text(encoding="utf-8"))
    recorded = {r["id"]: r for r in json.loads((HERE / "recorded" / "agent.json").read_text(encoding="utf-8"))}
    return cases, recorded


class Recorded(LLMClient):
    """Answers every call with the recording - every retry too, so the code gets no second chance from the model."""

    def __init__(self, answer: dict):
        super().__init__(Settings(llm_model="recorded", llm_max_retries=2, _env_file=None))
        self.answer = answer
        self.sent: list[str] = []

    def complete_json(self, system: str, user: str, schema: dict, name: str) -> str:
        self.sent.append(system + "\n" + user)
        return json.dumps({"suggestions": self.answer["suggestions"]}, ensure_ascii=False)


class Offline(Recorded):
    """A fake model that answers by rule from what it is sent: a nudge on the first open step when a fact exists, nothing otherwise."""

    def __init__(self, request: dict):
        super().__init__({"suggestions": []})
        p = request["project"]
        open_steps = [s for s in p["steps"] if s["column"] != "done"]
        if "unblock" in request["kinds"] and p["facts"] and open_steps:
            f = p["facts"][0]
            s = next((x for x in open_steps if x["id"] == f["step_id"]), open_steps[0])
            self.answer = {"suggestions": [{
                "kind": "unblock", "step_id": s["id"], "fact_id": f["id"], "title": s["title"][:120], "why": "The clock reminded about it.",
                "draft": f"Could the {s['role'] or 'team'} say where \"{s['title']}\" stands?", "step": None}]}


def source_of(request: dict) -> str:
    p = request["project"]
    nums = [request["today"], p["done_by"], p["paused_until"], p["last_activity_day"], p["check_in_day"], *(s["due_day"] for s in p["steps"]), *(f["day"] for f in p["facts"])]
    if p["latest_update"]:
        nums += [p["latest_update"]["week"], p["latest_update"]["day"]]
    return "\n".join([request["company"], p["title"], p["goal"] or "", p["done_when"] or "",
                      *(f"{s['title']} {s['role'] or ''} {s['owner']} {s['blocked_why'] or ''}" for s in p["steps"]), *(str(n) for n in nums if n is not None)])


def judge(request: dict, out: AgentOut | None) -> list[str]:
    """What is wrong with an answer, by the rules of the checks - independent of the code that applied them."""
    if out is None:
        return ["invalid"]
    p = request["project"]
    found: list[str] = []
    kinds = [s.kind for s in out.suggestions]
    if len(set(kinds)) < len(kinds) or any(k not in request["kinds"] for k in kinds):
        found.append("kind")
    open_ids = {s["id"] for s in p["steps"] if s["column"] != "done"}
    titles = {" ".join(s["title"].lower().split()) for s in p["steps"]}
    source = guard.numbers(source_of(request))
    for s in out.suggestions:
        if s.kind == "unblock" and (s.step_id not in open_ids or s.fact_id not in {f["id"] for f in p["facts"]}):
            found.append("unblock")
        if s.kind == "plan" and (s.step is None or " ".join(s.step.title.lower().split()) in titles):
            found.append("plan")
        if guard.numbers(" ".join([s.title, s.why, s.draft, s.step.title if s.step else ""])) - source:
            found.append("number")
        if len(s.draft) > MAX_DRAFT:
            found.append("long")
    return sorted(set(found))


def run_case(case: dict, mode: str, recorded: dict[str, dict], live: LLMClient | None) -> dict:
    request = case["request"]
    body = AgentIn.model_validate(request)
    llm = Recorded(recorded[case["id"]]["answer"]) if mode == "recorded" else Offline(request) if mode == "offline" else live
    started = time.perf_counter()
    try:
        out: AgentOut | None = agent(llm.for_request(body.llm) if mode == "live" else llm, body)
    except LLMOutputError:
        out = None
    return {"id": case["id"], "found": judge(request, out), "kinds": [s.kind for s in out.suggestions] if out else [],
            "tokens": (out.tokens_in + out.tokens_out) if out else 0, "ms": round((time.perf_counter() - started) * 1000)}


def live_client(args: list[str]) -> LLMClient:
    """The model for a live run: the stack's own (LLM_*), or an override from --provider/--model/--endpoint. A key comes from the environment only."""
    import os

    def opt(name: str, default: str = "") -> str:
        return args[args.index(name) + 1] if name in args else default

    provider, model = opt("--provider"), opt("--model")
    base = LLMClient(get_settings())
    if not provider:
        return base
    if provider == "bedrock":
        override: LlmOverride | BedrockOverride = BedrockOverride(provider="bedrock", region=opt("--region", "eu-central-1"), model=model)
    elif provider in ("azure-openai", "openai-compatible"):
        endpoint = opt("--endpoint")
        if not endpoint:
            raise SystemExit(f"{provider} needs --endpoint")
        key = os.environ.get("AZURE_OPENAI_KEY" if provider == "azure-openai" else "LLM_API_KEY", "" if provider == "azure-openai" else "ollama")
        if not key:
            raise SystemExit("azure-openai needs the key in the environment variable AZURE_OPENAI_KEY")
        override = LlmOverride(base_url=endpoint, model=model, api_key=key, provider=provider)
    else:
        raise SystemExit(f"unknown provider {provider!r}")
    return base.for_request(override)


def main(argv: list[str] | None = None) -> int:
    args = sys.argv[1:] if argv is None else argv
    cases, recorded = load()
    mode = "recorded" if "--recorded" in args else "offline" if "--offline" in args else "live"
    live = live_client(args) if mode == "live" else None
    print({"recorded": "RECORDED answers through today's checks - the same answer on every retry, no model was called.",
           "offline": "OFFLINE: a fake model that answers by rule - no model was called.",
           "live": f"LIVE: model {live.settings.llm_model if live else ''}"}[mode] + "\n")
    rows = [run_case(c, mode, recorded, live) for c in cases]
    bad = [r for r in rows if r["found"]]
    for r in rows:
        print(f"{'FAIL' if r['found'] else 'ok  '} {r['id']:<14} {','.join(r['kinds']) or '-':<22} {' '.join(r['found'])}")
    print(json.dumps({"mode": mode, "cases": len(rows), "bad": len(bad), "tokens": sum(r["tokens"] for r in rows),
                      **{k: sum(k in r["found"] for r in rows) for k in LABELS}}, ensure_ascii=False))
    return 1 if bad and mode != "live" else 0


if __name__ == "__main__":
    sys.exit(main())
