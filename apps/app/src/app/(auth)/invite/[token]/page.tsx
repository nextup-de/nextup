// An invite is a mail with a personal login code (ADM D11); there is no token to accept. The old
// link goes on to the company's login, or to "find your company" when it names none.
import { redirect } from "next/navigation";
import { companyLoginPath } from "@/features/auth/login-path";

export default async function AcceptInvitePage({ searchParams }: { searchParams: Promise<{ company?: string }> }) {
  redirect(companyLoginPath((await searchParams).company));
}
