import { expect, it, vi } from "vitest";
import { canSearchFiles, canWriteFiles, grantedScopes, M365_SCOPE, SIGN_IN_SCOPE } from "@/features/auth/entra";
import { GRAPH_SCOPE, refreshRequestBody } from "@/features/m365/token";

const READ = "https://graph.microsoft.com/Files.Read.All";
const WRITE = "https://graph.microsoft.com/Files.ReadWrite.All";
const findFirst = vi.fn();
vi.mock("@/lib/db/client", () => ({ getDb: () => ({ connection: { findFirst } }) }));

it("FIL write scope the connect flow and the refresh ask for Files.ReadWrite.All, never Files.Read.All", () => {
  expect(M365_SCOPE.split(" ")).toContain(WRITE);
  expect(M365_SCOPE.split(" ")).not.toContain(READ);
  expect(GRAPH_SCOPE.split(" ").sort()).toEqual([WRITE, "offline_access"]);
  expect(refreshRequestBody({ clientId: "a", clientSecret: "b", refreshToken: "r" }).get("scope")).toBe(GRAPH_SCOPE);
  expect(SIGN_IN_SCOPE).not.toMatch(/Files/);
});

it("FIL write scope a grant with Files.ReadWrite.All may search and write", () => {
  const scopes = grantedScopes(`${WRITE} https://graph.microsoft.com/User.Read`);
  expect(canSearchFiles(scopes)).toBe(true);
  expect(canWriteFiles(scopes)).toBe(true);
  expect(canWriteFiles(["files.readwrite.all"])).toBe(true);
});

it("FIL write scope a grant with only Files.Read.All may search but not write", () => {
  const scopes = grantedScopes(`${READ} https://graph.microsoft.com/User.Read`);
  expect(canSearchFiles(scopes)).toBe(true);
  expect(canWriteFiles(scopes)).toBe(false);
  expect(canWriteFiles(["offline_access", "Files.Read"])).toBe(false);
  expect(canWriteFiles([])).toBe(false);
});

it("FIL write scope m365CanWrite reads the stored scopes of the person's connection", async () => {
  const { m365CanWrite } = await import("@/lib/db/connections");
  findFirst.mockResolvedValueOnce({ scopes: ["Files.ReadWrite.All", "offline_access"] });
  expect(await m365CanWrite("c1", "u1")).toBe(true);
  expect(findFirst).toHaveBeenLastCalledWith(expect.objectContaining({ where: expect.objectContaining({ companyId: "c1", userId: "u1" }) }));
  findFirst.mockResolvedValueOnce({ scopes: ["Files.Read.All"] });
  expect(await m365CanWrite("c1", "u1")).toBe(false);
  findFirst.mockResolvedValueOnce(null);
  expect(await m365CanWrite("c1", "u2")).toBe(false);
});
