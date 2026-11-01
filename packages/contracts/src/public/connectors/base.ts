// Connector base: the eight kinds of external system NextUp plugs into (D2), their identity and health.
// Part of @nextup/contracts/public (PILOT public contracts). Changes only by D3: add an optional field, a new
// export or an optional interface member; anything else is a new version next to the old one.
import { z } from "zod";
import { IsoDateTime, PUBLIC_CONTRACT_VERSION } from "../primitives";

export const CONNECTOR_KINDS = [
  "IdentityProvider",
  "DirectorySource",
  "NotifyChannel",
  "CaseSource",
  "WorkTracker",
  "KnowledgeSource",
  "LogSink",
  "AiProvider",
] as const;
export type ConnectorKind = (typeof CONNECTOR_KINDS)[number];

/** `id` is the adapter, e.g. `jira-cloud`. */
export const ConnectorInfo = z.object({
  kind: z.enum(CONNECTOR_KINDS),
  id: z.string().regex(/^[a-z][a-z0-9-]{1,39}$/),
  contractVersion: z.literal(PUBLIC_CONTRACT_VERSION),
});
export type ConnectorInfo = z.infer<typeof ConnectorInfo>;

export const ConnectorHealth = z.object({
  ok: z.boolean(),
  detail: z.string().max(500),
  checkedAt: IsoDateTime,
});
export type ConnectorHealth = z.infer<typeof ConnectorHealth>;

/** Every interface of ARC-B1 extends `Connector<"<its name>">`. */
export interface Connector<K extends ConnectorKind> {
  readonly info: ConnectorInfo & { kind: K };
  health?(): Promise<ConnectorHealth>;
}
