// The one inbox (plan INB): the page title, the groups of its list, the notices and their read mark.
import { defineMessages } from "../define";

export const inbox = defineMessages({
  en: {
    title: "Inbox",
    today: "Today",
    askDecide: "Decide",
    askConfirm: "Confirm",
    askPart: "Do my part",
    late: "Late",
    dueSoon: "Due soon",
    empty: "Nothing is waiting for you.",
    notices: "Notices",
    noticesEmpty: "No notices.",
    markRead: "Mark as read",
  },
  de: {
    title: "Eingang",
    today: "Heute",
    askDecide: "Entscheiden",
    askConfirm: "Bestätigen",
    askPart: "Meinen Teil tun",
    late: "Überfällig",
    dueSoon: "Bald fällig",
    empty: "Es wartet nichts auf Sie.",
    notices: "Mitteilungen",
    noticesEmpty: "Keine Mitteilungen.",
    markRead: "Als gelesen markieren",
  },
});
