// There is no self-service signup: a manager adds people (Settings -> Members), who sign in with a
// personal code. Anyone landing here goes on to their company's login, or to "find your company".
import { redirect } from "next/navigation";
import { companyLoginPath } from "@/features/auth/login-path";

export default async function SignupPage({ searchParams }: { searchParams: Promise<{ company?: string }> }) {
  redirect(companyLoginPath((await searchParams).company));
}
