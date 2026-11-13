// Decision Q1.7: a member chooses per raise whether it carries their handle or their name; the company preselects;
// leaders and managers post by name. On their own case a raiser keeps the label they raised it with.
import { describe, expect, it } from "vitest";
import { choosesPosting, DEFAULT_POST_AS, eventLabel, postAsOf, raiseLabel } from "@/features/ideas/posting";

const member = { role: "member" as const, name: "Jonas Schmidt", handle: "Anonymous #4471", userId: "u_js" };
const noHandle = { ...member, handle: null };
const leader = { role: "leader" as const, name: "Thomas Vogel", handle: null, userId: "u_tv" };
const raised = (asName?: boolean) => ({ type: "case.raised", payload: asName === undefined ? {} : { asName } });

describe("who a raise is posted as", () => {
  it("only a member with a handle chooses", () => {
    expect(choosesPosting(member)).toBe(true);
    expect(choosesPosting(noHandle)).toBe(false);
    expect(choosesPosting(leader)).toBe(false);
    expect(choosesPosting({ ...leader, handle: "Anonymous #1" })).toBe(false);
  });

  it("the member's choice wins; without one the company's preselection; the handle unless a company chose the name", () => {
    expect(DEFAULT_POST_AS).toBe("handle");
    expect(raiseLabel(member, undefined, "handle")).toBe("Anonymous #4471");
    expect(raiseLabel(member, undefined, "name")).toBe("Jonas Schmidt");
    expect(raiseLabel(member, true, "handle")).toBe("Jonas Schmidt");
    expect(raiseLabel(member, false, "name")).toBe("Anonymous #4471");
  });

  it("leaders, managers and a member without a handle post by name whatever they send", () => {
    expect(raiseLabel(leader, false, "handle")).toBe("Thomas Vogel");
    expect(raiseLabel({ ...leader, role: "manager" }, false, "handle")).toBe("Thomas Vogel");
    expect(raiseLabel(noHandle, false, "handle")).toBe("Jonas Schmidt");
  });

  it("reads the company rule, and anything unknown is the handle", () => {
    expect(postAsOf("name")).toBe("name");
    expect(postAsOf("handle")).toBe("handle");
    expect(postAsOf("Name")).toBe("handle");
    expect(postAsOf(undefined)).toBe("handle");
  });
});

describe("the label of every event", () => {
  const byName = { fromUserId: "u_js", from: "Jonas Schmidt" };
  const byHandle = { fromUserId: "u_js", from: "Anonymous #4471" };
  const someoneElses = { fromUserId: "u_mr", from: "Anonymous #0001" };

  it("a raise as chosen; a non-boolean choice is ignored", () => {
    expect(eventLabel(member, raised(true), undefined, "handle")).toBe("Jonas Schmidt");
    expect(eventLabel(member, raised(), undefined, "handle")).toBe("Anonymous #4471");
    expect(eventLabel(member, { type: "case.raised", payload: { asName: "yes" } }, undefined, "handle")).toBe("Anonymous #4471");
  });

  it("on their own case the raiser keeps the label they raised it with, so a handle and a name never meet", () => {
    for (const type of ["case.answered", "case.revised", "case.commented", "case.withdrawn"]) {
      expect(eventLabel(member, { type, payload: {} }, byName, "handle")).toBe("Jonas Schmidt");
      expect(eventLabel(member, { type, payload: {} }, byHandle, "name")).toBe("Anonymous #4471");
    }
  });

  it("on someone else's case, or with no case, as before: a member's handle, everyone else's name", () => {
    expect(eventLabel(member, { type: "case.commented", payload: {} }, someoneElses, "name")).toBe("Anonymous #4471");
    expect(eventLabel(member, { type: "idea.cosigned", payload: {} }, undefined, "name")).toBe("Anonymous #4471");
    expect(eventLabel(leader, { type: "case.decided", payload: {} }, byHandle, "handle")).toBe("Thomas Vogel");
    // Without a user id nothing is "own".
    expect(eventLabel({ ...member, userId: null }, { type: "case.answered", payload: {} }, byName, "handle")).toBe("Anonymous #4471");
  });
});
