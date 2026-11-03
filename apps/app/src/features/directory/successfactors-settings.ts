// Settings of the SuccessFactors connector (plan SFX, D7): the non-secret half of the one Integration row with
// system `successfactors`. The private key is the sealed secret and is not part of this shape.
export type SuccessFactorsSettings = {
  /** https origin of the customer's API server, no path (e.g. https://api4.successfactors.eu). */
  apiHost: string;
  companyId: string;
  clientId: string;
  apiUserId: string;
};

export type SettingsError = { field: keyof SuccessFactorsSettings; message: string };
export type SettingsResult = { ok: true; value: SuccessFactorsSettings } | { ok: false; errors: SettingsError[] };

function hostOf(raw: unknown): string | null {
  if (typeof raw !== "string") return null;
  let u: URL;
  try {
    u = new URL(raw.trim());
  } catch {
    return null;
  }
  const local = u.protocol === "http:" && u.hostname === "127.0.0.1" && !!process.env.VITEST;
  if (u.protocol !== "https:" && !local) return null;
  if (u.username || u.password || u.search || u.hash || (u.pathname !== "/" && u.pathname !== "")) return null;
  return u.origin;
}

function bounded(raw: unknown, max: number): string | null {
  if (typeof raw !== "string") return null;
  const v = raw.trim();
  return v.length >= 1 && v.length <= max ? v : null;
}

export function parseSuccessFactorsSettings(json: unknown): SettingsResult {
  const o = (json && typeof json === "object" ? json : {}) as Record<string, unknown>;
  const errors: SettingsError[] = [];
  const apiHost = hostOf(o.apiHost);
  if (!apiHost) errors.push({ field: "apiHost", message: "must be an https URL without a path" });
  const companyId = bounded(o.companyId, 100);
  if (!companyId) errors.push({ field: "companyId", message: "required, at most 100 characters" });
  const clientId = bounded(o.clientId, 200);
  if (!clientId) errors.push({ field: "clientId", message: "required, at most 200 characters" });
  const apiUserId = bounded(o.apiUserId, 100);
  if (!apiUserId) errors.push({ field: "apiUserId", message: "required, at most 100 characters" });
  if (errors.length || !apiHost || !companyId || !clientId || !apiUserId) return { ok: false, errors };
  return { ok: true, value: { apiHost, companyId, clientId, apiUserId } };
}
