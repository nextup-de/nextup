// Shop-floor areas (FLR D5, D6): the rules for an area and the address its QR code points to. Pure.
import type { MessageKey } from "@/i18n";

export const AREA_KEY = /^[a-z0-9][a-z0-9-]{1,31}$/;
export const AREA_NAME_MAX = 60;

export type AreaFormInput = { id?: string; key: string; name: string; unitId: string; roleId: string; anonymous: boolean; on: boolean };
export type AreaContext = {
  units: readonly { id: string }[];
  roles: readonly { id: string; orgUnitId: string }[];
  /** Keys of the company's other areas (leave out the area being edited). */
  keysInUse: readonly string[];
};
export type AreaCheck = { ok: true; value: AreaFormInput } | { ok: false; error: MessageKey };

export function checkArea(input: AreaFormInput, ctx: AreaContext): AreaCheck {
  const key = input.key.trim();
  const name = input.name.trim();
  if (!AREA_KEY.test(key)) return { ok: false, error: "settingsAreas.errKey" };
  if (name.length < 1 || name.length > AREA_NAME_MAX) return { ok: false, error: "settingsAreas.errName" };
  if (!ctx.units.some((u) => u.id === input.unitId)) return { ok: false, error: "settingsAreas.errUnit" };
  if (!ctx.roles.some((r) => r.id === input.roleId && r.orgUnitId === input.unitId)) return { ok: false, error: "settingsAreas.errRole" };
  if (ctx.keysInUse.includes(key)) return { ok: false, error: "settingsAreas.errKeyTaken" };
  return {
    ok: true,
    value: { ...(input.id ? { id: input.id } : {}), key, name, unitId: input.unitId, roleId: input.roleId, anonymous: input.anonymous, on: input.on },
  };
}

/** The address a person lands on after scanning the area's code. */
export const areaUrl = (baseUrl: string, key: string): string => `${baseUrl.replace(/\/+$/, "")}/floor/${key}`;
