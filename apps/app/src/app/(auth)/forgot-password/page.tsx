import { AuthShell, AuthTitle } from "@/components/auth/AuthShell";
export const metadata = { title: "Reset password" };
export default function ForgotPasswordPage() {
  return (
    <AuthShell side={<h2>We will send a link.</h2>}>
      <AuthTitle title="Reset your password" sub="Coming with real accounts in Phase 2." />
    </AuthShell>
  );
}
