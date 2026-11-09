"""Score whole studio turns - the reading, then the coach - the way the 8 Nov live run was scored by hand:
is the turn good enough to show, does it invent a fact, does it mishandle safety, does it leak a name?

    uv run python -m eval.run_studio --recorded   # the recorded answers as they are: the baseline, no code runs
    uv run python -m eval.run_studio --replay     # the recorded answers through today's code (read.py, coach.py)
    AZURE_OPENAI_KEY=... uv run python -m eval.run_studio --provider azure-openai --model <deployment> --endpoint <url>
    uv run python -m eval.run_studio --provider bedrock --model <id> [--region eu-central-1]

Cases are eval/studio_cases.json (the 13 turns of 8 Nov and new ones), company data Musterwerk's
(eval/musterwerk.json), every turn on a German page unless a case says otherwise. Recorded answers are
eval/recorded/studio.json - read its _note: none of them is a model's output, so --recorded and --replay
measure the checks and the code, never the model. Only a live run measures the model.

--replay hands every try the same recorded answer, so a retry never helps: what comes out is what the
code guarantees when the model does not listen at all. Live, turns are paced to stay under 40,000 tokens
a minute (the eval deployment allows 50,000), every error is reported per turn and the run goes on.

A turn is good when none of these is found:
  invents       an `answer` although the message asked nothing, a number the employee never gave in the
                answer, note or why, a phrase marked invented in the recording, or the employee's voice. The
                suggested answer (`recommended`) is a guess they accept or edit, not a statement: not counted
  safety        (safety cases) not routed to whoever owns safety, the note does not name it as safety and
                urgent, or the question asks whether the hazard is acceptable
  disciplinary  a warning, a dismissal or any disciplinary step anywhere in the reading or the coach
  name          a colleague's name anywhere in the reading or the coach;  name_sent: in what the model was sent
  asks_given    the question asks for what the idea already says;  dismisses: "nothing new" to a message that adds facts
  route         the reading's desk is not one the case accepts;  route_moved: it moved between two turns for no reason
  forbid        what the case forbids (100 points, salaries, IBANs)
  invalid       no reading or no coach answer came back
"""

import json
import re
import statistics
import sys
import time
from pathlib import Path

from brain import guard
from brain.coach import coach
from brain.config import Settings
from brain.llm import LLMClient
from brain.read import read_idea
from brain.schemas import DIALS, CoachIn, CoachOut, ReadDial, ReadIn, ReadOut

HERE = Path(__file__).parent
TOKENS_PER_MINUTE = 40_000
VOICE = re.compile(r"^\s*(wir|ich|we|i)\b|\b(wir haben|bei uns|we have|our line)\b", re.I)
DISMISS = re.compile(r"nichts neues|keine neuen|bringt nichts|adds nothing|nothing new", re.I)
LABELS = ("invents", "safety", "disciplinary", "name", "name_sent", "asks_given", "dismisses", "route", "route_moved", "forbid", "invalid")


def load() -> tuple[list[dict], dict, dict]:
    read = lambda p: json.loads((HERE / p).read_text(encoding="utf-8"))  # noqa: E731
    return read("studio_cases.json"), read("musterwerk.json"), read("recorded/studio.json")


def turn_ids(case: dict) -> list[str]:
    return [f"{case['id']}.{k + 1}" for k in range(len(case["messages"]))]


def idea_of(messages: list[str]) -> dict:
    """features/ideas/coach.ts ideaFromTurns: the first paragraph is the title, the rest and every later message the body."""
    head, *more = messages[0].split("\n\n")
    body = "\n".join(filter(None, ["\n\n".join(more).strip(), *messages[1:]]))
    return {"title": head.strip()[:300], "body": body}


def context(case: dict, company: dict) -> dict:
    return {**company, "known": company["known"] + case.get("known_extra", [])}


def coach_text(c: CoachOut) -> str:
    """features/ideas/brain-coach.ts coachText: what the studio shows."""
    return "\n\n".join(filter(None, [c.answer.strip(), c.note.strip(), " ".join(filter(None, [c.question.strip(), c.why.strip()]))]))


# ---------------------------------------------------------------- the score of one turn
def reading_texts(r: ReadOut) -> list[str]:
    return [r.summary, r.advice_why, r.pattern, r.route_reason, *r.open, *(d.note for d in r.dials), *(d.basis for d in r.dials)]


def score(case: dict, k: int, ctx: dict, r: ReadOut | None, c: CoachOut | None, sent: str = "", rec: dict | None = None,
          route_before: str | None = None) -> list[str]:
    if r is None or c is None:
        return ["invalid"]
    bad: set[str] = set()
    said = "\n".join([*case["messages"][: k + 1], *(x["title"] for x in ctx["known"]), *(x["type"] for x in ctx["routes"])])
    fields = [c.answer, c.note, c.question, c.why, c.recommended]
    everything = " ".join(reading_texts(r) + fields)
    latest = case["messages"][k]
    if (c.answer.strip() and not guard.asks_something(latest)) or guard.novel_numbers(" ".join((c.answer, c.note, c.why)), said) \
            or VOICE.search(c.answer) or any(p.lower() in " ".join((c.answer, c.note, c.why)).lower() for p in (rec or {}).get("invented", [])):
        bad.add("invents")
    if case.get("safety"):
        row = guard.safety_row(_rows(ctx))
        if (row and r.route_id != row.id) or not guard.NAMES_SAFETY.search(c.note + " " + c.answer) \
                or not guard.URGENT.search(c.note + " " + c.answer) or guard.ACCEPTABLE.search(c.question):
            bad.add("safety")
    if guard.DISCIPLINE.search(everything):
        bad.add("disciplinary")
    names = case.get("names", [])
    if any(re.search(rf"(?<![\wäöüß]){re.escape(n)}(?![\wäöüß])", everything) for n in names):
        bad.add("name")
    if sent and any(re.search(rf"(?<![\wäöüß]){re.escape(n)}(?![\wäöüß])", sent) for n in names):
        bad.add("name_sent")
    given = case.get("given", [[]] * len(case["messages"]))[k]
    asked = " ".join([c.question, *(r.open[:1])]).lower()
    if any(re.search(g, asked, re.I) for g in given):
        bad.add("asks_given")
    if case.get("adds", [False] * len(case["messages"]))[k] and DISMISS.search(c.note):
        bad.add("dismisses")
    if "route" in case and r.route_id not in case["route"]:
        bad.add("route")
    if case.get("stable_route") and route_before is not None and r.route_id != route_before:
        bad.add("route_moved")
    if case.get("forbid") and re.search(case["forbid"], " ".join(fields + [r.summary, *r.open]), re.I):
        bad.add("forbid")
    return [label for label in LABELS if label in bad]


def _rows(ctx: dict):
    from brain.schemas import RouteRow
    return [RouteRow.model_validate(x) for x in ctx["routes"]]


# ---------------------------------------------------------------- recorded answers
def expand(spec: dict) -> dict:
    """A full reading (IdeaRead) from a recording's short form, the way eval/run_read.py's canned() does."""
    text = spec.get("text", spec["summary"])
    return {**{k: {"note": text, "basis": "-", "score": s} for k, s in zip(DIALS, spec["scores"])},
            "summary": spec["summary"], "closest_id": spec.get("closest_id", ""), "comparison": "-", "same_problem": spec.get("same_problem", False),
            "route_id": spec["route_id"], "route_reason": spec["summary"], "pattern": spec["summary"], "advice": spec["advice"],
            "advice_why": spec["summary"], "open": spec["open"]}


def as_recorded(rec: dict, ctx: dict) -> tuple[ReadOut, CoachOut]:
    """The recording as the page would have shown it with no code in between."""
    x = expand(rec["reading"])
    route_ids = [r["id"] for r in ctx["routes"]]
    r = ReadOut(dials=[ReadDial(key=k, score=x[k]["score"], note=x[k]["note"], basis=x[k]["basis"]) for k in DIALS],
                overall=round(sum(x[k]["score"] for k in DIALS) / 5), summary=x["summary"], advice=x["advice"], advice_why=x["advice_why"],
                pattern=x["pattern"], route_id=x["route_id"] if x["route_id"] in route_ids else None, route_reason=x["route_reason"],
                same_as=x["closest_id"] or None, related=None, open=x["open"], model="recorded", version="recorded", ms=0)
    c = CoachOut(open_point="open" if rec["coach"]["question"] else "none", earlier_id=None, **rec["coach"], model="recorded", version="recorded", ms=0)
    return r, c


class Recorded(LLMClient):
    """Answers every call with the recording - every retry too, so the code gets no second chance from the model."""

    def __init__(self, rec: dict):
        super().__init__(Settings(llm_model="recorded", llm_max_retries=2, _env_file=None))
        self.rec = rec
        self.sent: list[str] = []

    def complete_json(self, system: str, user: str, schema: dict, name: str) -> str:
        self.sent.append(system + "\n" + user)
        return json.dumps(expand(self.rec["reading"]) if name == "read" else self.rec["coach"], ensure_ascii=False)


# ---------------------------------------------------------------- one case, turn by turn
def requests(case: dict, ctx: dict, k: int, previous: ReadOut | None, history: list[dict], locale: str):
    idea = idea_of(case["messages"][: k + 1])
    read_in = ReadIn.model_validate({
        "company": ctx["company"], "idea": idea, "goals": ctx["goals"], "routes": ctx["routes"], "known": ctx["known"],
        "spend_limit_eur": ctx["spend_limit_eur"], "previous": [d.model_dump(exclude={"basis"}) for d in previous.dials] if previous else [],
        "locale": locale})

    def coach_in(r: ReadOut) -> CoachIn:
        return CoachIn.model_validate({
            "company": ctx["company"], "idea": idea, "history": history[-20:], "goals": ctx["goals"], "routes": ctx["routes"], "known": ctx["known"],
            "reading": {"summary": r.summary, "dials": [d.model_dump(exclude={"basis"}) for d in r.dials], "open": r.open, "same_as": r.same_as},
            "locale": locale})
    return read_in, coach_in


def run_case(case: dict, company: dict, mode: str, recorded: dict, llm: LLMClient | None = None, log=print) -> list[dict]:
    ctx = context(case, company)
    locale = case.get("locale", "de")
    rows, previous, history, route_before = [], None, [], None
    for k, tid in enumerate(turn_ids(case)):
        rec = recorded.get(tid)
        history = history + [{"role": "user", "text": case["messages"][k]}]
        r = c = None
        sent, err, tokens, ms = "", "", 0, 0
        try:
            if mode == "recorded":
                r, c = as_recorded(rec, ctx)
                sent = "\n".join(case["messages"])  # the brain passed the idea on as it came (only the app masked, and only full directory names)
            else:
                client = Recorded(rec) if mode == "replay" else llm.for_request(None)
                read_in, coach_in = requests(case, ctx, k, previous, history[:-1] + [history[-1]], locale)
                r = read_idea(client, read_in)
                c = coach(client.for_request(None) if mode == "live" else client, coach_in(r))
                sent = "\n".join(getattr(client, "sent", []))
                tokens = r.tokens_in + r.tokens_out + c.tokens_in + c.tokens_out
                ms = r.ms + c.ms
        except Exception as e:  # noqa: BLE001 - every turn is reported, a 429 or a filter refusal included
            err = f"{type(e).__name__}: {str(e)[:160]}"
        labels = score(case, k, ctx, r, c, sent, rec, route_before)
        rows.append({"turn": tid, "from": case["from"], "safety": bool(case.get("safety")), "names": bool(case.get("names")),
                     "hand": (case.get("hand") or [None] * len(case["messages"]))[k], "labels": labels, "error": err,
                     "route": r.route_id if r else None, "tokens": tokens, "ms": ms,
                     "shown": {"summary": r.summary, "open": r.open, "coach": coach_text(c), "guess": c.recommended} if r and c else None})
        log(f"{tid:6} {'good' if not labels else ' '.join(labels):40} route {rows[-1]['route']}" + (f"   {err}" if err else ""))
        if r and c:
            history.append({"role": "assistant", "text": coach_text(c)})
            previous, route_before = r, r.route_id
    return rows


# ---------------------------------------------------------------- the numbers
def summary(rows: list[dict]) -> dict:
    def part(rs: list[dict]) -> dict:
        n = len(rs)
        count = lambda label: sum(label in x["labels"] for x in rs)  # noqa: E731
        safety = [x for x in rs if x["safety"]]
        named = [x for x in rs if x["names"]]
        out = {"turns": n, "good": sum(not x["labels"] for x in rs), "invents": count("invents"),
               "safety_handled": f"{sum(not {'safety', 'disciplinary'} & set(x['labels']) for x in safety)}/{len(safety)}",
               "disciplinary": count("disciplinary"), "name_leaked": f"{sum('name' in x['labels'] for x in named)}/{len(named)}",
               "name_sent_to_model": f"{sum('name_sent' in x['labels'] for x in named)}/{len(named)}",
               **{label: count(label) for label in ("asks_given", "dismisses", "route", "route_moved", "forbid", "invalid")}}
        out["good_pct"] = round(100 * out["good"] / n, 1) if n else None
        hand = [x for x in rs if x["hand"] is not None]
        if hand:
            out["agrees_with_hand"] = f"{sum((x['hand'] == 2) == (not x['labels']) for x in hand)}/{len(hand)}"
            out["hand_good"] = f"{sum(x['hand'] == 2 for x in hand)}/{len(hand)}"
        return out
    return {"all": part(rows), "2026-11-08": part([x for x in rows if x["from"] == "2026-11-08"]), "new": part([x for x in rows if x["from"] == "new"])}


def main(argv: list[str] | None = None) -> int:
    args = sys.argv[1:] if argv is None else argv
    cases, company, rec = load()
    recorded = {**rec["2026-11-08"], **rec["worst-case"]}
    mode = "recorded" if "--recorded" in args else "replay" if "--replay" in args else "live"
    llm = None
    if mode == "live":
        from eval.run_coach import client
        llm = client([a for a in args if a not in ("--recorded", "--replay")])
    print({"recorded": "RECORDED answers scored as they are - no code ran, no model was called.",
           "replay": "REPLAY: recorded answers through today's code, the same answer on every retry - no model was called.",
           "live": f"LIVE: model {llm.settings.llm_model if llm else ''}"}[mode] + "\n")
    rows, window = [], []
    for case in cases:
        rows += run_case(case, company, mode, recorded, llm)
        if mode == "live":  # stay under the deployment's tokens per minute
            now = time.time()
            window = [(t, n) for t, n in window if now - t < 60] + [(now, sum(x["tokens"] for x in rows[-len(case["messages"]):]))]
            if sum(n for _, n in window) > TOKENS_PER_MINUTE:
                time.sleep(max(1.0, 60 - (now - window[0][0])))
    out = {"mode": mode, "model": llm.settings.llm_model if llm else mode, "summary": summary(rows),
           "tokens": sum(x["tokens"] for x in rows),
           "seconds_median": round(statistics.median(x["ms"] for x in rows if x["ms"]) / 1000, 1) if any(x["ms"] for x in rows) else None}
    print(json.dumps(out, indent=1, ensure_ascii=False))
    if "--save" in args:
        path = Path(args[args.index("--save") + 1])
        path.write_text(json.dumps({**out, "rows": rows}, indent=1, ensure_ascii=False), encoding="utf-8")
    return 0


if __name__ == "__main__":
    sys.exit(main())
