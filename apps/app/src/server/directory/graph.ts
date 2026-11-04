// The Graph DirectorySource (plan DIR, D10): Entra users as directory pages, read with an app-only token
// (client credentials, application permission User.Read.All). One page per call; the last page of a round
// has nextCursor null and its deltaLink is what `deltaLink()` returns, the cursor to store for the next round.
// Read-only: NextUp never writes to the directory.
//
// The token lives in this adapter's memory until five minutes before it expires, one per tenant (an adapter
// is made for one tenant), and is never logged. Errors carry the HTTP status and Graph's error code only -
// no body, no token.
//
// The manager is a relationship: Graph's delta query takes it through $select, refuses $expand, and answers
// in the annotation manager@delta. Microsoft's pages do not show that annotation's shape, so this reads what
// the same pages say of relationships in general; it has not met a live tenant yet (PILOT_CHECK C2).
import { PUBLIC_CONTRACT_VERSION, type DirectoryEntry, type DirectoryPage, type DirectorySource } from "@nextup/contracts/public";
import { tokenUrl, type EntraApp } from "@/features/auth/entra";

const GRAPH = "https://graph.microsoft.com/";
const SCOPE = `${GRAPH}.default`;
const EARLY_MS = 5 * 60_000;
export const FIRST_PAGE =
  `${GRAPH}v1.0/users/delta?$select=id,displayName,mail,userPrincipalName,department,jobTitle,employeeId,accountEnabled,manager`;

export type GraphDirectory = DirectorySource & {
  /** The deltaLink of the last finished round, or null before one finished: store it as the next cursor. */
  deltaLink(): string | null;
};

type GraphUser = {
  id?: unknown;
  displayName?: unknown;
  mail?: unknown;
  userPrincipalName?: unknown;
  department?: unknown;
  jobTitle?: unknown;
  employeeId?: unknown;
  accountEnabled?: unknown;
  "manager@delta"?: unknown;
  "@removed"?: unknown;
};

const text = (v: unknown): string | null => (typeof v === "string" && v.trim() ? v.trim() : null);

/** The entry without @removed is the manager; only removed ones mean none. No annotation says nothing about the manager. */
function managerOf(u: GraphUser): Pick<DirectoryEntry, "managerExternalId" | "managerUnchanged"> {
  const links = u["manager@delta"];
  if (!Array.isArray(links)) return { managerExternalId: null, managerUnchanged: true };
  const current = (links as ({ id?: unknown; "@removed"?: unknown } | null)[]).find((l) => l && l["@removed"] === undefined);
  return { managerExternalId: text(current?.id) };
}

function entryOf(u: GraphUser, id: string): DirectoryEntry {
  const upn = text(u.userPrincipalName);
  return {
    externalId: id,
    displayName: (text(u.displayName) ?? upn ?? id).slice(0, 120),
    email: text(u.mail) ?? upn,
    department: text(u.department),
    jobTitle: text(u.jobTitle),
    ...managerOf(u),
    groupExternalIds: [],
    employeeId: text(u.employeeId),
    active: u.accountEnabled !== false,
  };
}

/** Graph's error code, cleaned, or "". Reads a copy, so the response can still be read. */
async function errorCode(res: Response): Promise<string> {
  try {
    const body: unknown = await res.clone().json();
    const e = (body as { error?: unknown } | null)?.error;
    const c = typeof e === "string" ? e : (e as { code?: unknown } | null)?.code;
    if (typeof c === "string") return c.replace(/[^\w.-]/g, "").slice(0, 60);
  } catch {
    // no JSON body: the status is enough
  }
  return "";
}

async function failure(what: string, res: Response): Promise<Error> {
  const code = await errorCode(res);
  return new Error(`${what} failed: ${res.status}${code ? ` ${code}` : ""}`);
}

/** 410 Gone: Graph wants a full sync. syncStateNotFound: the delta token has expired. */
async function fullSyncAsked(res: Response): Promise<boolean> {
  return res.status === 410 || (res.status >= 400 && res.status < 500 && (await errorCode(res)) === "syncStateNotFound");
}

export function graphDirectory(opts: { tenantId: string; app: EntraApp; fetch?: typeof fetch }): GraphDirectory {
  const doFetch = opts.fetch ?? fetch;
  let cached: { token: string; until: number } | null = null;
  let stored: string | null = null;

  async function token(): Promise<string> {
    if (cached && cached.until > Date.now()) return cached.token;
    const res = await doFetch(tokenUrl(opts.tenantId), {
      method: "POST",
      headers: { "content-type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({
        client_id: opts.app.clientId,
        client_secret: opts.app.clientSecret,
        grant_type: "client_credentials",
        scope: SCOPE,
      }),
    });
    if (!res.ok) throw await failure("Graph token request", res);
    const body = (await res.json()) as { access_token?: unknown; expires_in?: unknown };
    if (typeof body.access_token !== "string" || !body.access_token) throw new Error("Graph token request failed: no token");
    const seconds = typeof body.expires_in === "number" ? body.expires_in : 0;
    cached = { token: body.access_token, until: Date.now() + seconds * 1000 - EARLY_MS };
    return cached.token;
  }

  return {
    info: { kind: "DirectorySource", id: "graph-directory", contractVersion: PUBLIC_CONTRACT_VERSION },
    deltaLink: () => stored,
    async delta({ cursor }): Promise<DirectoryPage> {
      const url = cursor ?? FIRST_PAGE;
      if (!url.startsWith(GRAPH)) throw new Error("Graph directory cursor refused: not a graph.microsoft.com URL");
      const read = async (from: string) => doFetch(from, { headers: { authorization: `Bearer ${await token()}`, accept: "application/json" } });
      let res = await read(url);
      // Everyone is read again. Applying a page twice changes nothing, and nobody counts as gone for being absent.
      if (!res.ok && cursor !== null && (await fullSyncAsked(res))) {
        console.warn(`[directory-sync] Graph asked for a full sync: ${res.status}`);
        res = await read(FIRST_PAGE);
      }
      if (!res.ok) throw await failure("Graph directory request", res);
      const body = (await res.json()) as {
        value?: GraphUser[];
        "@odata.nextLink"?: unknown;
        "@odata.deltaLink"?: unknown;
      };
      const entries: DirectoryEntry[] = [];
      const removedExternalIds: string[] = [];
      for (const u of body.value ?? []) {
        const id = text(u.id);
        if (!id) continue;
        if (u["@removed"] !== undefined) removedExternalIds.push(id);
        else entries.push(entryOf(u, id));
      }
      const nextCursor = text(body["@odata.nextLink"]);
      if (!nextCursor) stored = text(body["@odata.deltaLink"]);
      return { entries, groups: [], removedExternalIds, nextCursor };
    },
  };
}
