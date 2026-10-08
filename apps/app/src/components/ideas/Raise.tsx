"use client";
// The raise page (Claude Design handoff "Raise", docs/IDEAS.md): type one line, add context and
// people, NextUp evaluates it, the coach grills you on what is missing, you review the analysis and
// publish it to the right desk.
//
//   sidebar   search, the open draft and its actions, the ideas list        RaiseSidebar
//   main      start | chat (+ progress rail) | idea | analysis             RaiseStart, RaiseChat, RaiseSheets
//
// The conversation, the drafts, the benchmark and publishing are the idea studio's (lib/use-idea-studio.ts).
// The receiver, colleagues, meeting, visibility, pins, idea edits and "not sure" answers are stand-ins
// (raisePreview.ts, RAISE-FOR-KEVIN.txt). What is open here - the conversation, the view, unsent text -
// is kept per company and person (lib/use-kept.ts): a visit to the dashboard and back finds it as it was.
//
// `script`: the static demo (app/demo, no company behind it) - the composer offers the demo script's next
// text (features/ideas/demo-script.ts), the coach answers it with its prepared reply, and nothing leaves
// the browser. The company's /raise never sets it.
import { useEffect, useMemo, useRef, useState } from "react";
import { useDemo } from "@/components/dashboard/DemoProvider";
import { PageSkeleton } from "@/components/dashboard/shared/PageSkeleton";
import { stripTags } from "@/features/assist/check";
import { newId } from "@/features/cases/events";
import { closest, evaluate, GOALS } from "@/features/evaluate";
import { ideaFromTurns } from "@/features/ideas/coach";
import { ideaContext, scoreDraft } from "@/features/ideas/drafts";
import { DEMO_CASE, DEMO_SCRIPT, scriptStep } from "@/features/ideas/demo-script";
import { adviceOf, clockLabel, dialsOf, dialsUp, greetName, IDEA_UPDATE, initials, isUnsure, railOf, splitIdea, splitUpdate, whenLabel, type Gap } from "@/features/ideas/raise";
import { DEV_SAMPLES, registerDevFill } from "@/lib/dev-fill";
import { receiverFor, receiversFor, type Receiver, type ReceiverInput } from "@/features/ideas/receivers";
import { SPEND_LIMIT_EUR } from "@/features/ideas/drafts";
import { saveShots, shrinkImage } from "@/lib/shots";
import { brainProposalAction } from "@/server/actions/brain";
import { useIdeaStudio } from "@/lib/use-idea-studio";
import { useKept } from "@/lib/use-kept";
import type { Chip } from "./RaiseComposer";
import { RaiseComposer } from "./RaiseComposer";
import { actionsOf, RaiseActions, RaiseMenu, type MenuView } from "./RaiseMenu";
import { ReceiverDialog, type Work } from "./RaisePublish";
import { RaiseChat, type ChatMsg } from "./RaiseChat";
import { AnalysisSheet, IdeaSheet, type Reviewer, type Similar, type Source } from "./RaiseSheets";
import { RaiseSidebar, type DraftCard, type IdeaRow } from "./RaiseSidebar";
import { EVAL_STEPS, RaiseStart } from "./RaiseStart";
import { useRaisePreview, type FileItem } from "./raisePreview";
import { Icon } from "./raiseIcons";
import { RaisePeople } from "./RaisePerson";
import s from "./Raise.module.css";

const MAX_SHOTS = 4; // screenshots kept with the case in this browser (lib/shots.ts)
type Menu = { at: "chat" | "card" | "add"; view: MenuView } | null; // "add": under a start-page action button

export function Raise({ script = false }: { script?: boolean }) {
  const { seed, S, persona, role, act, ready, href, tenant, showToast, serverMode } = useDemo();
  const story = script && role === "member"; // the demo script is the employee's story; others raise their own
  // The static demo scores and answers in this browser, against the seed it shows.
  const local = useMemo(() => (script ? ideaContext(seed.routes, GOALS, S.cases) : null), [script, seed.routes, S.cases]);
  const studio = useIdeaStudio(tenant.slug, serverMode, persona.who.name, local);
  const scope = tenant.slug + "/" + persona.who.name; // whose page this is: what is kept across visits, per person
  const preview = useRaisePreview(scope);
  const { draft, live, threshold, sending } = studio;
  const who = persona.who;

  const [stage, setStage] = useKept<"start" | "chat">(scope, "stage", "start");
  const [openId, setOpenId] = useKept<string | null>(scope, "open", null); // the draft open in the chat, reopened on the next visit
  const [view, setView] = useKept<"chat" | "idea" | "analysis">(scope, "view", "chat");
  const [sb, setSb] = useKept<"auto" | "open" | "hidden">(scope, "sb", "auto"); // auto: open on screens, closed on phones (CSS)
  const [query, setQuery] = useState("");
  const [startText, setStartText] = useKept(scope, "startText", "");
  const [startAff, setStartAff] = useKept<string[]>(scope, "startAff", []);
  const [files, setFiles] = useKept<Record<string, FileItem[]>>(scope, "files", {});
  const [slot, setSlot] = useKept(scope, "slot", "n0"); // where the choices of the open idea live: the start form's key, or a draft id
  const [aliases, setAliases] = useKept<Record<string, string>>(scope, "aliases", {}); // draft id -> the start slot that made it
  const [text, setText] = useKept(scope, "text", "");
  const [ask, setAsk] = useState<string | null>(null); // a rail question the author chose to answer now
  const [menu, setMenu] = useState<Menu>(null);
  const [evalStep, setEvalStep] = useState<number | null>(null);
  const [firstPending, setFirstPending] = useState(false);
  const [busy, setBusy] = useState(false);
  // Publishing: the step NextUp is on while it finds who should receive it, then the suggestions to
  // choose from; `pubWork` is the step while the chosen one is published.
  const [pubStep, setPubStep] = useState<null | Work | Receiver[]>(null);
  const [pubWork, setPubWork] = useState<Work | null>(null);
  const [rcvInput, setRcvInput] = useState<ReceiverInput | null>(null); // what the suggestions were scored on, for someone picked by hand
  const [now, setNow] = useState(() => new Date());
  const startField = useRef<HTMLTextAreaElement>(null);
  const fillRef = useRef<() => void>(() => {});
  const chatField = useRef<HTMLTextAreaElement>(null);

  const key = slot;
  const extras = preview.extras(key);
  const myFiles = useMemo(() => files[key] ?? [], [files, key]);
  const turns = useMemo(() => draft?.turns ?? [], [draft]);
  const idea = useMemo(() => ideaFromTurns(turns), [turns]);
  const affected = draft?.affected ?? startAff;
  const parts = live?.parts ?? draft?.scores ?? [];
  const overall = studio.overall;
  const published = draft?.status === "published";
  const firstIdx = turns.findIndex((t) => t.role === "user");
  const firstText = firstIdx >= 0 ? turns[firstIdx].text : "";
  const edit = draft ? preview.edits[draft.id] ?? null : null;
  const shown = splitIdea(edit ? edit.text : firstText);
  // The demo script: where this conversation stands in it (-1 once the author wrote their own words).
  const scriptAt = story ? scriptStep(turns) : -1;
  const scriptDone = scriptAt === DEMO_SCRIPT.length; // all of it said: publishing is offered, as for a rail with nothing open

  useEffect(() => { const t = setInterval(() => setNow(new Date()), 60_000); return () => clearInterval(t); }, []);

  // Back on the page: the conversation that was open is opened again - or, gone in the meantime, the
  // start page. Only once the person is known (`ready`), so nobody else's draft is opened on the way.
  useEffect(() => {
    if (!ready || !openId || studio.draft?.id === openId) return;
    setStage("chat");
    void studio.open(openId).then((d) => { if (!d) { setOpenId(null); setStage("start"); studio.setError(""); } });
  }, [ready, scope]); // eslint-disable-line react-hooks/exhaustive-deps -- once per arrival, not on every change
  // The draft the chat shows is the one to reopen; the start page has none.
  useEffect(() => { if (draft?.id && stage === "chat") setOpenId(draft.id); }, [draft?.id, stage, setOpenId]);

  // What the evaluation and the analysis say about who receives it: the routing, run here on the open idea.
  const ev = useMemo(() => {
    if (!idea.text && !startText.trim()) return null;
    return evaluate({ kind: "idea", text: idea.text || startText, affected, attachments: myFiles.length, who }, { ...seed, cases: S.cases });
  }, [idea.text, startText, affected, myFiles.length, who, seed, S.cases]);

  const similar = useMemo(() => {
    if (!idea.text) return null;
    return closest(idea.text, S.cases.filter((c) => c.open && c.id !== draft?.caseId), (c) => c.title);
  }, [idea.text, S.cases, draft?.caseId]);

  // The dev panel's "Fill a sample idea", offered while the start view is open (lib/dev-fill.ts).
  useEffect(() => (stage === "start" ? registerDevFill(() => fillRef.current()) : undefined), [stage]);
  useEffect(() => {
    fillRef.current = () => {
      const x = DEV_SAMPLES[Math.floor(Math.random() * DEV_SAMPLES.length)];
      // People from this company's own seed: the samples' names only where they exist (the static demo renames them).
      const known = (n: string) => seed.people.some((p) => p.name === n);
      const lead = seed.people.find((p) => p.name === who.name)?.reportsTo ?? ev?.lead;
      const coll = seed.people.filter((p) => p.name !== who.name && p.name !== lead).map((p) => p.name);
      setStartText(x.text + "\n\n" + x.ctx); setStartAff(x.aff.filter((a) => !/^[A-Z]\. /.test(a) || known(a))); setMenu(null);
      setFiles((f) => ({ ...f, [slot]: x.files.map((name) => ({ id: newId("f"), name, url: "", img: false, file: new File([], name) })) }));
      preview.setExtras(slot, { recv: lead ? [lead] : [], coll: coll.length ? [coll[Math.floor(Math.random() * coll.length)]] : [], meet: Math.random() > 0.5 ? { dur: "15 min", when: "this week" } : null, vis: "public", visTo: [] });
    };
  });

  if (!ready) return <PageSkeleton kind="raise" delay />;

  // After the first answer the analysis opens, once the evaluation has finished playing.
  const shownView = firstPending && stage === "chat" && !sending && turns.length > 0 ? "analysis" : view;
  // The rail: the five points the person who decides needs, as the benchmark sees them now.
  const benchCtx = ideaContext(seed.routes, GOALS, S.cases);
  const gaps: Gap[] = draft && turns.length ? railOf(parts, preview.unknown[draft.id] ?? []) : [];
  const allAnswered = gaps.length > 0 && !gaps.some((g) => g.status === "open" || g.status === "active");

  // ── Actions ─────────────────────────────────────────────────────────────────────────────────
  const setAffected = (next: string[]) => { if (draft) void studio.save({ affected: next }); else setStartAff(next); };
  const setMyFiles = (next: FileItem[]) => {
    setFiles((f) => ({ ...f, [key]: next }));
    if (draft) void studio.save({ attachments: next.length });
  };
  const addFiles = (list: FileList | null) => {
    const picked = Array.from(list ?? []).filter((f) => f.type.startsWith("image/") || f.type === "application/pdf" || f.name.toLowerCase().endsWith(".pdf"));
    if (!picked.length) return;
    setMyFiles([...myFiles, ...picked.map((f) => ({ id: newId("f"), name: f.name, url: URL.createObjectURL(f), img: f.type.startsWith("image/"), file: f }))]);
    setMenu(null);
  };
  const removeFile = (id: string) => {
    const f = myFiles.find((x) => x.id === id);
    if (f) URL.revokeObjectURL(f.url);
    setMyFiles(myFiles.filter((x) => x.id !== id));
  };
  const openMenu = (at: NonNullable<Menu>["at"], v: MenuView = "main") => setMenu({ at, view: v });
  const toggleMenu = (at: "chat") =>setMenu((m) => (m ? null : { at, view: "main" }));

  const go = (v: "chat" | "idea" | "analysis") => { setFirstPending(false); setView(v); };
  // Leaving a draft the start form made: remember which slot holds its choices, for when it is reopened.
  const leave = () => { if (draft && slot !== draft.id) setAliases((a) => ({ ...a, [draft.id]: slot })); };
  const reset = () => { leave(); setText(""); setAsk(null); setMenu(null); go("chat"); setSb((x) => (x === "open" ? "auto" : x)); };
  const newIdea = () => {
    studio.startNew(); reset(); setOpenId(null);
    setStage("start"); setStartText(""); setStartAff([]); setEvalStep(null); setSlot(newId("n"));
    setTimeout(() => startField.current?.focus(), 60);
  };
  const openDraft = (id: string) => {
    void studio.open(id); reset(); setOpenId(id);
    setStage("chat"); setEvalStep(null); setSlot(aliases[id] ?? id);
  };

  // Send from the start page: what was typed and the chosen extras go as the first message;
  // the evaluation plays while the coach answers.
  const startRaise = () => {
    const main = startText.trim();
    if (main.length < 3 || evalStep !== null) return;
    const extra = [
      extras.recv.length ? "Suggested receiver: " + extras.recv.join(", ") : "",
      extras.coll.length ? "Colleagues who know this: " + extras.coll.join(", ") : "",
      extras.meet ? "I’d like a " + extras.meet.dur + " meeting " + extras.meet.when + "." : "",
    ].filter(Boolean).join("\n");
    const message = main + (extra ? "\n\n" + extra : "");
    // The script goes on in the chat, where its next answer is offered; any other idea opens its analysis first.
    setMenu(null); setEvalStep(0); setFirstPending(!(story && scriptStep([{ role: "user", text: message }]) === 1));
    void studio.send(message, { affected: startAff, attachments: myFiles.length });
    let step = 0;
    const t = setInterval(() => {
      step += 1;
      if (step < EVAL_STEPS.length) { setEvalStep(step); return; }
      clearInterval(t);
      setEvalStep(null); setStage("chat"); setView("chat"); setStartText("");
    }, 420);
  };

  // What the receiver suggestions are worked out from: the idea, the org, the routing map, and how
  // everyone answered the cases on their desk.
  const receiverInput = (text: string, lead: string, brain: ReceiverInput["brain"]): ReceiverInput => ({
    text, routes: seed.routes, people: seed.people, depts: seed.depts, promiseDays: seed.promiseDays, spendLimitEur: SPEND_LIMIT_EUR,
    cases: S.cases.map((c) => ({ assignee: c.assignee, raisedDay: c.raisedDay, decided: c.decided })),
    lead, me: who.name, myDept: who.line.split(",")[0].trim(), affected, brain, yours: extras.recv[0] ?? null,
  });

  // One step of the work, said in the button while it runs: the label and the orb's mode, the real work,
  // and a short minimum so each step can be read.
  const step = async <T,>(set: (w: Work) => void, label: string, orb: Work["orb"], work: () => Promise<T> | T, min: number): Promise<T> => {
    set({ label, orb });
    const [v] = await Promise.all([Promise.resolve().then(work), new Promise((r) => setTimeout(r, min))]);
    return v;
  };

  // "Publish idea": the button says what NextUp does - reads the idea, asks the router, checks the org
  // chart, ranks who fits - then the author picks who receives it (RaisePublish.tsx).
  const askReceiver = async () => {
    if (!draft || busy || published || pubStep) return;
    setMenu(null);
    const text = await step(setPubStep, "Reading your idea…", "working", () => idea.text, 450);
    const brain = await step(setPubStep, "Asking the router…", "searching", () => (script ? null : brainProposalAction({ slug: tenant.slug, title: idea.title, body: idea.body }).catch(() => null)), 650);
    const lead = await step(setPubStep, "Checking the org chart…", "connecting", () => ev?.lead ?? "Triage desk", 500);
    const input = receiverInput(text, lead, brain ? { routeId: brain.proposal.routeId, confidence: brain.proposal.confidence, reason: brain.reason } : null);
    setRcvInput(input);
    const options = await step(setPubStep, "Ranking who fits…", "weaving", () => receiversFor(input), 450);
    setPubStep(options);
  };

  const publish = async (to: Receiver) => {
    if (!draft || busy || published) return;
    setBusy(true);
    const caseId = newId("c");
    const r = await step(setPubWork, "Checking the draft…", "solving", () => studio.publish(caseId), 500);
    if (!r.ok) { setBusy(false); setPubWork(null); setPubStep(null); showToast(r.reason); return; }
    // The server said yes: raise it now, on the desk the author chose. The router's own proposal stays
    // in the payload, so the decision log can compare it with where the case went.
    const e = evaluate({ kind: "idea", text: r.title, context: r.body, affected, attachments: myFiles.length, who }, { ...seed, cases: S.cases }, r.brain);
    // The demo script's case carries its main points instead of the raw conversation.
    const made = story && scriptDone ? DEMO_CASE : { body: r.body, upside: e.payload.upside };
    await step(setPubWork, "Raising the case for " + to.name + "…", "composing", () => act.raise({ ...e.payload, title: r.title, body: made.body, upside: made.upside, assignee: to.name, routeId: to.routeId ?? e.payload.routeId }, caseId), 600);
    const images = myFiles.filter((f) => f.img).slice(0, MAX_SHOTS);
    if (images.length) {
      const kept = await step(setPubWork, "Saving the screenshots…", "working", async () => {
        const shots = await Promise.all(images.map((f) => shrinkImage(f.file).catch(() => null)));
        return saveShots(tenant.slug, caseId, shots.filter((x) => x !== null));
      }, 400);
      if (!kept) showToast("Published — the screenshots did not fit in this browser's storage.");
    }
    setBusy(false); setPubWork(null); setPubStep(null);
    void studio.open(draft.id);
  };

  const send = () => {
    const t = text.trim();
    if (!t || sending) return;
    if (/^publish( now)?$/i.test(t)) { setText(""); void askReceiver(); return; }
    if (/^review analysis$/i.test(t)) { setText(""); go("analysis"); return; }
    if (published) { showToast("This idea is published — follow-ups go through Overview."); return; }
    if (t.length < 3) return;
    // "Not sure": the active topic becomes unknown, and the coach is told not to ask it again.
    const skip = draft ? [...(preview.unknown[draft.id] ?? [])] : [];
    const unsure = draft && isUnsure(t) ? (gaps.find((g) => g.ask === ask) ?? gaps.find((g) => g.status === "active")) : undefined;
    if (draft && unsure) { preview.markUnknown(draft.id, unsure.id); skip.push(unsure.id); }
    // Edits made in the Idea view travel with this message, so the coach and the score see them.
    const message = edit ? t + IDEA_UPDATE + edit.text : t;
    if (draft && edit) preview.edit(draft.id, null);
    void studio.send(message, { affected, attachments: myFiles.length, skip });
    setText(""); setAsk(null);
  };

  const editIdea = (description: string, context: string) => {
    if (!draft) return;
    preview.edit(draft.id, { orig: firstText, text: description + (context.trim() ? "\n\n" + context : "") });
  };

  // ── Derived for the views ───────────────────────────────────────────────────────────────────
  // Where it went: the published case's own assignee; before that, the team lead it would land with.
  const lead = (draft?.caseId ? S.cases.find((c) => c.id === draft.caseId)?.assignee : undefined) ?? ev?.lead ?? "your team lead";
  const team = affected[0] ?? who.line.split(",")[0];

  const chips: Chip[] = (() => {
    const at = stage === "start" ? "add" : "card";
    const out: Chip[] = [];
    extras.recv.forEach((n) => out.push({ key: "r" + n, title: n, sub: "Receiver", kind: "person", person: n, lead: initials(n), open: () => openMenu(at, "receiver"), remove: () => preview.setExtras(key, { recv: [] }) }));
    extras.coll.forEach((n) => out.push({ key: "c" + n, title: n, sub: "Colleague", kind: "person", person: n, lead: initials(n), open: () => openMenu(at, "colleague"), remove: () => preview.setExtras(key, { coll: extras.coll.filter((x) => x !== n) }) }));
    if (extras.meet) out.push({ key: "m", title: extras.meet.dur, sub: "Meeting · " + extras.meet.when, kind: "meeting", lead: "", icon: "meeting", open: () => openMenu(at, "meeting"), remove: () => preview.setExtras(key, { meet: null }) });
    if (affected.length) out.push({ key: "a", title: affected.length === 1 ? affected[0] : affected[0] + " +" + (affected.length - 1), sub: "Affected", kind: "affected", lead: "", icon: "affected", open: () => openMenu(at, "affected"), remove: () => setAffected([]) });
    if (extras.vis !== "public") out.push(extras.vis === "private"
      ? { key: "v", title: "Private", sub: "You and receiver", kind: "private", lead: "", icon: "lock", open: () => openMenu(at, "vis"), remove: () => preview.setExtras(key, { vis: "public", visTo: [] }) }
      : { key: "v", title: "Custom", sub: extras.visTo.length ? extras.visTo.length + " selected" : "Pick who", kind: "custom", lead: "", icon: "affected", open: () => openMenu(at, "visPick"), remove: () => preview.setExtras(key, { vis: "public", visTo: [] }) });
    return out;
  })();
  const fileChips: Chip[] = myFiles.map((f) => ({ key: f.id, title: f.name, sub: "Attached", kind: "file", lead: (f.name.split(".").pop() || "file").slice(0, 4).toUpperCase(), img: f.img ? f.url : undefined, open: () => openMenu(stage === "start" ? "add" : "card", "file"), remove: () => removeFile(f.id) }));

  const menuFor = (at: NonNullable<Menu>["at"]) =>menu && menu.at === at ? (
    <RaiseMenu at={at === "card" ? "card" : at === "add" ? "under" : "bar"} view={menu.view} onView={(v) => setMenu({ at, view: v })} onClose={() => setMenu(null)}
      extras={extras} onExtras={(x) => preview.setExtras(key, x)} affected={affected} onAffected={setAffected}
      files={myFiles} onAddFiles={addFiles} onRemoveFile={removeFile} people={seed.people} depts={seed.depts} me={who.name} />
  ) : null;

  // The conversation without the first message - that is the idea, shown in the Idea view.
  const lastAi = [...turns].reverse().find((t) => t.role === "assistant")?.id ?? null;
  // The AI's read under the latest reply: the five dials now, and which of them the answer before it moved.
  const dials = dialsOf(parts);
  const advice = adviceOf(overall, threshold, team || "your team");
  const readAt = (upto: number) => dialsOf(scoreDraft({ turns: turns.slice(0, upto), affected, attachments: myFiles.length }, local ?? benchCtx).parts);
  const msgs: ChatMsg[] = turns.flatMap((t, i): ChatMsg[] => {
    if (i === firstIdx) return [];
    if (t.role === "user") { const u = splitUpdate(t.text); return [{ id: t.id, role: "user", text: u.said, note: u.updated ? "Idea changes shared with NextUp" : null }]; }
    const isLast = t.id === lastAi && !sending;
    const prev = turns[i - 1];
    const sgKey = draft ? draft.id + ":" + t.id : t.id;
    const resolved = preview.suggested[sgKey];
    const gained = isLast && live?.delta ? Object.entries(live.delta).some(([k, v]) => k !== "overall" && v > 0) : false;
    const offer = !published && isLast && gained && prev?.role === "user" && i - 1 !== firstIdx;
    const before = splitIdea(edit ? edit.text : firstText).context;
    const after = (before ? before + "\n" : "") + splitUpdate(prev?.text ?? "").said.replace(/\s+$/, "");
    const first = i === firstIdx + 1;
    return [{
      id: t.id, role: "ai", text: stripTags(t.text),
      // The numbers stay in the analysis: the chat shows the five dials as bars and words.
      note: first ? "Title and problem added" : null,
      read: isLast ? { dials, advice, first, up: first || i < 2 ? [] : dialsUp(readAt(i - 1), readAt(i + 1)) } : undefined,
      quick: isLast && !published ? { publish: allAnswered || scriptDone, review: true } : undefined,
      suggest: resolved || offer ? {
        key: sgKey, before, after, state: resolved ?? "open",
        onYes: (txt) => { if (draft) { preview.edit(draft.id, { orig: edit?.orig ?? firstText, text: splitIdea(edit ? edit.text : firstText).description + "\n\n" + txt }); preview.resolve(sgKey, "yes"); } },
        onNo: () => preview.resolve(sgKey, "no"),
      } : undefined,
    }];
  });
  if (sending) {
    if (turns.length) { const u = splitUpdate(sending.text); msgs.push({ id: "sending", role: "user", text: u.said, note: u.updated ? "Idea changes shared with NextUp" : null }); }
    if (sending.reply) msgs.push({ id: "reply", role: "ai", text: stripTags(sending.reply) });
  }
  if (published) msgs.push({ id: "published", role: "ai", text: "Published. It’s on " + lead + "’s desk now — you’ll see their reply in Overview.",
    link: draft?.caseId ? { label: "Open the case", href: href("/cases/" + draft.caseId) } : undefined });
  // "Ask this now" on the rail: the coach asks that step straight away, and the rail shows it as the one
  // being asked, until the answer is sent.
  const asking = !sending && !published && ask ? gaps.find((g) => g.ask === ask) ?? null : null;
  if (asking) msgs.push({ id: "ask:" + asking.id, role: "ai", text: (asking.status === "unknown" ? "Back to " : "Let’s jump to ") + asking.label.toLowerCase() + ". " + asking.ask });
  const railGaps: Gap[] = asking ? gaps.map((g) => ({ ...g, status: g.id === asking.id ? "active" : g.status === "active" ? "open" : g.status })) : gaps;

  const card: DraftCard | null = stage === "chat" && draft ? {
    title: draft.title || idea.title, published, canPublish: turns.length > 0 && !busy && !sending,
    pubHint: published ? "On " + lead + "’s desk · follow it in Overview" : "Goes to your team lead, " + lead,
    onPublish: () => void askReceiver(), working: pubStep && !Array.isArray(pubStep) ? pubStep : null, onRename: (title) => void studio.save({ title }),
    hasIdea: firstIdx >= 0, ideaOn: shownView === "idea", ideaEdited: !!edit, onIdea: () => { setMenu(null); go(shownView === "idea" ? "chat" : "idea"); },
    aiOn: shownView === "analysis", analysed: turns.length > 0, onAI: () => go(shownView === "analysis" ? "chat" : "analysis"),
    acts: chips, files: fileChips,
    saveLabel: published ? "Published " + clockLabel(draft.updatedAt) : draft.updatedAt ? "Saved " + clockLabel(draft.updatedAt) : "Save as draft", saved: !!draft.updatedAt,
    onSave: () => { void studio.save({}).then((ok) => showToast(ok ? "Draft saved. You find it under Ideas." : "Could not save the draft.")); },
    discardLabel: published ? "Remove from list" : "Discard draft",
    onDiscard: () => { void studio.discard().then(() => { reset(); setStage("start"); setOpenId(null); }); showToast(published ? "Removed from the list." : "Draft discarded."); },
    menu: menuFor("card"),
  } : null;

  const needle = query.trim().toLowerCase();
  const rows: IdeaRow[] = studio.drafts
    .filter((d) => !needle || (d.title || "Untitled idea").toLowerCase().includes(needle))
    .map((d) => {
      const current = stage === "chat" && d.id === draft?.id;
      const last = current ? turns[turns.length - 1] : undefined;
      return {
        id: d.id, title: d.title, when: whenLabel(d.updatedAt, now), current, pinned: preview.pinned.includes(d.id), published: d.status === "published",
        preview: last ? stripTags(last.text) : d.status === "published" ? "Follow it in Overview" : "Continue the conversation",
      };
    });

  const words = (startText.trim().match(/\S+/g) || []).length;
  // The script's next text, one click away in an empty composer.
  const next = (at: number) => (at >= 0 && at < DEMO_SCRIPT.length ? { label: DEMO_SCRIPT[at].label, text: DEMO_SCRIPT[at].say } : null);
  const chatFill = draft && !published && !sending && !text.trim() ? next(scriptAt) : null;
  const startFill = story && !startText.trim() && evalStep === null ? next(0) : null;
  const composerChat = (
    <div className={s.dock}>
      <div className={s.editedWrap}>
        {edit && (
          <div className={s.edited}>
            <div className={s.editedRow}>
              <Icon name="pencil" size={10.5} stroke="#1a5fd0" width={2} />
              <span className={s.editedText}><b>Idea edited</b> · NextUp will see the changes with your next message</span>
              <button type="button" className={s.undo} onClick={() => draft && preview.edit(draft.id, null)}>Undo</button>
            </div>
          </div>
        )}
      </div>
      <div className={s.dockBar}>
        <RaiseComposer value={text} onChange={setText} onSubmit={send} fieldRef={chatField} sendLabel="Send"
          placeholder={ask ?? (published ? "Add a follow-up — it goes to Overview" : turns.length ? "Answer, or add more detail…" : "Describe the problem or idea…")}
          canSend={!!text.trim() && !sending} chips={[]} strip={false} fill={chatFill}
          menuOpen={menu?.at === "chat"} onMenu={() => toggleMenu("chat")} menu={menuFor("chat")} onUnsupported={() => showToast("Dictation isn’t supported in this browser.")} />
      </div>
    </div>
  );

  // ── Analysis ────────────────────────────────────────────────────────────────────────────────
  const reviewers: Reviewer[] = ev ? [
    { initials: initials(ev.lead), name: ev.lead, role: "Receives it", why: "Your team lead — the first desk for anything you raise" + (team ? ", and close to " + team + "." : ".") },
    ...(ev.passesTo && ev.passesTo !== ev.lead ? [{ initials: initials(ev.passesTo), name: ev.passesTo, role: "Informed", why: "Owns “" + (ev.route?.type ?? "this area") + "” — where your lead passes it if it is not theirs." }] : []),
  ] : [];
  const openCases = S.cases.filter((c) => c.open).length;
  const sources: Source[] = [
    { name: "Company goals", where: GOALS.length + " goals checked", ext: "DOC" },
    { name: "Routing map", where: seed.routes.length + " routes", ext: "DOC" },
    { name: "Open cases", where: openCases + " searched", ext: "IDEA" },
    ...(myFiles.length ? [{ name: "Your evidence", where: myFiles.length + (myFiles.length === 1 ? " file" : " files"), ext: "DATA" as const }] : []),
  ];
  const sims: Similar[] = similar
    ? [{ title: similar.title, status: "Open", where: "Raised by", by: similar.from, href: href("/cases/" + similar.id) }]
    : [{ title: "No close matches", status: "–", where: "Searched " + openCases + " open cases", href: null }];
  const cats = [...new Set([ev?.route?.type, affected[0] ?? "General", "Idea"].filter((x): x is string => !!x))];

  const main = stage === "start" ? (
    <RaiseStart name={greetName(who.name)} typed={!!startText.trim() || chips.length + fileChips.length > 0} evalStep={evalStep}
      evalSub={(words || 1) + " words from " + (who.handle ?? who.name) + " · " + who.line}
      actions={
        <RaiseActions rows={actionsOf(extras, myFiles.length, affected.length)} open={menu?.at === "add" ? menu.view : null}
          onOpen={(v) => openMenu("add", v)} menu={menuFor("add")} onAddFiles={addFiles} />
      }
      composer={
        <RaiseComposer value={startText} onChange={setStartText} onSubmit={startRaise} fieldRef={startField} sendLabel="Ask NextUp"
          placeholder="Share an idea that would make work better…" canSend={startText.trim().length >= 3 && evalStep === null}
          chips={[...chips, ...fileChips]} strip fill={startFill}
          onUnsupported={() => showToast("Dictation isn’t supported in this browser.")} />
      } />
  ) : shownView === "idea" ? (
    <IdeaSheet description={shown.description} context={shown.context} locked={published} onChange={editIdea} onClose={() => go("chat")} />
  ) : shownView === "analysis" ? (
    <AnalysisSheet ready={turns.length > 0} onClose={() => go("chat")} dials={dialsOf(parts)}
      summary={((x) => (x.length > 320 ? x.slice(0, 320).replace(/\s+\S*$/, "") + "…" : x))((idea.text || "").replace(/\s+/g, " ").trim()) || "Nothing to summarise yet."}
      advice={advice}
      pattern={affected.length > 1 ? "The problem is felt beyond one team: " + affected.join(", ") + "." : "It stands on its own."}
      cats={cats} similar={sims} reviewers={reviewers} sources={sources} />
  ) : (
    <RaiseChat msgs={msgs} typing={!!sending && !sending.reply} typingLabel={turns.length ? "" : "Researching business context…"} error={studio.error}
      gaps={railGaps} onAsk={(g) => { setAsk(g.ask); setTimeout(() => chatField.current?.focus(), 0); }}
      onQuick={(w) => (w === "publish" ? void askReceiver() : go("analysis"))}
      dock={composerChat} followKey={turns.length + ":" + (sending ? sending.reply.length : -1) + ":" + (draft?.id ?? "") + ":" + (asking?.id ?? "")} />
  );

  return (
    <RaisePeople.Provider value={{ people: seed.people, depts: seed.depts }}>
    <div className={s.root} data-sb={sb} data-raise-root="">
      <div className={s.sbShell}>
        <RaiseSidebar query={query} onQuery={setQuery} onHide={() => { setSb("hidden"); setMenu(null); }} card={card} rows={rows} loaded={studio.loaded}
          onPick={openDraft} onPin={preview.togglePin} onNew={newIdea} />
      </div>
      <button type="button" className={s.scrim} onClick={() => setSb("hidden")} aria-label="Close the sidebar" />
      {Array.isArray(pubStep) && (
        <ReceiverDialog options={pubStep} people={seed.people} depts={seed.depts} me={who.name} work={pubWork}
          score={(name) => receiverFor(name, rcvInput ?? receiverInput(idea.text, ev?.lead ?? "Triage desk", null))}
          onCancel={() => setPubStep(null)} onConfirm={(to) => void publish(to)} />
      )}
      <div className={s.main}>
        <div className={s.showSb}><button type="button" className={s.iconBtn} onClick={() => setSb("open")} title="Show sidebar" aria-label="Show sidebar"><Icon name="sidebar" size={12} /></button></div>
        {main}
      </div>
    </div>
    </RaisePeople.Provider>
  );
}

