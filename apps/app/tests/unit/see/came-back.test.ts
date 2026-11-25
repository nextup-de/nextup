// What the desk reads when its question comes back (cameBack): the raiser's words and the version they revised the idea to.
import { describe, expect, it } from "vitest";
import { cameBack } from "@/features/cases/case-actions";
import type { CaseEvent, CaseEventType, EventPayload } from "@/features/cases/events";
import { reduce, type ReducedCase, type ReduceSeed } from "@/features/cases/reducer";

const SEED: ReduceSeed = { cases: [], ideas: [], problems: [], routes: [], promiseDays: 5, seats: [] };
let n = 0;
const ev = (type: CaseEventType, by: string, payload: EventPayload = {}, day = 1): CaseEvent => ({ id: "b" + n++, ts: n, type, actor: by, actorUserId: by, target: "ca", payload, day });
const ask = () => ev("case.asked", "u_own", { text: "And Line 2?" });
const answer = (text: string) => ev("case.answered", "u_ra", { text });
const revise = () => ev("case.revised", "u_ra", { body: "Line 2 as well" });
const kase = (...events: CaseEvent[]): ReducedCase => reduce(SEED, { events: [ev("case.raised", "u_ra", { kind: "idea", title: "Sheet", body: "Line 3" }, 0), ...events], day: 5 }).cases.find((c) => c.id === "ca")!;

describe("what came back on a question", () => {
  it("nothing before the answer", () => {
    expect(cameBack(kase())).toBeNull();
    expect(cameBack(kase(ask()))).toBeNull();
    expect(cameBack(kase(ask(), revise()))).toBeNull();
  });
  it("the words alone", () => expect(cameBack(kase(ask(), answer("The same there")))).toEqual({ text: "The same there", version: null }));
  it("a revision that answered it has no words of its own", () => expect(cameBack(kase(ask(), revise(), answer("See v2")))).toEqual({ text: null, version: 2 }));
  it("words and a revision", () => expect(cameBack(kase(ask(), revise(), answer("Added it")))).toEqual({ text: "Added it", version: 2 }));
  it("a revision from before the question is not what changed, nor one after the answer", () => {
    expect(cameBack(kase(revise(), ask(), answer("The same there")))).toEqual({ text: "The same there", version: null });
    expect(cameBack(kase(ask(), answer("The same there"), revise()))).toEqual({ text: "The same there", version: null });
  });
  it("asked again, the earlier answer is gone", () => expect(cameBack(kase(ask(), answer("Yes"), ask()))).toBeNull());
  it("gone once it is decided", () => expect(cameBack(kase(ask(), answer("Yes"), ev("case.decided", "u_own", { answer: "no", reason: "no" })))).toBeNull());
});
