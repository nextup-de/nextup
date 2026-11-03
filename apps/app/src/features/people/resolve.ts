// Which person page a URL segment opens (MET D15). The segment is an opaque user id and nothing
// else: a display name, a handle or a legacy name URL is never looked up, so it is not found.

export type PersonCandidate = { id: string; handle: string | null; active: boolean };

export type PersonRoute =
  | { kind: "page"; userId: string }
  | { kind: "redirect"; to: "profile" }
  | { kind: "notFound" };

export function resolvePersonParam(param: string, users: readonly PersonCandidate[], viewerId: string | null): PersonRoute {
  const user = users.find((u) => u.id === param);
  if (!user || !user.active) return { kind: "notFound" };
  if (viewerId !== null && user.id === viewerId) return { kind: "redirect", to: "profile" };
  // A person with an anonymous handle has no public page.
  if (user.handle) return { kind: "notFound" };
  return { kind: "page", userId: user.id };
}
