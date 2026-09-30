"use client";
// TEAM MEMBER home: the idea studio (docs/IDEAS.md), which replaced the one-line raise box.
//
//   left    your drafts, like a chat history          DraftRail
//   middle  the conversation with the coach           IdeaChat + BenchmarkCard
//   right   score against the publish line, actions   ActionPanel
//
// Every message is benchmarked on the server (/api/<company>/ideas/turn) on four coloured bars; the
// coach asks about the weakest one. At the company's threshold the idea can be published: the
// server re-checks the score, then the page appends case.raised and plays the route
// (PublishSequence). Below 1100px the drafts become a drawer; below 760px the actions become a
// bottom sheet with the score in a bar that stays on screen.
import { useMemo, useState } from "react";
import { useDemo } from "@/components/dashboard/DemoProvider";
import { PageSkeleton } from "@/components/dashboard/shared/PageSkeleton";
import { newId } from "@/features/cases/events";
import { closest, evaluate, type Evaluation } from "@/features/evaluate";
import { ideaFromTurns } from "@/features/ideas/coach";
import { saveShots, shrinkImage, type Shot } from "@/lib/shots";
import { useIdeaStudio } from "@/lib/use-idea-studio";
import { ActionPanel, type Similar } from "./ActionPanel";
import { DraftRail } from "./DraftRail";
import { IdeaChat } from "./IdeaChat";
import { PublishSequence } from "./PublishSequence";
import { ScoreRing } from "./ScoreRing";
import styles from "./IdeaStudio.module.css";

const MAX_SHOTS = 4;
type Sheet = "drafts" | "actions" | null;

export function IdeaStudio() {
  const { seed, S, persona, act, ready, href, tenant, showToast, serverMode, actor } = useDemo();
  const studio = useIdeaStudio(tenant.slug, serverMode);
  const { draft, live, threshold } = studio;
  const [affected, setAffected] = useState<string[]>([]); // before a draft exists; after, the draft's own
  const [shots, setShots] = useState<Shot[]>([]);
  const [reading, setReading] = useState(0);
  const [sheet, setSheet] = useState<Sheet>(null);
  const [publishing, setPublishing] = useState<{ ev: Evaluation; caseId: string } | null>(null);
  const [busy, setBusy] = useState(false);

  const who = persona.who;
  const turns = useMemo(() => draft?.turns ?? [], [draft]);
  const idea = useMemo(() => ideaFromTurns(turns), [turns]);
  const people = draft?.affected ?? affected;
  const parts = live?.parts ?? draft?.scores ?? [];
  const overall = studio.overall;
  const published = draft?.status === "published" && draft.caseId ? { caseHref: href("/cases/" + draft.caseId) } : null;

  // What already exists: the closest open case, so the author can back it instead of repeating it.
  const similar: Similar | null = useMemo(() => {
    if (!idea.text) return null;
    const c = closest(idea.text, S.cases.filter((x) => x.open && x.id !== draft?.caseId), (x) => x.title);
    return c ? { id: c.id, title: c.title, from: c.from, affectsMe: c.history.some((e) => e.type === "case.affected" && e.actor === actor) && !c.history.some((e) => e.type === "case.unaffected" && e.actor === actor) } : null;
  }, [idea.text, S.cases, draft?.caseId, actor]);

  if (!ready) return <PageSkeleton kind="raise" delay />;

  const setPeople = (next: string[]) => {
    if (draft) void studio.save({ affected: next });
    else setAffected(next);
  };
  const attach = (files: FileList | null) => {
    const picked = Array.from(files ?? []).filter((f) => f.type.startsWith("image/")).slice(0, MAX_SHOTS - shots.length);
    if (!picked.length) return;
    setReading((n) => n + picked.length);
    picked.forEach((f) => shrinkImage(f)
      .then((shot) => setShots((s) => {
        const next = s.length < MAX_SHOTS ? [...s, shot] : s;
        if (draft) void studio.save({ attachments: next.length });
        return next;
      }), () => showToast("Could not read " + f.name + " as an image."))
      .finally(() => setReading((n) => n - 1)));
  };
  const removeShot = (url: string) => setShots((s) => {
    const next = s.filter((x) => x.url !== url);
    if (draft) void studio.save({ attachments: next.length });
    return next;
  });

  const startNew = () => { studio.startNew(); setAffected([]); setShots([]); setSheet(null); setPublishing(null); };
  const openDraft = (id: string) => { void studio.open(id); setShots([]); setSheet(null); setPublishing(null); };
  const send = (text: string) => void studio.send(text, { affected: people, attachments: shots.length });

  const publish = async () => {
    if (!draft || busy) return;
    setBusy(true); setSheet(null);
    const caseId = newId("c");
    const r = await studio.publish(caseId);
    setBusy(false);
    if (!r.ok) { showToast(r.reason); return; }
    // The server said yes: raise it now, then show the route while the case is already on its desk.
    const ev = evaluate({ kind: "idea", text: r.title, context: r.body, affected: people, attachments: shots.length, who }, { ...seed, cases: S.cases }, r.brain);
    act.raise({ ...ev.payload, title: r.title, body: r.body }, caseId);
    if (shots.length && !saveShots(tenant.slug, caseId, shots)) showToast("Published — the screenshots did not fit in this browser's storage.");
    setPublishing({ ev, caseId });
    void studio.open(draft.id);
  };

  const panel = (
    <ActionPanel
      started={!!draft && turns.length > 0}
      published={published}
      title={draft?.title || idea.title}
      savedAt={draft?.updatedAt ?? null}
      parts={parts} overall={overall} threshold={threshold} busy={busy || !!studio.sending}
      people={seed.people} depts={seed.depts} me={who.name}
      affected={people} onAffected={setPeople}
      shots={shots} reading={reading} onAttach={attach} onRemoveShot={removeShot}
      similar={similar} similarHref={similar ? href("/cases/" + similar.id) : null}
      onMeToo={() => { if (similar) act.affect(similar.id); }}
      onPublish={() => void publish()}
      onSave={() => { void studio.save({}).then((ok) => showToast(ok ? "Draft saved. You find it on the left." : "Could not save the draft.")); }}
      onRename={(title) => void studio.save({ title })}
      onDiscard={() => { void studio.discard(); setShots([]); showToast("Draft discarded."); }}
      onNew={startNew}
    />
  );

  return (
    <div className={styles.studio} data-sheet={sheet ?? undefined}>
      <div className={styles.phoneBar}>
        <button type="button" className={styles.phoneBtn} onClick={() => setSheet(sheet === "drafts" ? null : "drafts")} aria-expanded={sheet === "drafts"}>Drafts · {studio.drafts.filter((d) => d.status === "draft").length}</button>
        <span className={styles.phoneTitle}>{draft?.title || idea.title || "New idea"}</span>
        <button type="button" className={styles.phoneScore} onClick={() => setSheet(sheet === "actions" ? null : "actions")} aria-expanded={sheet === "actions"} aria-label={"Score " + overall + " — actions"}>
          <ScoreRing parts={parts} overall={overall} size={34} />
        </button>
      </div>

      <div className={styles.railWrap}>
        <DraftRail drafts={studio.drafts} current={draft?.id ?? null} threshold={threshold} loaded={studio.loaded} onNew={startNew} onOpen={openDraft} />
      </div>

      <IdeaChat who={who.name} turns={turns} live={live} sending={studio.sending} error={studio.error} locked={!!published} threshold={threshold} onSend={send}>
        {publishing && (
          <PublishSequence ev={publishing.ev} promiseDays={seed.promiseDays} caseHref={href("/cases/" + publishing.caseId)} dashHref={href("/dashboard")} onDone={() => setPublishing(null)} />
        )}
      </IdeaChat>

      <div className={styles.actionsWrap}>{panel}</div>
      {sheet && <button type="button" className={styles.scrim} onClick={() => setSheet(null)} aria-label="Close" />}
    </div>
  );
}
