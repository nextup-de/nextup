// Phase MOV, "A project that keeps moving" (plan REG, decision D13): the namespace is registered here.
// MOV adds its keys to this file only; its mail and notice texts live here too, never in `mail`.
// MOV-G1 holds the keys more than one task shows (the inbox lines, the weekly draft, the rights errors); MOV-E1 adds the
// mail and reminder texts and MOV-U1 its page texts below.
import { defineMessages } from "../define";

export const projectMove = defineMessages({
  en: {
    title: "A project that keeps moving",
    // Who holds a project or a step when nobody does.
    noLead: "No lead",
    noOwner: "No owner",
    // The inbox lines of the three asks (D28).
    itemStalled: "{label} has had no progress: move it on",
    itemVacant: "{label} has no lead: name one",
    itemUpdate: "Weekly update for {label}",
    // The weekly update's draft, built from the board (D21).
    weeklyHeading: "This week on {label}",
    weeklyAdded: "Added: {steps}",
    weeklyMoved: "Moved on: {steps}",
    weeklyDone: "Done: {steps}",
    weeklyBlocked: "Blocked: {steps}",
    weeklyNothing: "Nothing moved on the board this week.",
    // The reasons the server gives when it refuses a MOV event.
    permSponsorOrLead: "Only the project's lead, its sponsor or a manager can do this.",
    permDoneByOnce: "The lead has already moved the done-by date once: ask the sponsor or a manager to move it again.",
    permDoneByDay: "Pick a done-by working day after today.",
    permWhy: "Say why in a few words (up to 400 characters).",
    permPauseDays: "A pause must end after today and at most 20 working days from now.",
    permPaused: "This project is already paused: resume it first.",
    permNotPaused: "This project is not paused.",
    permRunningOnly: "This only works on a project that is running.",
    permBlockedWhy: "Say why the step is blocked (up to 400 characters).",
    permCheckInDay: "Pick a weekday from Monday to Friday for the weekly check-in.",
    permHowNote: "Keep the note to 400 characters or fewer.",
    permUpdateText: "Write the update in 1 to 4000 characters.",
    permUpdateWeek: "The update must belong to the current weekly check-in.",
    permLeadPresent: "This project still has a lead: hand it over instead.",
    permNameLead: "Name the person who leads the project from now on.",
    permLeadTarget: "Pick a person who can lead the project.",
    permSystemOnly: "Only the system writes this event.",
  },
  de: {
    title: "Ein Projekt, das in Bewegung bleibt",
    noLead: "Keine Leitung",
    noOwner: "Niemand zuständig",
    itemStalled: "{label} kommt nicht voran: bring es wieder in Bewegung",
    itemVacant: "{label} hat keine Leitung: bestimme eine",
    itemUpdate: "Wochenupdate für {label}",
    weeklyHeading: "Diese Woche bei {label}",
    weeklyAdded: "Neu: {steps}",
    weeklyMoved: "Weitergekommen: {steps}",
    weeklyDone: "Erledigt: {steps}",
    weeklyBlocked: "Blockiert: {steps}",
    weeklyNothing: "Auf dem Board hat sich diese Woche nichts bewegt.",
    permSponsorOrLead: "Das können nur die Projektleitung, der Sponsor oder eine Führungskraft.",
    permDoneByOnce: "Die Leitung hat das Fertig-bis-Datum schon einmal verschoben: Bitte den Sponsor oder eine Führungskraft, es erneut zu verschieben.",
    permDoneByDay: "Wähle einen Arbeitstag nach heute als Fertig-bis-Datum.",
    permWhy: "Sag in ein paar Worten, warum (höchstens 400 Zeichen).",
    permPauseDays: "Eine Pause muss nach heute enden, höchstens 20 Arbeitstage ab jetzt.",
    permPaused: "Dieses Projekt ist schon pausiert: Nimm es zuerst wieder auf.",
    permNotPaused: "Dieses Projekt ist nicht pausiert.",
    permRunningOnly: "Das geht nur bei einem laufenden Projekt.",
    permBlockedWhy: "Sag, warum der Schritt blockiert ist (höchstens 400 Zeichen).",
    permCheckInDay: "Wähle einen Wochentag von Montag bis Freitag für den wöchentlichen Check-in.",
    permHowNote: "Halte die Notiz auf höchstens 400 Zeichen.",
    permUpdateText: "Schreibe das Update mit 1 bis 4000 Zeichen.",
    permUpdateWeek: "Das Update muss zum aktuellen wöchentlichen Check-in gehören.",
    permLeadPresent: "Dieses Projekt hat noch eine Leitung: Übergib es stattdessen.",
    permNameLead: "Nenne die Person, die das Projekt ab jetzt leitet.",
    permLeadTarget: "Wähle eine Person, die das Projekt leiten kann.",
    permSystemOnly: "Dieses Ereignis schreibt nur das System.",
  },
});
