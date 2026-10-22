// What happened to what I sent - dashboard/team/SentView.
function SentScreen({ toast }) {
  const { Badge, Steps } = window.NextUpDesignSystem_2debbf;
  const TONE = { accent: "review", grey: undefined, ink: "dark", ok: "approved" };
  const D = window.KIT_DATA;
  return (
    <div className="kit-sent" data-screen-label="What I sent">
      <div>
        <h1 className="kit-sent-title nu-page-title" style={{ fontSize: 28 }}>What happened to what I sent</h1>
        <p className="kit-sent-sub">2 waiting for an answer · 2 answered · 1 live</p>
      </div>
      <p className="kit-promise">Everything you send lands on a named person’s desk. They owe you a yes, a no or a question within 5 days. If they miss that date it moves to their deputy on its own — nothing you send can get lost.</p>
      {D.sent.map((m) => (
        <article key={m.title} className="kit-scard">
          <div className="kit-stop">
            <div style={{ minWidth: 0 }}><h2 className="kit-case">{m.title}</h2><p className="kit-submitted">{m.submitted}</p></div>
            <Badge tone={TONE[m.tone]} size="md">{m.status}</Badge>
          </div>
          <Steps steps={m.steps.map(([label, when, tone]) => ({ label, when, tone }))} />
          <p className="kit-now" data-overdue={m.overdue ? "true" : undefined}>{m.now}</p>
          <div className="kit-reply"><p className="kit-reply-text">{m.reply}</p><p className="kit-reply-by">{m.replyBy}</p></div>
          {m.outcome && <p className="kit-outcome"><span className="kit-outcome-l">{m.outcome[0]}</span><strong>{m.outcome[1]}</strong><span className="kit-outcome-n">{m.outcome[2]}</span></p>}
          {(m.history || m.canReply) && (
            <div className="kit-sfoot">
              {m.canReply && <button className="kit-answer" onClick={() => toast("Your answer went to " + m.canReply + ".")}>Answer {m.canReply}</button>}
              {m.history && <a className="kit-more">Full history →</a>}
            </div>
          )}
        </article>
      ))}
    </div>
  );
}
window.SentScreen = SentScreen;
