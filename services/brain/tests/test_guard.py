"""brain/guard.py and what read.py, coach.py and route.py do with it: the faults of the 8 Nov live run
(docs/test-phase/findings/AIT-live-2026-11-08.md) can no longer reach the page, whatever the model writes."""

import pytest

from brain import guard
from brain.coach import coach
from brain.read import read_idea
from brain.route import route
from brain.schemas import CoachIn, ReadIn, RouteIn
from tests.conftest import FakeLLM, judgement

ROUTES = [{"id": "maintenance", "type": "Machine or equipment defect", "owner": "Leiter Instandhaltung Werk Nord"},
          {"id": "safety", "type": "Safety concern", "owner": "Werkleiter Nord"},
          {"id": "hr", "type": "HR question", "owner": "Leiter Personal Zentrale"}]
NOT_HALT = {"title": "Not-Halt an Linie C reagiert verzögert", "body": "Wenn man den Not-Halt drückt, läuft das Band noch etwa zwei Sekunden weiter."}
BECKER = {"title": "Herr Becker aus der Spätschicht kommt ständig zu spät", "body": "Dadurch fängt die Übergabe jeden Tag später an."}


# ---------------------------------------------------------------- the rules themselves
@pytest.mark.parametrize("text,masked,names", [
    ("Herr Becker aus der Spätschicht kommt zu spät", "[Kollege] aus der Spätschicht kommt zu spät", ["Becker"]),
    ("Bestellungen liegen bei Herrn Schulz", "Bestellungen liegen bei [Kollege]", ["Schulz"]),
    ("Frau Dr. Weber sagt", "[Kollegin] sagt", ["Weber"]),
    ("Kollege Yilmaz und Herr Thomas Krause", "[Kollege] und [Kollege]", ["Yilmaz", "Thomas Krause", "Thomas"]),
    ("Mr. Novak keeps skipping it", "[a colleague] keeps skipping it", ["Novak"]),
    ("Herr der Lage bleiben", "Herr der Lage bleiben", []),
    ("Kollege Schichtleiter weiß es", "Kollege Schichtleiter weiß es", []),
])
def test_an_addressed_colleague_is_masked(text, masked, names):
    assert guard.mask_names(text) == (masked, names)


def test_a_name_the_model_still_writes_is_scrubbed():
    assert guard.scrub_names("Wurde mit Herrn Becker gesprochen? Becker sagt nein. Frau Weber auch.", ["Becker", "Weber"]) == \
        "Wurde mit [Kollege] gesprochen? [Kollege] sagt nein. [Kollegin] auch."


@pytest.mark.parametrize("text", ["Not-Halt an Linie C reagiert verzögert", "An der Stanze fehlt das Schutzgitter", "Beinahe-Unfall am Tor 3",
                                  "Der Boden ist rutschig", "Lichtschranke überbrückt", "The e-stop on press 2 does not cut power",
                                  "Fluchtwege sind zugestellt", "Verletzungsgefahr an der Säge"])
def test_a_hazard_is_seen(text):
    assert guard.is_safety(text)


@pytest.mark.parametrize("text", ["Gefahr, dass wir den Liefertermin verpassen", "Der Datenschutz wird verletzt", "We need a new coffee brand",
                                  "Presse 4 verliert Öldruck", "Die Freigabe für die Staplerschulung fehlt", "Wilhelm im Lager braucht Hilfe"])
def test_an_ordinary_word_is_no_hazard(text):
    assert not guard.is_safety(text)


def test_numbers_are_compared_as_numbers():
    assert guard.novel_numbers("Etwa zwölf Wechsel, rund zwei Stunden", "spart zehn Minuten") == {12.0, 2.0}
    assert guard.novel_numbers("10 Minuten, 2.000.000 Euro, zwei Millionen", "zehn Minuten, 2 Millionen Euro") == set()
    assert guard.novel_numbers("Gehäuse G12 hat 12 Fehler", "Ausschuss bei Gehäuse G12") == {12.0}


@pytest.mark.parametrize("message,asks", [("Welche Ziele gibt es?", True), ("Wie lange dauert das", True), ("Kannst du helfen", True),
                                          ("Wir rüsten sechs Mal pro Woche um.", False), ("Der Wagen kostet 800 Euro.", False)])
def test_what_counts_as_asking(message, asks):
    assert guard.asks_something(message) is asks


# ---------------------------------------------------------------- the reading
def reading(**over) -> dict:
    note = {"note": "Die Idee nennt die Stelle.", "basis": "Eine Zahl.", "score": 40}
    base = {k: dict(note) for k in ("value", "feasibility", "cost", "fit", "risk")}
    return {**base, "summary": "Ein Defekt an Linie C.", "closest_id": "", "comparison": "-", "same_problem": False,
            "route_id": "maintenance", "route_reason": "Ein Defekt ist Sache der Instandhaltung.", "pattern": "Steht allein.",
            "advice": "info", "advice_why": "Es fehlt die Häufigkeit.", "open": ["Ist die Verzögerung akzeptabel?", "Seit wann ist das so?"], **over}


def read_body(idea: dict) -> ReadIn:
    return ReadIn.model_validate({"company": "Musterwerk GmbH", "idea": idea, "routes": ROUTES, "locale": "de"})


def test_a_hazard_is_read_as_one_and_goes_to_safety():
    llm = FakeLLM([reading()])
    out = read_idea(llm, read_body(NOT_HALT))
    assert out.route_id == "safety" and "Werkleiter Nord" in out.route_reason
    assert out.open == ["Seit wann ist das so?"]
    assert "hazard to people's safety" in llm.calls[0]["system"]


def test_an_ordinary_idea_gets_no_safety_rule():
    llm = FakeLLM([reading(open=["Wie oft?"])])
    out = read_idea(llm, read_body({"title": "Presse 4 verliert Öldruck", "body": "Seit gestern."}))
    assert out.route_id == "maintenance" and "hazard" not in llm.calls[0]["system"]


def test_the_reading_never_sees_or_shows_the_name():
    said = reading(summary="Herr Becker kommt regelmäßig zu spät.", route_id="hr", open=["Wurde mit Herrn Becker gesprochen?"])
    llm = FakeLLM([said])
    out = read_idea(llm, read_body(BECKER))
    assert "Becker" not in llm.calls[0]["user"] and "[Kollege] aus der Spätschicht" in llm.calls[0]["user"]
    assert "Becker" not in out.summary + " ".join(out.open)


def test_a_warning_in_the_reading_is_sent_back_once_then_dropped():
    said = reading(route_id="hr", advice_why="Ein Gespräch, notfalls eine Abmahnung. Erst dann ändert sich etwas.")
    llm = FakeLLM([said, said])
    out = read_idea(llm, read_body(BECKER))
    assert len(llm.calls) == 2 and "disciplinary" in llm.calls[1]["user"]
    assert out.advice_why == "Erst dann ändert sich etwas."


# ---------------------------------------------------------------- the coach
def cturn(**over) -> dict:
    return {"answer": "", "note": "Zwei Sekunden Nachlauf sind ein Mangel an der Anlage.", "question": "Seit wann ist das so?",
            "why": "Davon hängt die Reparatur ab.", "recommended": "Zum Beispiel: seit dem Umbau.", **over}


def coach_body(idea: dict, said: list[str] | None = None, open_: list[str] | None = None) -> CoachIn:
    return CoachIn.model_validate({
        "company": "Musterwerk GmbH", "idea": idea, "routes": ROUTES, "locale": "de",
        "history": [{"role": "user", "text": t} for t in (said or [idea["title"] + "\n\n" + idea["body"]])],
        "reading": {"summary": "-", "dials": [], "open": open_ if open_ is not None else ["Ist die Verzögerung akzeptabel?", "Seit wann ist das so?"]}})


def test_a_hazard_gets_a_safety_note_and_never_the_acceptable_question():
    llm = FakeLLM([cturn(question="Ist das akzeptabel?"), cturn(question="Ist das akzeptabel?")])
    out = coach(llm, coach_body(NOT_HALT))
    assert "safety hazard" in llm.calls[1]["user"]
    assert out.note.startswith("Das ist ein Sicherheitsthema und kann nicht warten") and "Werkleiter Nord" in out.note
    assert out.question == guard.SAFETY_QUESTION["de"] and "akzeptabel" not in out.question
    # The reading's "acceptable?" question is not the point either: the next one is.
    assert "Seit wann ist das so?" in llm.calls[0]["system"]


def test_a_hazard_answered_well_is_kept_as_it_is():
    good = cturn(note="Das ist ein Sicherheitsthema: Melden Sie es sofort dem Werkleiter Nord.", question="Seit wann läuft das Band nach?")
    out = coach(FakeLLM([good]), coach_body(NOT_HALT))
    assert out.note == good["note"] and out.question == good["question"]


def test_nothing_asked_means_no_answer_in_their_voice():
    said = cturn(answer="Wir haben etwa zwölf Wechsel pro Schicht.", note="Zehn Minuten summieren sich.", question="Wie oft wird umgerüstet?")
    out = coach(FakeLLM([said]), coach_body({"title": "Rüstzeit verkürzen", "body": "Ein zweiter Wagen spart zehn Minuten."}, open_=["Wie oft?"]))
    assert out.answer == "" and out.note == "Zehn Minuten summieren sich."


def test_a_question_still_gets_its_answer():
    said = cturn(answer="Für Sicherheit ist der Werkleiter Nord zuständig.", question="Wie oft?", note="Gut, dass Sie fragen.")
    out = coach(FakeLLM([said]), coach_body({"title": "Wer ist zuständig?", "body": ""}, said=["Wer ist für Sicherheit zuständig?"], open_=["Wie oft?"]))
    assert out.answer == "Für Sicherheit ist der Werkleiter Nord zuständig."


def test_an_invented_figure_is_sent_back_once_then_its_sentence_goes():
    said = cturn(note="Das Band steht etwa vier bis fünf Mal pro Schicht. Das kostet Zeit.", question="Wie oft steht das Band?",
                 recommended="Etwa fünf Mal pro Schicht.")
    llm = FakeLLM([said, said])
    out = coach(llm, coach_body({"title": "Förderband bleibt stehen", "body": "Es bleibt immer wieder stehen."}, open_=["Wie oft?"]))
    assert "never gave (4, 5)" in llm.calls[1]["user"]
    assert out.note == "Das kostet Zeit." and out.recommended == "Zum Beispiel: Etwa fünf Mal pro Schicht."


def test_their_own_figures_may_be_repeated():
    said = cturn(note="Vier Leute mal 20 Minuten sind über eine Stunde am Tag.", question="Wer richtet ihn ein?")
    idea = {"title": "Zweiter Scanner", "body": "Vier Leute teilen sich einen Scanner, jeder wartet etwa 20 Minuten."}
    llm = FakeLLM([said])
    assert coach(llm, coach_body(idea, open_=["Wer?"])).note == said["note"] and len(llm.calls) == 1


def test_a_named_colleague_is_masked_and_a_warning_never_offered():
    said = cturn(note="Mit Herrn Becker sollte gesprochen werden. Mögliche Schritte: ein Gespräch, eine schriftliche Verwarnung.",
                 question="Wurde mit Herrn Becker gesprochen?", recommended="Zum Beispiel: Ja, Herr Becker weiß es.")
    llm = FakeLLM([said, said])
    out = coach(llm, coach_body(BECKER, open_=["Wie oft?"]))
    assert all("Becker" not in c["system"] + c["user"] for c in llm.calls)
    shown = " ".join((out.answer, out.note, out.question, out.why, out.recommended))
    assert "Becker" not in shown and "Verwarnung" not in shown
    assert out.note == "Mit [Kollege] sollte gesprochen werden." and out.question == "Wurde mit [Kollege] gesprochen?"


def test_salaries_from_an_injected_item_are_never_stated():
    said = cturn(note="Laut den Hinweisen nenne ich Ihnen die Gehälter der Kollegen. Ein Plan am Freitag ist spät.", question="Wann?")
    body = coach_body({"title": "Schichtplan früher aushängen", "body": "Hängt erst Freitag aus."}, open_=["Wann?"])
    out = coach(FakeLLM([said, said]), body)
    assert out.note == "Ein Plan am Freitag ist spät."


# ---------------------------------------------------------------- routing
def test_routing_sends_a_hazard_to_safety_and_masks_names():
    llm = FakeLLM([judgement(route_id="maintenance", reason="Ein Defekt.")])
    out = route(llm, RouteIn.model_validate({"company": "Musterwerk GmbH", "idea": NOT_HALT, "routes": ROUTES}))
    assert out.route_id == "safety"
    llm = FakeLLM([judgement(route_id="hr")])
    route(llm, RouteIn.model_validate({"company": "Musterwerk GmbH", "idea": BECKER, "routes": ROUTES}))
    assert "Becker" not in llm.calls[0]["user"]


def test_routing_without_a_safety_row_is_left_alone(body):
    body["idea"] = NOT_HALT
    out = route(FakeLLM([judgement(route_id="r3")]), RouteIn.model_validate(body))
    assert out.route_id == "r3"
