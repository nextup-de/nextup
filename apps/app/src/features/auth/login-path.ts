// Where a retired auth page (signup, invite) sends a person: the company's login when the
// request names a plausible company slug, else the find-company page. Pure.
import { companyUrl } from "@/features/tenant/urls";

const SLUG = /^[a-z0-9](?:[a-z0-9-]{0,62})$/;

export function companyLoginPath(company: string | undefined): string {
  return company && SLUG.test(company) ? `${companyUrl(company)}/login` : "/login";
}
