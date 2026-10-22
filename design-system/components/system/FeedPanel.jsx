import React from "react";
/** "From the feed": supporters + comments boxes, a one-line read, and the comment box. */
export function FeedPanel({ supporters = 0, comments = 0, line, onPost }) {
  const [draft, setDraft] = React.useState("");
  const post = () => { if (!draft.trim()) return; onPost && onPost(draft.trim()); setDraft(""); };
  return (
    <div className="nu-card" data-pad="sm">
      <h3 className="nu-card-title">From the feed</h3>
      <div className="nu-stat-boxes">
        <div className="nu-stat-box"><span className="nu-stat-num">{supporters}</span><span className="nu-label">supporters</span></div>
        <div className="nu-stat-box"><span className="nu-stat-num">{comments}</span><span className="nu-label">comments</span></div>
      </div>
      {line && <p className="nu-para" style={{ fontSize: 13 }}>{line}</p>}
      {comments === 0 && <p className="nu-label">No comments yet.</p>}
      <div className="nu-compose"><input className="nu-input" placeholder="Add a comment" value={draft} onChange={(e) => setDraft(e.target.value)} onKeyDown={(e) => { if (e.key === "Enter") post(); }} /><button type="button" className="nu-post" data-live={draft.trim() ? "true" : undefined} onClick={post}>Post</button></div>
    </div>
  );
}
