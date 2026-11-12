// REG-E1: what MOV and NOR need in the inbox and the catalog exists, unused (plan REG, decisions D12 and D13).
import { describe, expect, it } from "vitest";
import { meFor, type SeatRow } from "@/features/auth/identity";
import type { State } from "@/features/cases/reducer";
import { inboxItems, type InboxInput, type InboxItem, type InboxKind } from "@/features/inbox";
import { projectMoveItems } from "@/features/inbox/sources/project-move";
import { createT } from "@/i18n";

const seats: SeatRow[] = [{ id: "seat_tv", roleId: "role_owner", label: "T. Vogel", userId: "u_tv", sort: 0 }];
// A literal state with one open case on the viewer's desk: no reduce(), so a reducer change cannot move it (D5).
const state = {
  day: 2, ideas: [], problems: [], projects: [], seats, routes: [],
  cases: [{ id: "c_a", title: "Printer broken", open: true, status: "open", assigneeRoleId: "role_owner", assigneeSeatId: "seat_tv", escalated: null, raisedDay: 0, dueDay: 5, fromUserId: "u_raiser", linkedIdea: null, history: [], discussion: null }],
} as unknown as State;
const input: InboxInput = { state, me: meFor("u_tv", seats), seats, today: 2, demo: false, flags: { projects: true, discussion: true } };

describe("REG inbox and namespaces", () => {
  it("InboxKind has the four new kinds and an item can carry a cause", () => {
    const kinds: InboxKind[] = ["stalled", "vacant", "update", "appeal"];
    const item: InboxItem = {
      id: "case:c_a", ask: "decide", kind: "case", caseId: "c_a", title: "Printer broken", href: "/inbox?id=c_a", dueDay: 5, late: false, dueSoon: false,
      pinned: false, deskRoleId: "role_owner", cause: "passed",
    };
    expect(kinds).toHaveLength(4);
    expect(item.cause).toBe("passed");
    const causes: NonNullable<InboxItem["cause"]>[] = ["reopened", "passed", "back", "up", "moved"];
    expect(causes).toHaveLength(5);
  });

  it("projectMoveItems lists nothing until MOV fills it, and inboxItems gives the same items as before", () => {
    expect(projectMoveItems(input)).toEqual([]);
    const items = inboxItems(input);
    expect(items.map((i) => [i.id, i.kind, i.ask])).toEqual([["case:c_a", "case", "decide"]]);
    for (const kind of ["stalled", "vacant", "update", "appeal"]) expect(items.some((i) => i.kind === kind), kind).toBe(false);
  });

  it("each of the seven namespaces has a title in German and English", () => {
    const en = createT("en");
    const de = createT("de");
    const titles = {
      projectMove: ["A project that keeps moving", "Ein Projekt, das in Bewegung bleibt"],
      caseNo: ["The reasoned no", "Das begründete Nein"],
      caseSee: ["The raiser sees the whole way", "Wer meldet, sieht den ganzen Weg"],
      projectResult: ["A result that closes properly", "Ein Ergebnis, das sauber abschliesst"],
      projectAgent: ["Orchestrator", "Orchestrator"],
      approvals: ["Review and approvals", "Prüfung und Freigaben"],
      overload: ["Overload and absence", "Überlastung und Abwesenheit"],
    } as const;
    for (const [ns, [e, d]] of Object.entries(titles)) {
      expect(en(`${ns}.title` as never), ns).toBe(e);
      expect(de(`${ns}.title` as never), ns).toBe(d);
    }
  });
});
