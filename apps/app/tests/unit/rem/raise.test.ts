// Plan REM, REM-R1: the raise page publishes at the turn limit, sends the routing it showed, and names who holds a vacant desk.
import { createElement as h } from "react";
import { renderToStaticMarkup as html } from "react-dom/server";
import { expect, it } from "vitest";
import { DeskDialog, deskWho } from "@/components/ideas/RaisePublish";
import { PublishPreview } from "@/components/ideas/PublishPreview";
import type { Desk } from "@/features/ideas/desks";
import { MAX_TURNS, routingTextHash, turnLimitReached } from "@/features/ideas/drafts";
import { createT } from "@/i18n";
import { proposeOnRaise } from "@/server/routing";

const SLUG = "acme"; // the demo company: its seed answers without a database
const TITLE = "Shorter changeover on line 4";
const BODY = "We lose forty minutes at every changeover.";
const shown = (title = TITLE, body = BODY) => ({ routeId: "r1", confidence: 77, source: "llm" as const, version: "prompt-9", textHash: routingTextHash(title, body) });
const raised = (proposal: unknown, body = BODY) => ({ title: TITLE, body, proposal }) as Parameters<typeof proposeOnRaise>[2];

const desk = (over: Partial<Desk> = {}): Desk => ({
  roleId: "role-qa", routeId: "r1", title: "Quality lead", dept: "QA", type: "Quality", holders: [], vacant: true, deputies: [], answer: null,
  proposedBy: "keywords", reasons: [], recommended: true, ...over,
});

it("REM raise publishes at the turn limit", () => {
  // The turn route refuses one more pair at this count; from there the rail counts as done.
  expect(turnLimitReached(MAX_TURNS - 4)).toBe(false);
  expect(turnLimitReached(MAX_TURNS - 2)).toBe(false);
  expect(turnLimitReached(MAX_TURNS - 1)).toBe(true);
  expect(turnLimitReached(MAX_TURNS)).toBe(true);
  expect(MAX_TURNS).toBe(40);
});

it("REM raise lists open points", () => {
  const look = { title: TITLE, description: "d", context: "", prompts: [] };
  const base = { look, onLook: () => {}, affected: [], depts: [], onAffected: () => {}, files: [], onAddFiles: () => {}, onRemoveFile: () => {}, aiLine: "x", onClose: () => {}, onConfirm: () => {}, onExport: () => {} };
  const open = html(h(PublishPreview, { ...base, stillOpen: ["What it costs", "Who is affected"] }));
  expect(open).toContain('data-testid="raise-still-open"');
  expect(open).toContain("Still open");
  expect(open).toContain("What it costs");
  expect(open).toContain("Who is affected");
  // Nothing open, nothing drawn.
  expect(html(h(PublishPreview, { ...base, stillOpen: [] }))).not.toContain("raise-still-open");
  expect(html(h(PublishPreview, base))).not.toContain("raise-still-open");
});

it("REM raise reuses the shown routing", async () => {
  const stored = await proposeOnRaise(SLUG, "co", raised(shown()));
  // The proposal the raiser saw, as it was: the brain's source and version, not the keyword router's. The fingerprint is not stored.
  expect(stored).toMatchObject({ routeId: "r1", confidence: 77, source: "llm", version: "prompt-9" });
  expect(stored).not.toHaveProperty("textHash");
  // Without the fingerprint, or for a route the company does not have, or out of range: not trusted.
  const bare: Partial<ReturnType<typeof shown>> = shown();
  delete bare.textHash;
  expect((await proposeOnRaise(SLUG, "co", raised(bare))).source).toBe("keywords");
  expect((await proposeOnRaise(SLUG, "co", raised({ ...shown(), routeId: "r-unknown" }))).source).toBe("keywords");
  expect((await proposeOnRaise(SLUG, "co", raised({ ...shown(), confidence: 900 }))).source).toBe("keywords");
});

it("REM raise asks again after an edit", async () => {
  // The raiser edited the text after the routing was shown: the fingerprint no longer fits, so the server asks (here: no brain, the keywords).
  const stored = await proposeOnRaise(SLUG, "co", raised(shown(), BODY + " It also hits line 5."));
  expect(stored.source).toBe("keywords");
  expect(stored.confidence).not.toBe(77);
  expect(stored).not.toHaveProperty("textHash");
  // Whitespace alone is no edit.
  expect(routingTextHash(TITLE, BODY)).toBe(routingTextHash(`  ${TITLE} `, BODY.replace(" ", "  ")));
  expect(routingTextHash(TITLE, BODY)).not.toBe(routingTextHash(TITLE, BODY + "!"));
});

it("REM raise vacant desk names the seat above", () => {
  const en = createT("en");
  const de = createT("de");
  const above = desk({ answer: { why: "above", names: ["K. Head"] } });
  expect(deskWho(above, en)).toBe("Vacant - goes to K. Head");
  expect(deskWho(above, de)).toBe("Frei - geht an K. Head");
  // The deputy role's holders come first; a desk nobody can answer for still says it waits; a held desk names its holders.
  expect(deskWho(desk({ deputies: ["H. Sander"], answer: { why: "vacant", names: ["H. Sander"] } }), en)).toBe("Vacant - goes to H. Sander");
  expect(deskWho(desk(), en)).toBe("Vacant - waits until someone sits here");
  expect(deskWho(desk({ vacant: false, holders: ["T. Vogel", "N. Keller"] }), en)).toBe("T. Vogel, N. Keller");
  // And the dialog's row shows it.
  const page = html(h(DeskDialog, { desks: [above], aiOff: false, search: () => [], work: null, sent: null, casesHref: "/team", onCancel: () => {}, onConfirm: () => {} }));
  expect(page).toContain("Vacant - goes to K. Head");
});
