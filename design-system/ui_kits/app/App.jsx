// The signed-in app: ShellBar + profile popover + toast; places switch the screen.
function App() {
  const { ShellBar, Ground } = window.NextUpDesignSystem_2debbf;
  const D = window.KIT_DATA;
  const [place, setPlace] = React.useState(() => { const p = localStorage.getItem("nextup-kit-place"); return ["login", "Ideas", "Inbox", "Feed", "Sent", "Projects"].includes(p) ? p : "login"; });
  const [pop, setPop] = React.useState(false);
  const [toast, setToast] = React.useState(null);
  React.useEffect(() => { localStorage.setItem("nextup-kit-place", place); }, [place]);
  React.useEffect(() => { if (!toast) return; const t = setTimeout(() => setToast(null), 2600); return () => clearTimeout(t); }, [toast]);
  const go = (p) => { setPlace(p); setPop(false); };
  if (place === "login") return <LoginScreen onLogin={() => go("Ideas")} />;
  const items = [{ label: "Ideas" }, { label: "Inbox", count: 7 }, { label: "Feed" }, { label: "Projects" }];
  const screen = {
    Ideas: <RaiseScreen toast={setToast} />,
    Inbox: <InboxScreen toast={setToast} />,
    Feed: <FeedScreen onOpen={() => go("Projects")} />,
    Projects: <ProjectScreen toast={setToast} />,
    Sent: <SentScreen toast={setToast} />,
  }[place];
  return (
    <div className="kit-root nu">
      <Ground />
      <div style={{ position: "relative" }}>
        <ShellBar logoBase="../../assets/brand/" items={items} value={place} onChange={go} me={D.me.ini} onMe={() => setPop((p) => !p)} onLogo={() => go("Ideas")} />
        {pop && (
          <div className="kit-me" style={{ right: 16, top: 52, position: "absolute" }} role="dialog" aria-label="Profile">
            <div className="kit-me-head"><span className="kit-me-av">{D.me.ini}</span><span><span className="kit-me-name">{D.me.name}</span><span className="kit-me-line">{D.me.line}</span></span></div>
            <div className="kit-me-stats"><span><strong>Team leader</strong></span><span><strong>7</strong> in inbox</span><span><strong>14</strong> decided</span></div>
            <div className="kit-me-foot">
              <button className="kit-me-link" onClick={() => go("Ideas")}>My profile <span>→</span></button>
              <button className="kit-me-link" onClick={() => go("Sent")}>What I sent <span>→</span></button>
              <button className="kit-logout" onClick={() => go("login")}>Log out</button>
            </div>
          </div>
        )}
      </div>
      <main className="kit-content" data-wide={place === "Inbox" || place === "Projects" ? "true" : undefined} data-full={place === "Ideas" ? "true" : undefined}><div className="kit-inner">{screen}</div></main>
      {toast && <div className="nh-toast" role="status">{toast}</div>}
    </div>
  );
}
window.App = App;
