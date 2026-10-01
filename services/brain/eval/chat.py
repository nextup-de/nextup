"""Talk to the coach in the terminal and watch it think - the playground for prompt work.

    uv run python -m eval.chat               # against LLM_BASE_URL (your Mac's Ollama by default)
    uv run python -m eval.chat --prompt      # also print the full prompt the model gets each turn

Type an idea, then answer the coach. Under every reply you see its memory (covered), what it chose
to ask (point), whether it found an earlier item, its suggestion and the seconds. Commands:
/new starts a new idea, /quit leaves. The company and its earlier items are the Acme snapshot
(eval/acme.json); the brief is a fixed one saying impact is the weakest score - the worst case
for repeating, which is the point.

Change brain/prompts/coach.md, then /new: the prompt is read again on every turn.
"""

import json
import sys
from pathlib import Path

from brain import coach as coach_mod
from brain.config import get_settings
from brain.llm import LLMClient, LLMOutputError, load_prompt
from brain.schemas import CoachIn

HERE = Path(__file__).parent
BRIEF = ("The idea scores 41/100; it can be published at 70. The scores are computed, not yours to change - never state a different number.\n"
         "- Impact & reach: 20/100 (missing: Put a number on the upside)\n"
         "Ask exactly one short, challenging question that would raise \"Impact & reach\". Do not answer it yourself.")
DIM, BOLD, OFF = "\033[2m", "\033[1m", "\033[0m"


class Showing(LLMClient):
    """Prints each prompt before it goes to the model (--prompt)."""

    def complete_json(self, system: str, user: str, schema: dict, name: str) -> str:
        print(f"{DIM}──── prompt '{name}' ────\n{system}\n\n{user}\n────{OFF}")
        return super().complete_json(system, user, schema, name)


def main() -> None:
    ctx = json.loads((HERE / "acme.json").read_text())
    llm = (Showing if "--prompt" in sys.argv else LLMClient)(get_settings())
    load_prompt("coach")  # fail early if the prompt file is broken
    print(f"Coach playground - model {llm.settings.llm_model}. Type an idea. /new, /quit.")
    turns: list[dict] = []
    while True:
        try:
            text = input(f"{BOLD}you>{OFF} ").strip()
        except (EOFError, KeyboardInterrupt):
            print()
            return
        if text == "/quit":
            return
        if text == "/new":
            turns = []
            print("New idea.")
            continue
        if not text:
            continue
        turns.append({"role": "user", "text": text})
        mine = [t["text"] for t in turns if t["role"] == "user"]
        body = CoachIn.model_validate({"company": ctx["company"], "idea": {"title": mine[0][:300], "body": "\n".join(mine[1:])[:5000]},
                                       "history": turns[-20:], "brief": BRIEF, "known": ctx["known"]})
        before = llm.invalid
        try:
            c = coach_mod.coach(llm, body)
        except LLMOutputError as e:
            print(f"coach> [no valid answer - the app would show the offline coach]\n{DIM}{e}{OFF}")
            turns.pop()
            continue
        print(f"{BOLD}coach>{OFF} {c.note}\n\n       {c.question} {c.why}".rstrip())
        if c.recommended:
            print(f"       suggested: {c.recommended}")
        retries = llm.invalid - before
        print(f"{DIM}       covered: {', '.join(c.covered) or '-'}   point: {c.open_point}   earlier: {c.earlier_id or '-'}"
              f"   {c.ms / 1000:.1f}s{f'   retries: {retries}' if retries else ''}{OFF}")
        turns.append({"role": "assistant", "text": f"{c.note}\n\n{c.question} {c.why}".strip()})


if __name__ == "__main__":
    main()
