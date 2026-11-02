// The AI part of a customer demo, as data (plan AID, D3). Every entry is a case of
// services/brain/eval/routing_cases.json (same id, lang, text; routeId = route_id).
// `offlineSafe` means the keyword router (features/routing `propose`) already routes it to
// `routeId` on acme's routes, so the demo still works with LLM_PROVIDER=mock. The offline-safe
// English questions come first: that is the demo's order. Runbook: docs/demo/AI_DEMO.md.
export type DemoAiQuestion = { id: string; lang: "de" | "en"; text: string; routeId: string; offlineSafe: boolean };

export const DEMO_AI_SCRIPT: readonly DemoAiQuestion[] = [
  { id: "q001", lang: "en", routeId: "r1", offlineSafe: true,
    text: "Our hand scanner broke and a new one costs about 250 euros, but the order needs three approvals." },
  { id: "q012", lang: "en", routeId: "r2", offlineSafe: true,
    text: "The endurance rig is booked solid by series validation; we need two days to test the new belt tensioner." },
  { id: "q023", lang: "en", routeId: "r3", offlineSafe: true,
    text: "Measurements on station 7 drift away from the reference gauge and we scrap good parts." },
  { id: "q041", lang: "de", routeId: "r4", offlineSafe: true,
    text: "Der neue Kollege hat nach drei Wochen immer noch keinen Zugang zum Fertigungssystem." },
  { id: "q030", lang: "de", routeId: "r3", offlineSafe: true,
    text: "Die Messwerte an Station 7 weichen vom Referenzmessgerät ab, wir sortieren gute Teile aus." },
  { id: "q008", lang: "de", routeId: "r1", offlineSafe: false,
    text: "Für ein Ersatzteil für 120 Euro brauche ich drei Unterschriften, das dauert länger als die Reparatur." }
];
