"use client";

import { useState } from "react";
import { useDemo } from "@/components/dashboard/DemoProvider";
import { PersonFace } from "@/components/ui/elements";
import { commentThreads, type CommentThread } from "@/features/projects/step-panel";
import type { ReducedProject, Step } from "@/features/projects/types";
import { useT } from "@/i18n/client";
import { useRights, useSend } from "../../parts";
import styles from "./Panel.module.css";

function Composer({ initialText = "", reply, post, onCancel }: {
  initialText?: string; reply?: CommentThread; post: (text: string, replyTo?: string) => boolean; onCancel?: () => void;
}) {
  const t = useT();
  const [text, setText] = useState(initialText);
  return <form className={styles.composer} aria-label={reply ? t("projectSteps.replyingTo", { name: reply.by }) : t("projectSteps.writeComment")} onSubmit={(e) => {
    e.preventDefault();
    const body = text.trim();
    if (body && body.length <= 2000 && post(body, reply?.id)) { setText(""); onCancel?.(); }
  }} onKeyDown={(e) => {
    if (e.key === "Escape" && onCancel) { e.preventDefault(); e.stopPropagation(); onCancel(); }
  }}>
    {reply && <span className={styles.hint}>{t("projectSteps.replyingTo", { name: reply.by })}</span>}
    <textarea className="nh-input" aria-label={t("projectSteps.writeComment")} placeholder={t("projectSteps.writeComment")} value={text} onChange={(e) => setText(e.target.value)} maxLength={2000} rows={2} autoFocus={!!reply} />
    <div className={styles.row}>
      <button type="submit" className="nh-btn nh-btn-primary nh-btn-sm" disabled={!text.trim()}>{t(reply ? "projectSteps.reply" : "projectSteps.postComment")}</button>
      {onCancel && <button type="button" className={styles.link} onClick={onCancel}>{t("projectSteps.cancelReply")}</button>}
    </div>
  </form>;
}

export function Comments({ p, step, draftComment }: { p: ReducedProject; step: Step; draftComment?: string }) {
  const { act, f } = useDemo();
  const t = useT();
  const rights = useRights(p);
  const send = useSend(p);
  const [replyTo, setReplyTo] = useState<string | null>(null);
  const canComment = rights.check("project.step.commented", { stepId: step.id, text: "-" }).ok;
  const post = (text: string, replyTo?: string) => send("project.step.commented", { stepId: step.id, text, ...(replyTo ? { replyTo } : {}) }, () => act.project.stepComment(p.id, step.id, text, replyTo));
  const renderThread = (node: CommentThread): React.ReactNode => <div key={node.id} className={styles.section}>
    <div className={styles.comment}>
      <PersonFace name={node.by} size="sm" />
      <div className={styles.commentBody}>
        <span className={styles.hint}><strong>{node.by}</strong> · {f(node.day)}</span>
        <p>{node.text}</p>
        {canComment && <div><button type="button" className={styles.link} onClick={() => setReplyTo(node.id)}>{t("projectSteps.reply")}</button></div>}
        {canComment && replyTo === node.id && <Composer key={node.id} reply={node} initialText={`@${node.by} `} post={post} onCancel={() => setReplyTo(null)} />}
      </div>
    </div>
    {node.replies.length > 0 && <div className={styles.replies}>{node.replies.map(renderThread)}</div>}
  </div>;
  if (!step.comments.length && !canComment) return null;
  return <section className={styles.section} aria-label={t("projectSteps.comments")}>
    <h3>{t("projectSteps.comments")}</h3>
    {commentThreads(step).map(renderThread)}
    {canComment && <Composer key={draftComment ?? ""} initialText={draftComment} post={post} />}
  </section>;
}
