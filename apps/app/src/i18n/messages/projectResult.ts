// Phase RES, "A result that closes properly" (plan REG, decision D13): the namespace is registered here, empty but for its title.
// RES adds its keys to this file only; its mail and notice texts live here too, never in `mail`.
import { defineMessages } from "../define";

export const projectResult = defineMessages({
  en: {
    title: "A result that closes properly",
  },
  de: {
    title: "Ein Ergebnis, das sauber abschliesst",
  },
});
