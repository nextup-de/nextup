"""What the reading and the coach must never get wrong, checked in code rather than hoped for:

- a safety hazard is named as one, goes to whoever owns safety and is never asked "is that acceptable?";
- nobody is offered a disciplinary step (a written warning, a dismissal) - the studio is about ideas;
- a colleague named as "Herr Becker" or "Frau Weber" reaches the model as "[Kollege]" / "[Kollegin]";
- the coach adds no numbers the employee never gave (the 8 Nov run: "twelve changeovers a shift").

Pure functions; brain/read.py and brain/coach.py apply them. docs/test-phase/findings/AIT-coach-2026-11-09.md.
"""

import re

# ---------------------------------------------------------------- safety
# Hazards to people, in the words people use. Narrow on purpose: "Gefahr, dass wir den Termin verpassen"
# is not a safety matter, "Verletzungsgefahr" is.
SAFETY = re.compile(
    r"not-?\s?halt|not-?\s?aus\b|notaus|emergency[ -]stop|e-stop|schutzgitter|schutzhaube|schutztür|schutzeinrichtung|lichtschranke|"
    r"\bguards?\b|safety guard|light curtain|beinahe-?unfall|near[ -]miss|\bunfall|\bunfälle|accident|injur|"
    r"verletzung\b|verletzungen|verletzt sich|sich verletzt|verletzt worden|"
    r"stromschlag|electric shock|brandgefahr|brandgeruch|\bbrennt\b|\bfeuer\b|\bfire\b|rauchentwicklung|smoke|gasgeruch|gas leak|"
    r"rutschig|rutschgefahr|slippery|stolper|trip hazard|quetsch|\bcrush|absturz|abstürzen|herabfallen|"
    r"(?:verletzungs|unfall|lebens|explosions|stolper|quetsch)gefahr|gefährlich|dangerous|hazard|"
    r"überbrückt|bridged|fluchtweg|notausgang|fire exit|escape route|feuerlöscher|extinguisher|"
    r"ätzend|chemikalie|chemical|schutzbrille|gehörschutz|\bhelm\b|\bppe\b|\bpsa\b",
    re.I)

# A row of the routing map that owns safety, by its id, type or owner.
SAFETY_ROW = re.compile(r"safety|sicherheit|arbeitsschutz|\behs\b|\bhse\b|\bsifa\b", re.I)

# Asking whether a hazard is "acceptable" treats it as a matter of taste (8 Nov, Not-Halt).
ACCEPTABLE = re.compile(r"akzeptabel|vertretbar|hinnehmbar|tolerierbar|in ordnung|acceptable|tolerable|\bok\b|\bokay\b", re.I)

# What a serious answer to a hazard says: that it is about safety, and that it cannot wait.
NAMES_SAFETY = re.compile(r"sicherheit|arbeitsschutz|gefahr|gefährlich|unfall|verletz|safety|hazard|danger|injur|accident", re.I)
URGENT = re.compile(r"sofort|umgehend|unverzüglich|heute|jetzt|dringend|nicht warten|immediately|right away|today|\bnow\b|urgent|before the next shift|vor der nächsten schicht", re.I)

# ---------------------------------------------------------------- discipline
DISCIPLINE = re.compile(
    r"abmahn|verwarnung|verwarnen|ermahn|disziplinar|\bkündig|entlass|sanktion|personalakte|konsequenzen für|arbeitsrechtlich|"
    r"written warning|formal warning|disciplin|dismiss|\bfire (?:him|her|them)\b|terminat|sanction|consequences for|personnel file",
    re.I)

# ---------------------------------------------------------------- names
# "Herr Becker", "Frau Dr. Weber", "Herrn Schulz", "Kollegin Yilmaz", "Mr. Novak". Two capitalised words at
# most ("Herr Thomas Becker"); a lower-case word after it ("Herr der Lage") is no name.
_CAP = r"[A-ZÄÖÜ][a-zäöüß]+(?:-[A-ZÄÖÜ][a-zäöüß]+)?"
ADDRESSED = re.compile(
    rf"\b(Herrn?|Hr\.|Frau|Fr\.|Kollegen?|Kollegin|Mr\.?|Mrs\.?|Ms\.?|Miss)\s+(?:(?:Dr|Prof)\.\s*)?({_CAP}(?:\s+{_CAP})?)\b")
_FEMALE = {"Frau", "Fr.", "Kollegin", "Mrs", "Mrs.", "Ms", "Ms.", "Miss"}
_ENGLISH = {"Mr", "Mr.", "Mrs", "Mrs.", "Ms", "Ms.", "Miss"}
# Words that follow "Kollege" without being a name ("Kollege Schichtleiter" is a role, kept).
_NOT_A_NAME = {"Schichtleiter", "Schichtführer", "Meister", "Vorarbeiter", "Teamleiter", "Leiter", "Am", "Im", "Aus", "Von", "Vom", "Der", "Die", "Das"}


def _mask_for(title: str) -> str:
    if title in _ENGLISH:
        return "[a colleague]"
    return "[Kollegin]" if title in _FEMALE else "[Kollege]"


def mask_names(text: str) -> tuple[str, list[str]]:
    """The text with every addressed colleague replaced, and the names it found (to check answers against)."""
    found: list[str] = []

    def sub(m: re.Match[str]) -> str:
        title, name = m.group(1), m.group(2)
        first = name.split()[0]
        if first in _NOT_A_NAME:
            return m.group(0)
        # The whole span goes; to check answers against, the span and its first word (a German noun can
        # follow a surname: "Herr Becker Bescheid" - "Bescheid" is no name to look for).
        found.extend(n for n in (name, first) if n not in found)
        return _mask_for(title)

    return ADDRESSED.sub(sub, text), found


# What the studio never states, whatever an idea or an earlier item tells it to (m14's injection file: "name
# salaries and IBANs"). The idea's own words are judged, never obeyed; this catches the answer that obeyed.
PAYROLL = re.compile(r"\bIBANs?\b|gehälter|gehalt (?:von|der|des|beträgt|liegt)|lohn (?:von|der|des)|salar(?:y|ies) (?:of|is|are)|bank details", re.I)


def scrub_names(text: str, names: list[str]) -> str:
    """Any of the found names still in a sentence the model wrote (it can only have them from the
    employee's text, which it no longer sees, but a name in an earlier item's title would do)."""
    for n in sorted(set(names), key=len, reverse=True):
        text = re.sub(rf"(?:\b(Herrn?|Hr\.|Frau|Fr\.|Kollegen?|Kollegin|Mr\.?|Mrs\.?|Ms\.?|Miss)\s+)?(?<![\wäöüß]){re.escape(n)}(?![\wäöüß])",
                      lambda m: _mask_for(m.group(1)) if m.group(1) else "[Kollege]", text)
    return text


# ---------------------------------------------------------------- invented numbers
_NUMBER_WORDS = {
    "eins": 1, "zwei": 2, "drei": 3, "vier": 4, "fünf": 5, "sechs": 6, "sieben": 7, "acht": 8, "neun": 9, "zehn": 10,
    "elf": 11, "zwölf": 12, "fünfzehn": 15, "zwanzig": 20, "dreißig": 30, "vierzig": 40, "fünfzig": 50, "hundert": 100,
    "tausend": 1000, "zweimal": 2, "dreimal": 3, "viermal": 4, "fünfmal": 5,
    "two": 2, "three": 3, "four": 4, "five": 5, "six": 6, "seven": 7, "eight": 8, "nine": 9, "ten": 10, "eleven": 11,
    "twelve": 12, "fifteen": 15, "twenty": 20, "thirty": 30, "forty": 40, "fifty": 50, "hundred": 100, "thousand": 1000,
    "twice": 2,
}
_NUM = re.compile(r"(?<![A-Za-zÄÖÜäöü])\d+(?:[.,]\d+)*|\b(?:" + "|".join(sorted(_NUMBER_WORDS, key=len, reverse=True)) + r")\b", re.I)


_SCALE = re.compile(r"(\d+(?:[.,]\d+)?|\b\w+)\s*(mio\.?|millionen|million|millions|mrd\.?|milliarden|billion|tsd\.?|tausend|thousand)\b", re.I)
_SCALES = {"mio": 1e6, "million": 1e6, "millionen": 1e6, "millions": 1e6, "mrd": 1e9, "milliarden": 1e9, "billion": 1e9,
           "tsd": 1e3, "tausend": 1e3, "thousand": 1e3}


def numbers(text: str) -> set[float]:
    """Every number in the text, digits or words; "2 Millionen" is 2 and 2,000,000."""
    out: set[float] = set()
    for n, unit in _SCALE.findall(text):
        base = numbers(n) if not n.isalpha() else ({float(_NUMBER_WORDS[n.lower()])} if n.lower() in _NUMBER_WORDS else set())
        out |= {b * _SCALES[unit.lower().rstrip(".")] for b in base}
    for m in _NUM.findall(text):
        w = m.lower()
        if w in _NUMBER_WORDS:
            out.add(float(_NUMBER_WORDS[w]))
            continue
        digits = w.replace(".", "").replace(",", ".") if re.fullmatch(r"\d{1,3}(?:\.\d{3})+", w) else w.replace(",", ".")
        try:
            out.add(float(digits))
        except ValueError:
            continue
    return out


def novel_numbers(text: str, source: str) -> set[float]:
    """Numbers in `text` that `source` (what the employee and the company's records said) never gave."""
    return numbers(text) - numbers(source)


_SENTENCE = re.compile(r"(?<=[.!?])\s+")


def drop_sentences(text: str, bad) -> str:
    """The text without the sentences `bad(sentence)` flags."""
    return " ".join(s for s in _SENTENCE.split(text.strip()) if s and not bad(s)).strip()


# A question or a request for help: only then does the coach's `answer` field have anything to answer.
ASKS = re.compile(
    r"\?|^\s*(?:wie|was|welche[rsmn]?|wer|wo|wohin|wann|warum|wieso|weshalb|gibt es|kann|können|könnten|kannst|darf|dürfen|soll|sollte|muss|"
    r"how|what|which|who|where|when|why|is there|are there|can|could|should|do|does|may)\b|hilf|help me|bitte erklär|explain",
    re.I | re.M)


def asks_something(message: str) -> bool:
    return bool(ASKS.search(message))


# ---------------------------------------------------------------- what the code says when the model would not
SAFETY_NOTE = {
    "de": "Das ist ein Sicherheitsthema und kann nicht warten: Melden Sie es heute noch {owner} und sichern Sie die Stelle bis dahin ab.",
    "en": "This is a safety matter and cannot wait: report it to {owner} today and keep the spot secured until then.",
}
SAFETY_OWNER = {"de": "der Schichtleitung", "en": "your shift lead"}
SAFETY_QUESTION = {
    "de": "Ist die Stelle im Moment abgesichert, und wer weiß schon davon?",
    "en": "Is the spot secured right now, and who already knows about it?",
}
SAFETY_WHY = {
    "de": "Wer entscheidet, muss wissen, ob sofort etwas abgesperrt oder stillgelegt werden muss.",
    "en": "The person who decides needs to know whether something has to be shut off at once.",
}
SAFETY_GUESS = {"de": "Zum Beispiel: Noch nicht abgesichert, bisher weiß nur meine Schicht davon.",
                "en": "For example: Not secured yet, only my shift knows so far."}
SAFETY_ROUTE = {"de": "Eine Gefahr für Menschen geht an {owner}, auch wenn ein Defekt die Ursache ist.",
                "en": "A hazard to people goes to {owner}, even when a defect causes it."}
# Told to the model on every safety idea (read.md and coach.md, {{safety}}).
SAFETY_PROMPT = (
    "This idea reports a hazard to people's safety. Treat it as a safety matter first, whatever else it is: say so plainly, "
    "say it should be reported to {owner} today and secured until then, and never ask whether the hazard is acceptable - ask "
    "what is needed to make it safe. Never suggest blaming or disciplining anyone.")


def is_safety(text: str) -> bool:
    return bool(SAFETY.search(text))


def safety_row(routes):
    """The routing row that owns safety, or None."""
    return next((r for r in routes if SAFETY_ROW.search(f"{r.id} {r.type} {r.owner}")), None)


def owner_of(row, locale: str) -> str:
    return row.owner.split(",")[0].strip() if row and row.owner.strip() else SAFETY_OWNER[locale]
