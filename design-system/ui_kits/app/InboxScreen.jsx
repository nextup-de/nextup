// Inbox - leader/InboxView + IdeaDetail: the list card; opened, an avatar rail, the idea, five scores, Your decision, From the feed.
function InboxScreen({ toast }) {
  const { Stats, Avatar, PillButton, IconButton, Icon, Badge, InfoPanel, ScoreRow, DecisionList, FeedPanel, AvatarTone, Initials } = window.NextUpDesignSystem_2debbf;
  const D = window.KIT_DATA;
  const [rows, setRows] = React.useState(D.inbox);
  const [open, setOpen] = React.useState(null);
  const [pick, setPick] = React.useState(null);
  const [score, setScore] = React.useState(null);
  const cur = rows.find((r) => r.id === open);
  const decide = (o) => {
    setPick(o);
    if (o === "Discuss first") { toast("Discussion started · " + cur.from + " and the people affected are invited."); return; }
    setRows((rs) => rs.filter((r) => r.id !== open)); setOpen(null); setPick(null);
    toast(o.replace(/, do it|, and why/, "") + " · " + cur.from + " has been told.");
  };
  if (cur) return (
    <div className="kit-detail" data-screen-label="Inbox · idea">
      <nav className="kit-rail" aria-label="Inbox">
        <IconButton variant="ghost" label="Back to the list" onClick={() => setOpen(null)}><Icon name="sidebar" size={16} /></IconButton>
        {rows.map((r) => <button key={r.id} className="kit-rail-item" data-active={r.id === open ? "true" : undefined} onClick={() => { setOpen(r.id); setPick(null); }} title={r.title}><span className="nu-av" data-avatar={AvatarTone(r.from)} style={{ width: 32, height: 32, fontSize: 12 }}>{Initials(r.from)}</span></button>)}
      </nav>
      <div className="kit-detail-main">
        <article className="nu-card">
          <div className="kit-row-gap" style={{ gap: 10 }}>
            <span className="nu-av" data-avatar={AvatarTone(cur.from)} style={{ width: 36, height: 36, fontSize: 13 }}>{Initials(cur.from)}</span>
            <span style={{ flex: 1, minWidth: 0, display: "flex", flexDirection: "column" }}><span style={{ fontWeight: 600 }}>{cur.from}</span><span className="nu-label">{cur.role} · raised on {cur.raised}</span></span>
            <Badge tone={cur.tone} size="md">{cur.badge}</Badge>
            <IconButton variant="dark" label="Close" onClick={() => setOpen(null)}><Icon name="x" size={12} width={2.6} /></IconButton>
          </div>
          <h2 className="nu-title">{cur.title}</h2>
          <p className="nu-lede">{cur.solves}</p>
          <div className="nu-section"><span className="nu-label">Affects</span><div className="kit-row-gap" style={{ gap: 6 }}>{cur.affects.map((a) => <span key={a} className="nu-chip">{a}</span>)}</div></div>
          <InfoPanel rows={cur.facts.map(([label, value]) => ({ label, value }))} />
        </article>
        <ScoreRow scores={cur.scores} open={score} onToggle={(l) => setScore(score === l ? null : l)} />
        {score && <article className="nu-card"><span className="nu-label">{score}</span><p className="nu-para">{"The AI scores " + score.toLowerCase() + " from what the idea says and what it can check - the numbers, who decides and a first step."}</p></article>}
      </div>
      <aside className="kit-detail-side">
        <DecisionList options={["Yes, do it", "Discuss first", "No, and why", "Pass to Markus Roth", "Ask a question"]} value={pick} suggested={cur.suggest} onPick={decide} />
        <FeedPanel supporters={cur.supporters} comments={0} line={cur.supporters ? "Positive. Line 2 wants the same." : "Nobody else has added their name yet."} onPost={() => toast("Comment posted.")} />
      </aside>
    </div>
  );
  return (
    <div className="kit-inbox" data-screen-label="Inbox">
      <div className="kit-inbox-top"><h2 className="nu-page-title">Fresh ideas</h2>
        <div className="kit-row-gap" style={{ gap: 6 }}><PillButton size="sm" icon={<Icon name="filter" size={14} width={2.2} />}>Filter</PillButton><PillButton size="sm" icon={<Icon name="sort" size={14} width={2.2} />}>Oldest first</PillButton></div>
      </div>
      <section className="kit-inbox-card">
        <Stats items={D.inboxStats} />
        <ul className="kit-list">
          {rows.map((r) => (
            <li key={r.id}>
              <button className="kit-row" onClick={() => { setOpen(r.id); setPick(null); setScore(null); }}>
                <Avatar name={r.from} size="xl" />
                <div className="kit-row-body">
                  <div className="kit-row-main">
                    <span className="kit-row-title">{r.title}</span>
                    <span className="kit-row-who">{r.from} <span className="kit-row-role">· {r.role}</span></span>
                    <span className="kit-row-solves">{r.solves}</span>
                  </div>
                  <div className="kit-row-right"><span className="kit-row-sent">{r.sent}</span><Badge tone={r.tone}>{r.badge}</Badge></div>
                </div>
              </button>
            </li>
          ))}
        </ul>
        {rows.length === 0 && <div className="kit-empty-line">Nothing waiting on you.</div>}
      </section>
    </div>
  );
}
window.InboxScreen = InboxScreen;
