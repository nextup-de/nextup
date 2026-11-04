// TMS-E1 (D2, D13): the Teams CaseSource turns a submitted raise form into a CaseInput.
import { describe, expect, it } from "vitest";
import { CaseInput } from "@nextup/contracts/public";
import { messageText, plainText, teamsCaseSource } from "@/server/teams/case-source";

const AAD = "7f1c0000-0000-4000-8000-000000000001";
const submit = (over: Record<string, unknown> = {}, data: Record<string, unknown> = {}) => ({
  type: "invoke",
  name: "composeExtension/submitAction",
  id: "19:msg-abc",
  from: { aadObjectId: AAD },
  value: { commandId: "raise", data: { kind: "problem", title: "Machine 4 stops", body: "Every shift.", visibility: "everyone", ...data } },
  ...over,
});
const receive = (payload: unknown) => teamsCaseSource.receive({ companyId: "co_acme", payload, headers: {} });

describe("TMS case source", () => {
  it("is the teams CaseSource", () => {
    expect(teamsCaseSource.info).toMatchObject({ kind: "CaseSource", id: "teams" });
  });

  it("turns a submitted form into a CaseInput that parses with the contract", async () => {
    const input = await receive(submit());
    expect(input).not.toBeNull();
    expect(CaseInput.safeParse(input).success).toBe(true);
    expect(input).toMatchObject({
      companyId: "co_acme",
      source: "teams",
      externalId: "19:msg-abc",
      kind: "problem",
      title: "Machine 4 stops",
      body: "Every shift.",
      raisedByUserId: null,
      raisedByExternalId: `entra:${AAD}`,
      routeHint: null,
    });
  });

  it("keeps an idea, trims, and cuts a title and body at the form's limits", async () => {
    const input = await receive(submit({}, { kind: "idea", title: `  ${"t".repeat(300)} `, body: "b".repeat(5000) }));
    expect(input?.kind).toBe("idea");
    expect(input?.title).toHaveLength(120);
    expect(input?.body).toHaveLength(2000);
  });

  it("returns null for anything that is not a submitted raise form", async () => {
    expect(await receive(null)).toBeNull();
    expect(await receive("x")).toBeNull();
    expect(await receive(submit({ type: "message" }))).toBeNull();
    expect(await receive(submit({ name: "composeExtension/fetchTask" }))).toBeNull();
    expect(await receive(submit({ id: undefined }))).toBeNull();
    expect(await receive(submit({ from: {} }))).toBeNull();
    expect(await receive(submit({}, { title: "   " }))).toBeNull();
    expect(await receive(submit({ value: "nope" }))).toBeNull();
  });

  it("reads the words of an HTML message", () => {
    expect(plainText("<p>Leak &amp; drip</p><div>on line 3</div>")).toBe("Leak & drip\non line 3");
    expect(messageText({ messagePayload: { body: { contentType: "html", content: "<b>Hi</b> there" } } })).toBe("Hi there");
    expect(messageText({})).toBe("");
  });
});
