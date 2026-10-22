// Feed - dashboard/team/FeedView: Open/Archive, site + sort, department chips, cover cards with Support.
function FeedScreen({ onOpen }) {
  const { PillButton, FilterChip, Segmented, Badge, Icon, Initials } = window.NextUpDesignSystem_2debbf;
  const D = window.KIT_DATA;
  const [dept, setDept] = React.useState("All");
  const [view, setView] = React.useState("open");
  const [sup, setSup] = React.useState({});
  const depts = ["All", "Production", "Engineering", "Quality", "Finance", "Ops & Admin", "HR / IT", "Field Service", "Sales"];
  const list = D.feed.filter((f) => (view === "open" ? !f.archived : f.archived) && (dept === "All" || f.tags.includes(dept)));
  const n = (d) => D.feed.filter((f) => !f.archived && (d === "All" || f.tags.includes(d))).length;
  return (
    <div className="kit-feed" data-screen-label="Feed">
      <div className="kit-feed-head">
        <h1 className="nu-page-title">Feed</h1>
        <div className="kit-row-gap">
          <PillButton variant="light" icon={<Icon name="pin" size={14} width={2.2} />}>All sites</PillButton>
          <PillButton icon={<Icon name="sort" size={14} width={2.2} />}>Most supported</PillButton>
        </div>
      </div>
      <div><Segmented tone="white" value={view} onChange={setView} items={[{ label: "Open", key: "open", count: D.feed.filter((f) => !f.archived).length }, { label: "Archive", key: "archive", count: D.feed.filter((f) => f.archived).length }]} /></div>
      <div className="kit-chips">{depts.map((d) => <FilterChip key={d} on={dept === d} count={n(d)} onClick={() => setDept(d)}>{d}</FilterChip>)}</div>
      <div className="kit-grid">
        {list.map((f) => {
          const on = !!sup[f.id];
          return (
            <div key={f.id} className="kit-fcard" onClick={() => onOpen && onOpen(f.id)}>
              <div className="kit-cover">
                <img src={"../../assets/feed/library/" + f.img + ".webp"} alt="" />
                <div className="kit-scrim" />
                <div className="kit-cover-top">
                  <span className="kit-ini">{Initials(f.from)}</span>
                  <div style={{ flex: 1, minWidth: 0 }}><span className="kit-author">{f.from}</span><span className="kit-dept">{f.dept}</span></div>
                  <Badge tone={f.tone} size="md">{f.stage}</Badge>
                </div>
                <div className="kit-cover-bottom"><span className="kit-cover-stat">{f.stat}</span><span className="kit-cover-hook">{f.hook}</span></div>
              </div>
              <h3 className="kit-ftitle">{f.title}</h3>
              <div className="kit-ffoot" onClick={(e) => e.stopPropagation()}>
                <PillButton size="sm" variant={on ? "outline" : "dark"} icon={<Icon name={on ? "check" : "up"} size={13} width={2.6} />} count={f.support + (on ? 1 : 0)} onClick={() => setSup((s) => ({ ...s, [f.id]: !s[f.id] }))}>{on ? "Supported" : "Support"}</PillButton>
                <span className="kit-comments"><Icon name="comment" size={14} width={2.2} />{f.comments}</span>
                <span style={{ marginLeft: "auto", color: "#c7c7cc", display: "flex" }}><Icon name="right" size={14} width={2.2} /></span>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
window.FeedScreen = FeedScreen;
