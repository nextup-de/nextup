// The static discovery documents (D10, Q1: User only) and the list envelope. Pure.
import { SCIM_CORE_USER, SCIM_ENTERPRISE } from "./map";

const LIST = "urn:ietf:params:scim:api:messages:2.0:ListResponse";

export function listResponse(resources: unknown[], totalResults: number, startIndex: number): Record<string, unknown> {
  return { schemas: [LIST], totalResults, startIndex, itemsPerPage: resources.length, Resources: resources };
}

export const SERVICE_PROVIDER_CONFIG = {
  schemas: ["urn:ietf:params:scim:schemas:core:2.0:ServiceProviderConfig"],
  patch: { supported: true },
  bulk: { supported: false, maxOperations: 0, maxPayloadSize: 0 },
  filter: { supported: true, maxResults: 100 },
  changePassword: { supported: false },
  sort: { supported: false },
  etag: { supported: false },
  authenticationSchemes: [
    { type: "oauthbearertoken", name: "OAuth Bearer Token", description: "Authentication with the NextUp SCIM token as a bearer token." },
  ],
};

const resourceTypes = [
  {
    schemas: ["urn:ietf:params:scim:schemas:core:2.0:ResourceType"],
    id: "User", name: "User", endpoint: "/Users", description: "A person of the company.",
    schema: SCIM_CORE_USER,
    schemaExtensions: [{ schema: SCIM_ENTERPRISE, required: false }],
  },
];

export const RESOURCE_TYPES = listResponse(resourceTypes, resourceTypes.length, 1);

const attr = (name: string, type = "string", extra: Record<string, unknown> = {}) => ({
  name, type, multiValued: false, required: false, mutability: "readWrite", returned: "default", uniqueness: "none", ...extra,
});

const schemas = [
  {
    schemas: ["urn:ietf:params:scim:schemas:core:2.0:Schema"],
    id: SCIM_CORE_USER, name: "User", description: "The user attributes NextUp stores.",
    attributes: [
      attr("userName", "string", { required: true }),
      attr("externalId"),
      attr("displayName"),
      attr("title"),
      attr("active", "boolean"),
      attr("name", "complex", { subAttributes: [attr("givenName"), attr("familyName"), attr("formatted")] }),
      attr("emails", "complex", { multiValued: true, subAttributes: [attr("value"), attr("type"), attr("primary", "boolean")] }),
    ],
  },
  {
    schemas: ["urn:ietf:params:scim:schemas:core:2.0:Schema"],
    id: SCIM_ENTERPRISE, name: "EnterpriseUser", description: "The enterprise attributes NextUp stores.",
    attributes: [
      attr("department"),
      attr("employeeNumber", "string", { returned: "never" }),
      attr("manager", "complex", { subAttributes: [attr("value")] }),
    ],
  },
];

export const SCHEMAS = listResponse(schemas, schemas.length, 1);
