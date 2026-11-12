// Plan REM, REM-I1: the inbox says who passed a case and why, and unread comments reach the inbox and the digest.
import { expect, it } from "vitest";
import { inboxCounts, inboxItems } from "@/features/inbox";
import { digestFor } from "@/features/notify/digest";
import { createT } from "@/i18n";
import { SEATS, ev, handed, inboxInput, raise, stateOf } from "../ovl/fixture";

const BASE = "https://app.test/acme";
const FLAGS = { projects: true, discussion: true };
const comment = (id: string, by: string, text: string, day: number) => ev("case.commented", by, id, { text }, day);
const itemsOf = (events: ReturnType<typeof raise>[], userId: string, day: number) => {
  const state = stateOf(day, events);
  return inboxItems({ ...inboxInput(state, userId, day), events });
};

it("REM inbox names who passed and why", () => {
  const events = [raise("c1", 0), ev("case.handed", "u_own", "c1", { to: "H. Sander", toRoleHolderId: "s_dep", why: "Line 4 is yours" }, 1)];
  const item = itemsOf(events, "u_dep", 1).find((i) => i.id === "case:c1");
  expect(item?.cause).toBe("passed");
  expect(item?.fromRole).toBe("Quality lead");
  expect(item?.why).toBe("Line 4 is yours");
  // The page's line, in both languages.
  const en = createT("en");
  const de = createT("de");
  expect(en("inbox.passedBy", { role: item!.fromRole!, why: item!.why! })).toBe("Passed to you by Quality lead: Line 4 is yours");
  expect(de("inbox.passedBy", { role: "Qualitätsleitung", why: "Linie 4 ist Ihre" })).toBe("Von Qualitätsleitung an Sie weitergegeben: Linie 4 ist Ihre");
  // The clock's hand-over is no person's pass: no role and no reason (its reason is a code).
  const byClock = [raise("c2", 0), handed("c2", "s_dep", "deadline", 1)];
  const clocked = itemsOf(byClock, "u_dep", 1).find((i) => i.id === "case:c2");
  expect(clocked?.cause).toBe("passed");
  expect(clocked?.fromRole).toBeUndefined();
  expect(clocked?.why).toBeUndefined();
});

it("REM inbox lists a comment once per case", () => {
  const events = [raise("c3", 0), comment("c3", "u_own", "First", 1), comment("c3", "u_own2", "Second", 1)];
  const raiser = itemsOf(events, "u_ra", 1).filter((i) => i.kind === "comment");
  expect(raiser).toHaveLength(1);
  expect(raiser[0]).toMatchObject({ id: "comment:c3", caseId: "c3", ask: "part", count: 2, href: "/cases/c3" });
  // Somebody who follows the case in no way gets nothing.
  expect(itemsOf(events, "u_plant", 1).filter((i) => i.kind === "comment")).toEqual([]);
  // The system's raise note is no comment.
  const note = [raise("c4", 0), ev("case.commented", null, "c4", { text: "Notice sent", channel: "mail" }, 1, "system:mail")];
  expect(itemsOf(note, "u_ra", 1).filter((i) => i.kind === "comment")).toEqual([]);
});

it("REM inbox skips the viewer's own comment", () => {
  const own = [raise("c5", 0), comment("c5", "u_ra", "Mine", 1)];
  expect(itemsOf(own, "u_ra", 1).filter((i) => i.kind === "comment")).toEqual([]);
  // What came before the viewer's own comment is seen; what came after is new.
  const after = [raise("c6", 0), comment("c6", "u_own", "Before", 1), comment("c6", "u_ra", "Reply", 2), comment("c6", "u_own", "After", 3)];
  expect(itemsOf(after, "u_ra", 3).filter((i) => i.kind === "comment").map((i) => i.count)).toEqual([1]);
  // No events given, no row.
  const state = stateOf(3, after);
  expect(inboxItems(inboxInput(state, "u_ra", 3)).filter((i) => i.kind === "comment")).toEqual([]);
});

it("REM inbox digest lists comments", () => {
  const events = [raise("c7", 0), comment("c7", "u_own", "Please check", 1)];
  const state = stateOf(1, events);
  const d = digestFor("u_ra", state, SEATS, "en", BASE, { flags: FLAGS, events });
  expect(d).not.toBeNull();
  expect((d!.data as { itemIds: string[] }).itemIds).toContain("comment:c7");
  expect(d!.text).toContain("Case c7 - 1 new comment");
  expect(d!.text).toContain(`${BASE}/cases/c7`);
  const de = digestFor("u_ra", state, SEATS, "de", BASE, { flags: FLAGS, events });
  expect(de!.text).toContain("Case c7 - 1 neuer Kommentar");
  // Without the log there is nothing to list.
  expect(digestFor("u_ra", state, SEATS, "en", BASE, { flags: FLAGS })).toBeNull();
});

it("REM inbox badge counts a case once", () => {
  // A case on the viewer's desk with a comment on it is the one row to decide.
  const onDesk = [raise("c8", 0), comment("c8", "u_ra", "More detail", 1)];
  const desk = itemsOf(onDesk, "u_own", 1);
  expect(desk.map((i) => i.id)).toEqual(["case:c8"]);
  expect(inboxCounts(desk).total).toBe(1);
  // The raiser of a case that is asked a question has the question row, not a second one for the comment.
  const asked = [raise("c9", 0), ev("case.asked", "u_own", "c9", { text: "Which line?" }, 1), comment("c9", "u_own", "See my question", 1)];
  const raiser = itemsOf(asked, "u_ra", 1);
  expect(raiser.filter((i) => i.caseId === "c9").map((i) => i.id)).toEqual(["question:c9"]);
  expect(inboxCounts(raiser).total).toBe(1);
});
