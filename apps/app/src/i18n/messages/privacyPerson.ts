// One person's data (GDP D3). Keys are added by the tasks that build the pages.
import { defineMessages } from "../define";

export const privacyPerson = defineMessages({
  en: {
    pseudonym: "Former member #{n}",
    refusedNotAllowed: "Only an admin of this company can do that.",
    refusedNotFound: "No such person in this company.",
    refusedActive: "This person is still active. Deactivate them first.",
    refusedSelf: "You can't pseudonymise yourself. Ask another admin.",
    refusedHoldsSeat: "This person still holds a seat. Free the seat first.",
    refusedAlready: "This person is already pseudonymised.",
    refusedNameMismatch: "The name you typed does not match.",
  },
  de: {
    pseudonym: "Ehemaliges Mitglied #{n}",
    refusedNotAllowed: "Das können nur Admins dieser Firma.",
    refusedNotFound: "Diese Person gibt es in dieser Firma nicht.",
    refusedActive: "Diese Person ist noch aktiv. Deaktiviere sie zuerst.",
    refusedSelf: "Du kannst dich nicht selbst pseudonymisieren. Bitte einen anderen Admin.",
    refusedHoldsSeat: "Diese Person hat noch einen Sitz. Gib den Sitz zuerst frei.",
    refusedAlready: "Diese Person ist bereits pseudonymisiert.",
    refusedNameMismatch: "Der eingegebene Name stimmt nicht überein.",
  },
});
