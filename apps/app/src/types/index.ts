// Domain types. Mirror prisma/schema.prisma once it exists; until then they document the model
// ported from legacy/demo/js/data.js (see docs/DATA_MODEL.md).
import type { Role } from "@/config/roles";

export type Company = { id: string; slug: string; name: string; logoUrl?: string; anonymousHandles: boolean };
export type User = { id: string; companyId: string; name: string; email: string; role: Role; dept?: string; handle?: string };
export type Department = { id: string; companyId: string; name: string };
export type Route = { id: string; companyId: string; label: string; ownerUserId: string; deputyUserId: string; buddyUserId?: string; keys: string[] };
export type CaseStatus = "open" | "read" | "decided" | "handed" | "asked" | "shipped";
export type Case = { id: string; companyId: string; title: string; body: string; fromUserId: string; routeId: string; assigneeUserId: string; raisedAt: string; status: CaseStatus };
export type IdeaStatus = "awaiting" | "trial" | "building" | "shipped" | "unfunded";
export type Idea = { id: string; companyId: string; title: string; problemId?: string; status: IdeaStatus; teamUserIds: string[] };
export type Problem = { id: string; companyId: string; title: string; deptId: string; ideaIds: string[] };
export type CaseEvent = { id: string; caseId: string; actorUserId: string; type: string; payload: unknown; at: string };
