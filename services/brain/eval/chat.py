"""Talk to the coach in the terminal and watch it think - the playground for prompt work.

    uv run python -m eval.chat [--prompt]      # the model in LLM_*
    AZURE_OPENAI_KEY=... uv run python -m eval.chat --provider azure-openai --model <deployment> --endpoint <url>

Type an idea, then answer the coach. Every turn prints the reading as the raise page would show it,
then the coach's answer. --prompt also prints what the model is sent. Piped lines work too, so a
conversation can be replayed. Company data is the demo's (eval/acme.json).

Change brain/prompts/read.md or coach.md, then /new: the prompts are read again on every turn.
"""

import json
import sys
from pathlib import Path

from brain.llm import LLMClient, LLMOutputError, load_prompt
from eval.run_coach import client, show, turn

HERE = Path(__file__).parent
BOLD, OFF = "\033[1m", "\033[0m"
SHOWN = "--prompt" in sys.argv


def showing(llm: LLMClient) -> LLMClient:
    """Prints each prompt before it goes to the model (--prompt)."""
    send = llm.complete_json

    def complete_json(system: str, user: str, schema: dict, name: str) -> str:
        print(f"──── prompt '{name}' ────\n{system}\n\n{user}\n────")
        return send(system, user, schema, name)

    llm.complete_json = complete_json  # type: ignore[method-assign]
    return llm


def main() -> None:
    ctx = json.loads((HERE / "acme.json").read_text())
    llm = client([a for a in sys.argv[1:] if a != "--prompt"])
    if SHOWN:
        llm = showing(llm)
    load_prompt("read"), load_prompt("coach")  # fail early if a prompt file is broken
    print(f"Coach playground - model {llm.settings.llm_model}. Type an idea. /new, /quit.")
    turns: list[dict] = []
    previous: list[dict] = []
    while True:
        try:
            text = input(f"{BOLD}you>{OFF} ").strip()
        except (EOFError, KeyboardInterrupt):
            print()
            return
        if text == "/quit":
            return
        if text == "/new":
            turns, previous = [], []
            print("New idea.")
            continue
        if not text:
            continue
        print(text if not sys.stdin.isatty() else "", end="\n" if not sys.stdin.isatty() else "")
        turns.append({"role": "user", "text": text})
        mine = [t["text"] for t in turns if t["role"] == "user"]
        try:
            r, c = turn(llm, ctx, {"title": mine[0][:300], "body": "\n".join(mine[1:])[:5000]}, turns, [], previous)
        except LLMOutputError as e:
            print(f"coach> [no valid answer - the app would show the offline coach]\n{e}")
            turns.pop()
            continue
        show(r, c)
        previous = [d.model_dump(exclude={"basis"}) for d in r.dials]
        turns.append({"role": "assistant", "text": "\n\n".join(x for x in (c.answer, c.note, f"{c.question} {c.why}".strip()) if x)})


if __name__ == "__main__":
    main()
