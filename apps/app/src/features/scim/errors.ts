// SCIM error bodies (RFC 7644 section 3.12). Pure.

export const SCIM_ERROR_SCHEMA = "urn:ietf:params:scim:api:messages:2.0:Error";
export const SCIM_CONTENT_TYPE = "application/scim+json";

export type ScimErrorType =
  | "invalidFilter" | "tooMany" | "uniqueness" | "mutability" | "invalidSyntax" | "invalidPath"
  | "noTarget" | "invalidValue" | "invalidVers" | "sensitive";

export type ScimErrorBody = { schemas: [typeof SCIM_ERROR_SCHEMA]; status: string; scimType?: ScimErrorType; detail: string };

/** The body of an error: `status` is a string, `scimType` only where the RFC names one. */
export function scimError(status: number, scimType: ScimErrorType | null, detail: string): ScimErrorBody {
  return { schemas: [SCIM_ERROR_SCHEMA], status: String(status), ...(scimType ? { scimType } : {}), detail: detail.slice(0, 500) };
}

/** Thrown by the pure parts and the handlers; the wrapper answers it. */
export class ScimFailure extends Error {
  constructor(readonly status: number, readonly scimType: ScimErrorType | null, readonly detail: string) {
    super(detail);
  }
}
