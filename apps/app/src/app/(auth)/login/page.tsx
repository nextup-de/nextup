// STEP 1 of login: work email or company name -> that company's /[company]/login (findCompany).
import Link from "next/link";
import { AuthShell, AuthTitle, AuthFoot, AuthRoles } from "@/components/auth/AuthShell";
import { FindCompanyForm } from "@/components/auth/FindCompanyForm";

export const metadata = { title: "Log in" };

export default function FindCompanyPage() {
  return (
    <AuthShell
      art="hand"
      side={
        <>
          <h2>Nineteen working days.<br />Three of them are work.</h2>
          <p>Log in to see what is waiting on whom - and for how long. One home screen per role:</p>
          <AuthRoles items={[
            ["Team member", "Raise", "Problem or idea in one box - NextUp names the owner and the deadline."],
            ["Team leader", "Inbox", "Open items, oldest first. Yes, no and why, pass on, or ask - one click."],
            ["Manager", "Overview", "What is waiting on you, the wait ledger, where the waiting goes."],
          ]} />
        </>
      }
    >
      <AuthTitle title="Find your company" sub="Enter your work email or your company's NextUp name. We will take you to your company's login." />

      <FindCompanyForm />

      <AuthFoot>
        New here? <Link href="/signup">Create a workspace</Link> · <Link href="/invite/demo">I have an invite</Link>
      </AuthFoot>
    </AuthShell>
  );
}
