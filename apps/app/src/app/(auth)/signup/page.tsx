// Creates a company + its first manager. Stub until Phase 2.
import { AuthShell, AuthTitle } from "@/components/auth/AuthShell";
export const metadata = { title: "Create your workspace" };
export default function SignupPage() {
  return (
    <AuthShell side={<h2>Start with fifteen rows.</h2>}>
      <AuthTitle title="Create your workspace" sub="Coming with the first pilot." />
    </AuthShell>
  );
}
