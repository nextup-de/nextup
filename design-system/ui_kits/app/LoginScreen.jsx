// Login - AuthShell art="hand" + FindCompanyForm (apps/app/src/app/(auth)/login/page.tsx).
function LoginScreen({ onLogin }) {
  const { Ground, Field, Input, Divider, Button } = window.NextUpDesignSystem_2debbf;
  const [email, setEmail] = React.useState("");
  const [err, setErr] = React.useState(null);
  const go = () => { if (!email.trim()) { setErr("Enter your work email or your company's NextUp name."); return; } onLogin(); };
  const roles = [
    ["Team member", "Ideas", "Develop an idea with the coach - at the threshold NextUp names the owner and the deadline."],
    ["Team leader", "Inbox", "Open items, oldest first. Yes, no and why, pass on, or ask - one click."],
    ["Manager", "Dashboard", "How fast ideas are decided, where the waiting goes, and whether shipped work paid off."],
  ];
  return (
    <div className="kit-login" data-screen-label="Login">
      <Ground />
      <a className="kit-login-logo"><img src="../../assets/brand/nextup-horizontal-blue.png" alt="NextUp" /></a>
      <section className="kit-auth">
        <aside className="kit-art">
          <img className="kit-hand" src="../../assets/brand/login-hand.png" alt="" />
          <div className="kit-art-body">
            <h2>Nineteen working days.<br />Three of them are work.</h2>
            <p>Log in to see what is waiting on whom - and for how long. One home screen per role:</p>
            <ul className="kit-roles">{roles.map(([w, s, l]) => <li key={w}><span className="nu-label">{w}</span><strong>{s}</strong><small>{l}</small></li>)}</ul>
          </div>
        </aside>
        <main className="kit-auth-main">
          <span className="kit-back">← Back</span>
          <div className="kit-auth-card">
            <h1 className="kit-auth-title">Find your company</h1>
            <p className="kit-auth-sub">Enter your work email or your company's NextUp name. We will take you to your company's login.</p>
            <div className="kit-form">
              <Field id="email" label="Work email" error={err}><Input id="email" type="email" placeholder="you@company.com" value={email} onChange={(v) => { setEmail(v); setErr(null); }} invalid={!!err} /></Field>
              <Divider />
              <Field id="company" label="Company name" hint="The short name in your invitation link."><Input id="company" placeholder="your-company" suffix=".nextup.app" /></Field>
              <Button block onClick={go}>Continue</Button>
            </div>
            <div className="kit-demo">
              <div className="kit-demo-head"><strong>View the demo as…</strong><span className="kit-demo-tag">Demo</span></div>
              <Button variant="ghost" block onClick={onLogin}>J. Schmidt · Team member</Button>
            </div>
            <p className="kit-foot">New here? <a>Create a workspace</a> · <a>I have an invite</a></p>
          </div>
        </main>
      </section>
    </div>
  );
}
window.LoginScreen = LoginScreen;
