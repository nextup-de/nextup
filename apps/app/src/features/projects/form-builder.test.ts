import { expect, it } from "vitest";
import { reduce } from "@/features/cases/reducer";
import { mayAppend } from "@/features/cases/permissions";
import { meFor } from "@/features/auth/identity";
import { builderReducer, canSave, canShare, draftJson, FORM_LIMITS, initialBuilder, isDirty, parseDraft, problemsOf, toFormSaved, type BuilderAction, type BuilderState } from "@/features/projects/form-builder";
import { ev, logOf, SEATS, SEED, startedLog } from "./project-fixture";

const run = (s: BuilderState, ...actions: BuilderAction[]): BuilderState => actions.reduce(builderReducer, s);
const blank = () => initialBuilder(null, "fm");
const ids = (s: BuilderState) => s.fields.map((f) => f.id);
const filled = () => run(blank(), { type: "title", value: "Ask us" }, { type: "add", id: "a", kind: "short" }, { type: "label", id: "a", value: "What?" });

it("REQ builder adds, edits, reorders, duplicates and deletes questions", () => {
  let s = run(blank(), { type: "add", id: "a", kind: "short" }, { type: "add", id: "b", kind: "choice" }, { type: "add", id: "c", kind: "date" });
  expect(ids(s)).toEqual(["a", "b", "c"]);
  expect(s.selected).toBe("c");
  expect(s.fields[1].options).toEqual(["", ""]);
  s = run(s, { type: "label", id: "a", value: "  Name  " }, { type: "required", id: "a", value: true });
  expect(s.fields[0]).toMatchObject({ label: "  Name  ", required: true });
  s = run(s, { type: "move", id: "c", by: -1 }, { type: "move", id: "a", by: -1 });
  expect(ids(s)).toEqual(["a", "c", "b"]);
  s = run(s, { type: "duplicate", id: "a", newId: "a2" });
  expect(ids(s)).toEqual(["a", "a2", "c", "b"]);
  expect(s.fields[1]).toMatchObject({ kind: "short", required: true });
  expect(s.selected).toBe("a2");
  s = run(s, { type: "remove", id: "a2" });
  expect(ids(s)).toEqual(["a", "c", "b"]);
  expect(s.selected).toBe("c");
  expect(run(s, { type: "remove", id: "nope" })).toBe(s);
});

it("REQ builder keeps to the limits of D4: 20 questions, 80, 200, 1000 characters, 2 to 12 options", () => {
  let s = blank();
  for (let k = 0; k < 25; k++) s = run(s, { type: "add", id: "q" + k, kind: "short" });
  expect(s.fields).toHaveLength(FORM_LIMITS.fields);
  expect(run(s, { type: "duplicate", id: "q0", newId: "x" }).fields).toHaveLength(FORM_LIMITS.fields);
  s = run(s, { type: "title", value: "t".repeat(100) }, { type: "intro", value: "i".repeat(1100) }, { type: "label", id: "q0", value: "l".repeat(300) });
  expect([s.title.length, s.intro.length, s.fields[0].label.length]).toEqual([80, 1000, 200]);
  let c = run(blank(), { type: "add", id: "c", kind: "choice" });
  for (let k = 0; k < 15; k++) c = run(c, { type: "addOption", id: "c" });
  expect(c.fields[0].options).toHaveLength(FORM_LIMITS.optionsMax);
  c = run(c, { type: "option", id: "c", index: 0, value: "o".repeat(100) });
  expect(c.fields[0].options?.[0]).toHaveLength(FORM_LIMITS.option);
  for (let k = 0; k < 15; k++) c = run(c, { type: "removeOption", id: "c", index: 0 });
  expect(c.fields[0].options).toHaveLength(FORM_LIMITS.optionsMin);
  expect(run(blank(), { type: "add", id: "s", kind: "short" }, { type: "addOption", id: "s" }).fields[0].options).toBeUndefined();
});

it("REQ builder Save needs a title and one question, and the event budget holds", () => {
  expect(problemsOf(blank())).toEqual(["title", "noQuestion"]);
  const titled = run(blank(), { type: "title", value: "Ask" });
  expect(problemsOf(titled)).toEqual(["noQuestion"]);
  const unlabelled = run(titled, { type: "add", id: "a", kind: "short" });
  expect(problemsOf(unlabelled)).toEqual(["label"]);
  const choice = run(titled, { type: "add", id: "c", kind: "choice" }, { type: "label", id: "c", value: "Pick" }, { type: "option", id: "c", index: 0, value: "A" });
  expect(problemsOf(choice)).toEqual(["options"]);
  expect(canSave(run(choice, { type: "option", id: "c", index: 1, value: "B" }))).toBe(true);
  expect(canSave(filled())).toBe(true);
  let big = run(blank(), { type: "title", value: "Big" });
  for (let k = 0; k < 20; k++) {
    big = run(big, { type: "add", id: "q" + k, kind: "choice" }, { type: "label", id: "q" + k, value: "l".repeat(200) });
    for (let o = 0; o < 12; o++) big = run(big, { type: "option", id: "q" + k, index: o, value: "o".repeat(80) }, { type: "addOption", id: "q" + k });
  }
  expect(problemsOf(big)).toContain("tooBig");
  expect(canSave(big)).toBe(false);
});

it("REQ builder saves what the rights accept, trimmed, and nothing the server would refuse", () => {
  const s = run(filled(), { type: "add", id: "c", kind: "choice" }, { type: "label", id: "c", value: " Pick " }, { type: "option", id: "c", index: 0, value: " A " }, { type: "option", id: "c", index: 1, value: "B" }, { type: "addOption", id: "c" });
  const payload = toFormSaved(s);
  expect(payload.fields[1]).toEqual({ id: "c", kind: "choice", label: "Pick", required: false, options: ["A", "B"] });
  const state = reduce(SEED, logOf(startedLog().concat(ev("project.step.added", "L. Brandt", "p_one", { stepId: "s1", text: "x" }, 11)), 20));
  const verdict = mayAppend({ role: "member", userId: "u_lb", me: meFor("u_lb", SEATS), name: "L. Brandt", handle: null }, { type: "project.form.saved", target: "p_one", payload }, state);
  expect(verdict.ok).toBe(true);
  expect(toFormSaved(s, true).shared).toBe(true);
});

it("REQ builder knows unsaved changes, and sharing needs a saved form", () => {
  const fresh = blank();
  expect(isDirty(fresh)).toBe(false);
  expect(canShare(fresh)).toBe(false);
  const edited = filled();
  expect(isDirty(edited)).toBe(true);
  expect(canShare(edited)).toBe(false);
  const saved = builderReducer(edited, { type: "saved" });
  expect(isDirty(saved)).toBe(false);
  expect(canShare(saved)).toBe(true);
  expect(isDirty(run(saved, { type: "label", id: "a", value: "Why?" }))).toBe(true);
  const existing = initialBuilder({ id: "f9", title: "T", intro: "", fields: [{ id: "a", kind: "short", label: "Q", required: false }], shared: true, rev: 2, revisions: [] }, "unused");
  expect([existing.formId, canShare(existing), isDirty(existing)]).toEqual(["f9", true, false]);
});

it("REQ builder keeps an unsaved draft in the browser and rejects a stranger's", () => {
  const draft = filled();
  const back = parseDraft(draftJson(draft), "fm");
  expect(back).toEqual(draft);
  expect(parseDraft(draftJson(draft), "other")).toBeNull();
  expect(parseDraft(null, "fm")).toBeNull();
  expect(parseDraft("not json", "fm")).toBeNull();
  expect(parseDraft(JSON.stringify({ ...draft, fields: [{ id: 1 }] }), "fm")).toBeNull();
});
