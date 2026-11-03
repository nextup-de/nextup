// Which privacy entries a member's ⋯ menu offers (GDP D19). Pure: no React, no database.
export type MemberPrivacyInput = { id: string; active: boolean; hasEmail: boolean; pseudonymisedAt: string | null };

export type MemberPrivacyActions = {
  /** Who the export can go to: the person (active, verified address) and/or the admin who asked. */
  exportTo: ("person" | "admin")[];
  pseudonymise: "enabled" | "disabled-active" | "hidden";
  /** A pseudonymised row offers Delete and nothing else. */
  deleteOnly: boolean;
};

export function memberPrivacyActions(member: MemberPrivacyInput, viewerId: string): MemberPrivacyActions {
  if (member.id === viewerId) return { exportTo: [], pseudonymise: "hidden", deleteOnly: false };
  if (member.pseudonymisedAt) return { exportTo: [], pseudonymise: "hidden", deleteOnly: true };
  if (!member.active) return { exportTo: ["admin"], pseudonymise: "enabled", deleteOnly: false };
  return { exportTo: member.hasEmail ? ["person", "admin"] : ["admin"], pseudonymise: "disabled-active", deleteOnly: false };
}
