// Raise - RaiseSidebar + RaiseStart + RaiseComposer, then the coach chat with its turn rail (components/ideas/*).
function RaiseScreen({ toast }) {
  const { RaiseComposer, Icon, PillButton, ChatMessage, ProgressRail, IconButton } = window.NextUpDesignSystem_2debbf;
  const D = window.KIT_DATA;
  const [turns, setTurns] = React.useState(null);
  const [step, setStep] = React.useState(0);
  const [text, setText] = React.useState("");
  const [cur, setCur] = React.useState(null);
  React.useEffect(() => {
    if (!turns || step >= D.evalSteps.length) return;
    const t = setTimeout(() => setStep((s) => s + 1), 480);
    return () => clearTimeout(t);
  }, [turns, step]);
  const start = (v) => { setTurns([{ role: "user", text: v }]); setStep(0); setText(""); setCur(null); };
  const openDraft = (i) => { setCur(i); setTurns(D.chat); setStep(D.evalSteps.length); };
  const done = turns && step >= D.evalSteps.length;
  const open = cur != null ? D.drafts[cur] : null;
  const addOns = [["receiver", "Who decides"], ["colleague", "Add a colleague"], ["meeting", "When to meet"], ["file", "Attach a file"], ["affected", "Who is affected"], ["vis", "Who sees it"]];
  return (
    <div className="kit-raise" data-screen-label="Raise">
      <aside className="kit-sb">
        <div className="kit-sb-top">
          <label className="kit-sb-search"><Icon name="search" size={12} color="#8e8e93" width={2.4} /><input placeholder="Search" /></label>
          <button className="kit-iconbtn" aria-label="Hide sidebar"><Icon name="sidebar" size={15} /></button>
        </div>
        {open && (
          <div className="kit-draft">
            <span className="kit-draft-title">{open.title}</span>
            <PillButton size="sm" variant="outline" block icon={<Icon name="check" size={12} width={2.6} />}>Published</PillButton>
            <div className="kit-halves"><PillButton size="sm" variant="fill" icon={<Icon name="idea" size={13} />}>Idea</PillButton><PillButton size="sm" variant="fill" icon={<Icon name="sparkle" size={10} color="#007aff" solid />}>Analysis</PillButton></div>
            <div className="kit-draft-foot"><span className="kit-saved"><Icon name="download" size={11} width={2.2} />Published<br />{open.published || "11:55"}</span><button className="kit-discard">Remove from list</button></div>
          </div>
        )}
        <div className="kit-ideas-head"><span className="kit-ideas-title">Ideas</span><button className="kit-new" onClick={() => { setTurns(null); setCur(null); }}><span className="kit-plus"><Icon name="plus" size={8} color="#fff" width={3} /></span>New idea</button></div>
        <div className="kit-ideas">
          <div className="kit-group">Chats &amp; drafts</div>
          {D.drafts.map((d, i) => (
            <button key={d.title} className="kit-idea" aria-current={cur === i ? "true" : undefined} onClick={() => openDraft(i)}>
              <span className="kit-idea-line"><span className="kit-idea-title">{d.title}</span><span className="kit-idea-when">{d.when}</span></span>
              <span className="kit-idea-line"><span className="kit-idea-prev">{cur === i ? "Still at 79. I read that, but the four benchmarks…" : d.prev}</span>{d.pill && <span className="kit-idea-pill">{d.pill}</span>}</span>
            </button>
          ))}
        </div>
        <div className="kit-sb-foot"><IconButton variant="outline" label="Report a problem"><Icon name="bolt" size={13} /></IconButton></div>
      </aside>
      <div className="kit-main">
        {!turns ? (
          <div className="kit-start">
            <h1 className="kit-h1" style={{ gridRow: 1 }}>Raise it, {D.me.name}</h1>
            <div style={{ gridRow: 2, width: "100%", maxWidth: 720 }}><RaiseComposer value={text} onChange={setText} onSubmit={start} onPreset={(p) => setText((t) => (t ? t + "\n" : "") + (p ? p + ": " : ""))} /></div>
          </div>
        ) : (
          <>
            <div className="kit-chat"><div className="kit-thread">
              {turns.map((t, i) => <ChatMessage key={i} role={t.role} text={t.text} />)}
              {!done && (
                <section className="kit-eval" aria-live="polite">
                  <h3 className="kit-eval-title">Evaluating</h3>
                  <div className="kit-eval-line"><span className="kit-eval-step">{D.evalSteps[step]}</span><span className="kit-eval-count">{step + 1} / {D.evalSteps.length}</span></div>
                  <span className="kit-eval-sub">Checking it against your org, budget, past ideas and goals</span>
                  <div className="kit-eval-bars">{D.evalSteps.map((_, k) => <span key={k} className="kit-eval-bar" data-s={k < step ? "done" : k === step ? "now" : undefined} />)}</div>
                </section>
              )}
              {done && cur == null && <ChatMessage text={"This belongs with Thomas Vogel, Team lead 4-series - he owns the shift plan.\n\nI still need this: which company goal does it serve?"} />}
            </div></div>
            <div className="kit-rail-wrap"><ProgressRail count={8} current={cur != null ? 5 : 1} /></div>
            <div className="kit-dock">
              <div className="nh-composer" style={{ maxWidth: 720 }}><div className="nh-composer-ring"><div className="nh-composer-inner">
                <div className="nh-composer-row">
                  <textarea className="nh-composer-field" rows={1} placeholder={cur != null ? "Add a follow-up — it goes to Overview" : "Answer, or add more detail…"} value={text} onChange={(e) => setText(e.target.value)}
                    onKeyDown={(e) => { if (e.key === "Enter" && !e.shiftKey && text.trim()) { e.preventDefault(); setTurns((ts) => [...ts, { role: "user", text }]); setText(""); toast("Scores updated · Impact & reach went up"); } }} />
                  <button className="nh-composer-dictate" aria-label="Dictate"><Icon name="mic" size={13.5} width={2} /></button>
                  <button className="nh-composer-send" data-ready={text.trim().length > 0} aria-label="Send"><Icon name="up" size={11.25} color="#fff" width={2.6} /></button>
                </div>
                <div className="kit-addons">{addOns.map(([n, l], i) => <React.Fragment key={n}>{i === 3 && <span className="kit-addon-sep" />}<IconButton variant="outline" label={l}><Icon name={n} size={14} /></IconButton></React.Fragment>)}</div>
              </div></div></div>
            </div>
          </>
        )}
      </div>
    </div>
  );
}
window.RaiseScreen = RaiseScreen;
