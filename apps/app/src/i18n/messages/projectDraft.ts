// The project draft (plan SET, decision D4): a yes opens a draft that the lead sets up before it starts.
// SET-G1 registers the namespace; the other SET tasks add their keys here.
import { defineMessages } from "../define";

export const projectDraft = defineMessages({
  en: {
    title: "Draft",
    beingSetUp: "Accepted · being set up by {role}, start expected {date}",
  },
  de: {
    title: "Entwurf",
    beingSetUp: "Angenommen · wird von {role} aufgesetzt, Start geplant am {date}",
  },
});
