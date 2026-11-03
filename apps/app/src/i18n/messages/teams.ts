// Microsoft Teams: cards and bot replies (TMS D3). Grows with TMS-A1 ... -F1.
// The cards are built in features/teams/cards.ts; the bot reply texts are used by the endpoint tasks.
import { defineMessages } from "../define";

export const teams = defineMessages({
  en: {
    notSetUp: "Microsoft Teams is not set up for this company.",

    // ── bot replies (TMS-A1, -C1, -D1)
    welcome: "Hello. I am NextUp. I tell you when a case lands on your desk, and you can answer or hand it over right here. To raise a case, use ⋯ › NextUp › Raise a case.",
    howToRaise: "I cannot read free text. To raise a case, use ⋯ › NextUp › Raise a case in the compose box, or ⋯ › More actions › Raise as a case in NextUp on a message.",
    refused: "That did not go through: {reason}",
    refusedAnswered: "This case was already answered by {name} at {time}.",
    refusedSeat: "You no longer sit in this case's seat.",
    teamsOff: "Microsoft Teams is switched off for this company.",
    notLinked: "Not signed in to NextUp at {company}. Open NextUp once to connect Teams.",
    raisedTask: "Raised: {title}",

    // ── header kind lines
    kindRaised: "New case on your desk",
    kindDeadlineDesk: "Past the promise",
    kindDeadlineEscalation: "Escalated to you",
    kindConfirmed: "Raised",
    kindDone: "Done",
    kindNotSetUp: "Not set up",

    // ── facts
    factFrom: "From",
    factRoute: "Route",
    factAnswerBy: "Answer by",
    factDeputy: "Deputy",
    factRaised: "Raised",
    factWasDue: "Was due",
    factSeenBy: "Seen by",
    answerByValue_one: "{date} ({count} working day)",
    answerByValue_other: "{date} ({count} working days)",
    late_one: "{count} day late",
    late_other: "{count} days late",

    // ── reminder sentences
    sentenceDesk: "This case passed the {days}-day promise. From today {role} sees it too.",
    sentenceEscalation: "{role} did not answer within the {days}-day promise. It is on your desk too.",

    // ── actions
    actionAnswer: "Answer",
    actionHandOver: "Hand over",
    actionOpen: "Open in NextUp",
    actionSayYes: "Say yes in NextUp",

    // ── the answer form
    answerLabel: "Your answer",
    choiceYes: "Yes",
    choiceNo: "No",
    choiceAsk: "Ask a question",
    textLabel: "Reason or question",
    textHint: "Needed for no and for a question.",
    errorNoText: "Say why, so the person who raised it understands.",
    errorNoQuestion: "Write your question.",
    ideaLine: "A yes starts a project with a lead and steps. Say yes in NextUp.",
    sendAnswer: "Send answer",

    // ── the hand-over form
    handOverLabel: "Hand over to",
    searchPlaceholder: "Search a role…",
    whyLabel: "Why (the next desk reads it)",
    handOverHint: "The clock keeps running.",
    handOverButton: "Hand over",
    tooManyRoles: "More than 150 roles: hand it over in NextUp.",

    // ── result lines
    resultYes: "You answered yes · {time}",
    resultNo: "You said no · {time}",
    resultAsk: "You asked a question · {time}",
    resultHanded: "You handed it to {role} · {time}",
    resultAnsweredBy: "Answered by {name} · {time}",

    // ── raise a case (task module)
    raiseTitle: "Raise a case",
    raiseMessageAction: "Raise as a case in NextUp",
    kindLabel: "What is it?",
    kindProblem: "A problem",
    kindIdea: "An idea",
    titleLabel: "In a few words",
    bodyLabel: "What happened",
    visibilityLabel: "Who may see it",
    visibilityEveryone: "Everyone at {company}",
    visibilityPrivate: "Only me and the desk it lands on",
    next: "Next",
    errorNoTitle: "Write a few words.",

    // ── confirmation
    confirmSentence: "It is on the desk of {role}. You get the answer here and by mail.",
    seenByEveryone: "Everyone at {company}",
    seenByPrivate: "Only you and the desk",
    sandboxLine: "Sandbox: the case is saved, but nobody is told yet.",
  },
  de: {
    notSetUp: "Microsoft Teams ist für diese Firma nicht eingerichtet.",

    welcome: "Hallo. Ich bin NextUp. Ich sage dir Bescheid, wenn ein Fall auf deinem Tisch landet, und du kannst ihn gleich hier beantworten oder weitergeben. Einen Fall reichst du über ⋯ › NextUp › Fall einreichen ein.",
    howToRaise: "Freien Text kann ich nicht lesen. Einen Fall reichst du über ⋯ › NextUp › Fall einreichen im Schreibfeld ein, oder bei einer Nachricht über ⋯ › Weitere Aktionen › Als Fall in NextUp einreichen.",
    refused: "Das hat nicht geklappt: {reason}",
    refusedAnswered: "Dieser Fall wurde schon von {name} um {time} beantwortet.",
    refusedSeat: "Du sitzt nicht mehr auf dem Platz dieses Falls.",
    teamsOff: "Microsoft Teams ist für diese Firma ausgeschaltet.",
    notLinked: "Nicht bei NextUp von {company} angemeldet. Öffne NextUp einmal, um Teams zu verbinden.",
    raisedTask: "Eingereicht: {title}",

    kindRaised: "Neuer Fall auf deinem Tisch",
    kindDeadlineDesk: "Frist überschritten",
    kindDeadlineEscalation: "An dich eskaliert",
    kindConfirmed: "Eingereicht",
    kindDone: "Erledigt",
    kindNotSetUp: "Nicht eingerichtet",

    factFrom: "Von",
    factRoute: "Zuständigkeit",
    factAnswerBy: "Antwort bis",
    factDeputy: "Vertretung",
    factRaised: "Eingereicht",
    factWasDue: "Fällig am",
    factSeenBy: "Sichtbar für",
    answerByValue_one: "{date} ({count} Arbeitstag)",
    answerByValue_other: "{date} ({count} Arbeitstage)",
    late_one: "{count} Tag überfällig",
    late_other: "{count} Tage überfällig",

    sentenceDesk: "Dieser Fall hat das Versprechen von {days} Tagen überschritten. Ab heute sieht ihn auch {role}.",
    sentenceEscalation: "{role} hat nicht innerhalb des Versprechens von {days} Tagen geantwortet. Er liegt jetzt auch auf deinem Tisch.",

    actionAnswer: "Antworten",
    actionHandOver: "Weitergeben",
    actionOpen: "In NextUp öffnen",
    actionSayYes: "In NextUp Ja sagen",

    answerLabel: "Deine Antwort",
    choiceYes: "Ja",
    choiceNo: "Nein",
    choiceAsk: "Frage stellen",
    textLabel: "Begründung oder Frage",
    textHint: "Nötig bei Nein und bei einer Frage.",
    errorNoText: "Sag, warum - damit die einreichende Person es versteht.",
    errorNoQuestion: "Schreib deine Frage.",
    ideaLine: "Ein Ja startet ein Projekt mit Leitung und Schritten. Sag Ja in NextUp.",
    sendAnswer: "Antwort senden",

    handOverLabel: "Weitergeben an",
    searchPlaceholder: "Rolle suchen…",
    whyLabel: "Warum (der nächste Tisch liest es)",
    handOverHint: "Die Uhr läuft weiter.",
    handOverButton: "Weitergeben",
    tooManyRoles: "Mehr als 150 Rollen: Gib ihn in NextUp weiter.",

    resultYes: "Du hast mit Ja geantwortet · {time}",
    resultNo: "Du hast Nein gesagt · {time}",
    resultAsk: "Du hast eine Frage gestellt · {time}",
    resultHanded: "Du hast ihn an {role} weitergegeben · {time}",
    resultAnsweredBy: "Beantwortet von {name} · {time}",

    raiseTitle: "Fall einreichen",
    raiseMessageAction: "Als Fall in NextUp einreichen",
    kindLabel: "Was ist es?",
    kindProblem: "Ein Problem",
    kindIdea: "Eine Idee",
    titleLabel: "In wenigen Worten",
    bodyLabel: "Was ist passiert",
    visibilityLabel: "Wer es sehen darf",
    visibilityEveryone: "Alle bei {company}",
    visibilityPrivate: "Nur ich und der Tisch, auf dem er landet",
    next: "Weiter",
    errorNoTitle: "Schreib ein paar Worte.",

    confirmSentence: "Er liegt auf dem Tisch von {role}. Die Antwort bekommst du hier und per Mail.",
    seenByEveryone: "Alle bei {company}",
    seenByPrivate: "Nur du und der Tisch",
    sandboxLine: "Sandbox: Der Fall ist gespeichert, aber noch wird niemand benachrichtigt.",
  },
});
