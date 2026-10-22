// Projects - the raiser's view of one idea (team/OverviewIdea + OverviewChats): steps, desk, Idea / AI, the thread with the team lead.
function ProjectScreen({ toast }) {
  const { StepTrack, DeskStrip, Segmented, InfoPanel, BarsPanel, ScoreRow, IconButton, ChatMessage, Badge, FeedPanel, Icon, PillButton } = window.NextUpDesignSystem_2debbf;
  const P = window.KIT_DATA.project;
  const [tab, setTab] = React.useState("idea");
  const [side, setSide] = React.useState("thread");
  const [msgs, setMsgs] = React.useState(P.thread);
  const [draft, setDraft] = React.useState("");
  const send = () => { if (!draft.trim()) return; setMsgs((m) => [...m, { role: "user", text: draft.trim() }]); setDraft(""); toast("Sent to Thomas Vogel · the clock runs again."); };
  return (
    <div className="kit-detail kit-project" data-screen-label="Projects · idea">
      <div className="kit-detail-main">
        <article className="nu-card">
          <div className="kit-row-gap"><span className="nu-label" style={{ flex: 1 }}>{P.raised}</span><IconButton variant="dark" size="lg" label="Close"><Icon name="x" size={14} width={2.6} /></IconButton></div>
          <h1 className="nu-title" style={{ fontSize: 24, marginTop: -6 }}>{P.title}</h1>
          <StepTrack steps={P.steps} />
          <DeskStrip {...P.desk} />
        </article>
        <div className="kit-row-gap" style={{ justifyContent: "space-between" }}>
          <Segmented value={tab} onChange={setTab} items={[{ label: "Idea", key: "idea" }, { label: "AI", key: "ai", icon: <Icon name="plus" size={10} width={2.6} /> }]} />
          <IconButton variant="fill" label="Edit"><Icon name="pencil" size={14} /></IconButton>
        </div>
        {tab === "idea" ? (
          <article className="nu-card">
            <p className="nu-lede" style={{ color: "#1c1c1e" }}>{P.body}</p>
            <div className="nu-section"><span className="nu-label">Who</span><InfoPanel rows={P.who} /></div>
          </article>
        ) : (
          <>
            <ScoreRow scores={P.scores} />
            <article className="nu-card">
              <div className="kit-row-gap"><span style={{ color: "#007aff", display: "flex" }}><Icon name="sparkle" size={13} solid /></span><span style={{ fontWeight: 600 }}>What the AI found</span></div>
              <p className="nu-lede" style={{ color: "#1c1c1e" }}>{P.found}<span className="nu-cite">1</span></p>
              <p className="nu-para">{P.foundSub}<span className="nu-cite">1</span></p>
              <BarsPanel title="Minutes before the first part runs" rows={P.bars} note={<>Line 4 already works this way.<span className="nu-cite">1 2</span></>} />
              <p className="nu-para">Advice when it was raised: Approve. Clear, cheap, and the decision is the team lead’s own.<span className="nu-cite">3</span></p>
            </article>
          </>
        )}
      </div>
      <aside className="kit-detail-side kit-thread-col">
        {side === "thread" ? (
          <section className="nu-card kit-thread-card" data-pad="none">
            <header className="kit-thread-head">
              <IconButton variant="fill" size="lg" label="Switch" onClick={() => setSide("feed")}><Icon name="down" size={14} width={2.2} /></IconButton>
              <span className="nu-av" data-avatar="blue" style={{ width: 44, height: 44, fontSize: 15 }}>TV</span>
              <span style={{ display: "flex", flexDirection: "column", minWidth: 0 }}><span style={{ fontSize: 17, fontWeight: 600, color: "#1b1d22" }}>Thomas Vogel</span><span className="nu-label">Team lead, 4-series</span></span>
            </header>
            <div className="kit-thread-body">
              <div style={{ alignSelf: "flex-end" }}><Badge tone="review" size="md">Needs more info</Badge></div>
              <div className="nu-thread">{msgs.map((m, i) => <ChatMessage key={i} {...m} />)}</div>
            </div>
            <div className="kit-thread-compose">
              <div className="kit-mini-composer">
                <div className="kit-row-gap" style={{ alignItems: "flex-start", gap: 9 }}>
                  <span className="nu-icon-btn" data-variant="fill" data-size="sm"><Icon name="bolt" size={10.5} solid /></span>
                  <textarea className="nh-composer-field" rows={2} placeholder="Answer Thomas Vogel…" value={draft} onChange={(e) => setDraft(e.target.value)} onKeyDown={(e) => { if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); send(); } }} />
                </div>
                <div className="kit-row-gap" style={{ justifyContent: "space-between" }}>
                  <PillButton size="sm" variant="ghost" icon={<Icon name="file" size={13} />}>Attach</PillButton>
                  <button className="nh-composer-send" data-ready={draft.trim().length > 0} onClick={send} aria-label="Send"><Icon name="up" size={11.25} color="#fff" width={2.6} /></button>
                </div>
              </div>
            </div>
          </section>
        ) : (
          <div onClick={() => setSide("thread")}><FeedPanel supporters={6} comments={0} line="Positive. Line 2 wants the same." /></div>
        )}
      </aside>
    </div>
  );
}
window.ProjectScreen = ProjectScreen;
