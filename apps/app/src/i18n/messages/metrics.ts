// Metrics: wait ledger and baseline (MET-G1 adds its keys here).
import { defineMessages } from "../define";

export const metrics = defineMessages({
  en: {
    csvName: "Unit or role",
    csvCases: "Cases",
    csvFirstReasonedAnswer: "First reasoned answer (days, median)",
    csvOnTime: "On time (%)",
    csvPastPromise: "Open cases past promise",
    csvEscalated: "Escalated",
    csvTooFew: "too few",
  },
  de: {
    csvName: "Einheit oder Rolle",
    csvCases: "Fälle",
    csvFirstReasonedAnswer: "Erste begründete Antwort (Tage, Median)",
    csvOnTime: "Rechtzeitig (%)",
    csvPastPromise: "Offene Fälle über Versprechen",
    csvEscalated: "Eskaliert",
    csvTooFew: "zu wenige",
  },
});
