// Plan LNG, LNG-S1: what a person sees from the connectors (the Microsoft 365 card on the profile).
import { defineMessages } from "../define";

export const connectors = defineMessages({
  en: {
    m365Connected: "Connected. When you ask the assistant, it can now search the files you can open in Microsoft 365.",
    m365Disconnected: "Disconnected. NextUp no longer holds any access to your Microsoft 365 files.",
  },
  de: {
    m365Connected: "Verbunden. Wenn Sie den Assistenten fragen, kann er jetzt die Dateien durchsuchen, die Sie in Microsoft 365 öffnen können.",
    m365Disconnected: "Getrennt. NextUp hat keinen Zugriff mehr auf Ihre Microsoft-365-Dateien.",
  },
});
