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
// `script`: the static demo (app/demo, no company behind it) - the demo controls fill the demo script's
// idea and answers (features/ideas/demo-script.ts, lib/demo-controls.ts), the coach answers each with its
// prepared reply, the rail shows the script's eight topics, and nothing leaves the browser. The company's
// /raise never sets it.
import { Suspense, useCallback, useEffect, useMemo, useRef, useState } from "react";
import { usePathname, useSearchParams } from "next/navigation";
import { useDemo } from "@/components/dashboard/DemoProvider";
import { PageSkeleton } from "@/components/dashboard/shared/PageSkeleton";
import { stripTags } from "@/features/assist/check";
import { newId } from "@/features/cases/events";
import { closest, evaluate, GOALS } from "@/features/evaluate";
import { benchmark } from "@/features/ideas/benchmarks";
import { finishTitle, ideaFromTurns } from "@/features/ideas/coach";
import { ideaDoc } from "@/features/ideas/finalize";
import { companyRead } from "@/features/ideas/company-read";
import { splitBody } from "@/features/ideas/brief";
import { ideaContext, scoreDraft } from "@/features/ideas/drafts";
import { DEMO_CASE, DEMO_SCRIPT, FILLED_ANSWERS, scriptRail, scriptStep } from "@/features/ideas/demo-script";
import { adviceOf, clockLabel, dialsMoved, dialsOf, greetName, IDEA_UPDATE, ideaNow, initials, isUnsure, gapsOf, splitIdea, splitUpdate, topicsOf, whenLabel, type Topic } from "@/features/ideas/raise";
import { registerRaiseHooks } from "@/lib/demo-controls";
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
import { PromptBody, PromptTray, type BodyFocus } from "./RaisePrompts";
import { EMPTY_BODY, insertBlock, segsContext, splitSegs, type Caret, type Seg } from "@/features/ideas/prompts";
import { ReceiverDialog, type Work } from "./RaisePublish";
import { PreviewLoading, PublishPreview, type Look } from "./PublishPreview";
import { RaiseChat, type ChatMsg, type Read } from "./RaiseChat";
import { DocLoading, RaiseFinal } from "./RaiseFinal";
import { AnalysisSheet, IdeaSheet, type AnalysisData, type Reviewer, type Similar, type Source } from "./RaiseSheets";
import { RaiseSidebar, type DraftCard, type IdeaRow } from "./RaiseSidebar";
import { EVAL_STEPS, RaiseStart } from "./RaiseStart";
import { useRaisePreview, type FileItem } from "./raisePreview";
import { Icon } from "./raiseIcons";
import { RaisePeople } from "./RaisePerson";
import s from "./Raise.module.css";

// Runs `run` after every render: how handlers made after the page's early return reach a ref.
function Sync({ run }: { run: () => void }) { useEffect(run); return null; }

const MIN_EXCHANGES = FILLED_ANSWERS + 1; // the author's messages (the idea, then answers) before it can be published
const MAX_SHOTS = 4; // screenshots kept with the case in this browser (lib/shots.ts)
type Menu = { at: "start" | "chat" | "card" | "add"; view: MenuView } | null;

// The screens of an open idea, as the URL names them (`?idea=<draft id>&view=…`, no view = the chat). The URL
// is the source of truth for which idea and which screen are open, so the browser's back and forward walk
// the screens and a reload or a shared link opens the same place. Which screens an idea may show comes from
// its own state (messages, finalized, published), never from the URL: a screen it is past or not yet at
// falls back to the chat, and a published idea stays read-only - going back never undoes anything.
type View = "chat" | "idea" | "analysis" | "preview" | "final";
const VIEWS: readonly string[] = ["idea", "analysis", "preview", "final"];

// useSearchParams needs a Suspense boundary above it; the skeleton is what shows until the URL is read.
export function Raise(p: { script?: boolean }) {
  return <Suspense fallback={<PageSkeleton kind="raise" delay />}><RaisePage {...p} /></Suspense>;
}

function RaisePage({ script = false }: { script?: boolean }) {
  const { seed, S, persona, role, act, ready, href, tenant, showToast, serverMode } = useDemo();
  const story = script && role === "member"; // the demo script is the employee's story; others raise their own
  // The static demo scores and answers in this browser, against the seed it shows.
  const local = useMemo(() => (script ? ideaContext(seed.routes, GOALS, S.cases) : null), [script, seed.routes, S.cases]);
  const studio = useIdeaStudio(tenant.slug, serverMode, persona.who.name, local);
  const scope = tenant.slug + "/" + persona.who.name; // whose page this is: what is kept across visits, per person
  const preview = useRaisePreview(scope);
  const { draft, live, threshold, sending } = studio;
  const who = persona.who;

  const [keptStage, setStage] = useKept<"start" | "chat">(scope, "stage", "start");
  const [openId, setOpenId] = useKept<string | null>(scope, "open", null); // the draft open in the chat, reopened on the next visit
  const pathname = usePathname(), params = useSearchParams();
  const urlIdea = params.get("idea");
  const urlView = params.get("view") ?? "";
  // An idea in the URL that this person cannot open (wiped by the demo's fresh start, or someone else's when the
  // back button replays a page as another person): the start page shows, and the URL is left as the history has it.
  const [missing, setMissing] = useState<string | null>(null);
  const shownIdea = urlIdea && urlIdea !== missing ? urlIdea : null;
  const stage = shownIdea ? "chat" : keptStage; // an idea in the URL is always the chat; without one, the start page or a first message on its way
  const view: View = VIEWS.includes(urlView) ? (urlView as View) : "chat";
  const looking = view === "preview"; // the last look is a window over the chat
  // Go to an idea and a screen: `idea` undefined keeps the open one, null is the start page; another idea opens at its chat.
  const nav = useCallback((next: { idea?: string | null; view?: View }, how: "push" | "replace" = "push") => {
    const q = new URLSearchParams(params.toString());
    const id = next.idea === undefined ? urlIdea : next.idea;
    const v = next.view ?? (next.idea !== undefined && next.idea !== urlIdea ? "chat" : view);
    if (id) q.set("idea", id); else q.delete("idea");
    if (id && v !== "chat") q.set("view", v); else q.delete("view");
    const qs = q.toString();
    // The browser's own history, which Next keeps in step with usePathname/useSearchParams: the view switches
    // at once, where router.push waits for a server round trip first.
    const url = pathname + (qs ? "?" + qs : "");
    if (how === "push") window.history.pushState(null, "", url); else window.history.replaceState(null, "", url);
  }, [params, urlIdea, view, pathname]);
  const [finals, setFinals] = useKept<Record<string, number>>(scope, "finals", {}); // draft id -> how many turns it had when it was finalized
  const [sb, setSb] = useKept<"auto" | "open" | "hidden">(scope, "sb", "auto"); // auto: open on screens, closed on phones (CSS)
  const [query, setQuery] = useState("");
  const [startText, setStartText] = useKept(scope, "startText", "");
  const [segs, setSegs] = useKept<Seg[]>(scope, "segs", EMPTY_BODY); // the start composer's text and blocks under the headline
  const [bodyFocus, setBodyFocus] = useState<BodyFocus | null>(null);
  const [startAff, setStartAff] = useKept<string[]>(scope, "startAff", []);
  const [files, setFiles] = useKept<Record<string, FileItem[]>>(scope, "files", {});
  const [slot, setSlot] = useKept(scope, "slot", "n0"); // where the choices of the open idea live: the start form's key, or a draft id
  const [aliases, setAliases] = useKept<Record<string, string>>(scope, "aliases", {}); // draft id -> the start slot that made it
  const [topics, setTopics] = useKept<Record<string, string[]>>(scope, "topics", {}); // slot -> the unclear topics prepared when it was raised
  const [text, setText] = useKept(scope, "text", "");
  const [ask, setAsk] = useState<string | null>(null); // a rail question the author chose to answer now
  const [menu, setMenu] = useState<Menu>(null);
  const [evalStep, setEvalStep] = useState<number | null>(null); // the evaluation's step while the first reply is on its way
  const evalTimer = useRef<ReturnType<typeof setInterval> | undefined>(undefined);
  const [busy, setBusy] = useState(false);
  // Publishing: the step NextUp is on while it finds who should receive it, then the suggestions to
  // choose from; `pubWork` is the step while the chosen one is published.
  const [pubStep, setPubStep] = useState<null | Work | Receiver[]>(null);
  const [pubWork, setPubWork] = useState<Work | null>(null);
  const [rcvInput, setRcvInput] = useState<ReceiverInput | null>(null); // what the suggestions were scored on, for someone picked by hand
  // The last look before publishing: per draft, the author's words as the case will carry them; open or not.
  const [looks, setLooks] = useKept<Record<string, Look>>(scope, "looks", {});
  // Per reply of NextUp's: the topics it left unclear, as they stood when the author answered it - they stay under it.
  const [asked, setAsked] = useKept<Record<string, string[]>>(scope, "asked", {});
  const [prepping, setPrepping] = useState(false); // the second between "Publish" and the last look (PreviewLoading)
  const [drafting, setDrafting] = useState(false); // the moment between "Looks good · finalize" and the document (DocLoading)
  const [now, setNow] = useState(() => new Date());
  const startField = useRef<HTMLTextAreaElement>(null);
  const caretRef = useRef<Caret | null>(null); // where a block from the mini bar lands
  const fillRef = useRef<(fixed?: boolean) => void>(() => {});
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
  const current = useMemo(() => ideaNow(turns), [turns]); // the first message with every answer since in its context
  const edit = draft ? preview.edits[draft.id] ?? null : null;
  const shown = splitIdea(edit ? edit.text : current);
  // The demo script: where this conversation stands in it (-1 once the author wrote their own words).
  const scriptAt = story ? scriptStep(turns) : -1;
  // Publishing waits for a real conversation: at least MIN_EXCHANGES messages from the author, each answered.
  // In the demo that is the idea and the two answers the controls fill (FILLED_ANSWERS).
  const said = turns.filter((t) => t.role === "user").length;
  const scripted = story && scriptAt >= MIN_EXCHANGES;
  const canFinalize = turns.length > 0 && !busy && !sending && (said >= MIN_EXCHANGES || published);
  const finalized = published || (!!draft && finals[draft.id] === turns.length); // sent from the final document; a new message undoes it

  useEffect(() => { const t = setInterval(() => setNow(new Date()), 60_000); return () => clearInterval(t); }, []);

  // The start page, empty: a new idea, or where the browser's back led from an open one.
  const toStart = useCallback(() => {
    studio.startNew(); setText(""); setAsk(null); setMenu(null); setOpenId(null); clearInterval(evalTimer.current);
    setStage("start"); setStartText(""); setSegs(EMPTY_BODY); caretRef.current = null; setStartAff([]); setEvalStep(null); setSlot(newId("n"));
  }, [studio.startNew, setText, setOpenId, setStage, setStartText, setSegs, setStartAff, setSlot]); // eslint-disable-line react-hooks/exhaustive-deps -- studio.startNew is stable

  // The URL changed (a link, the back button, a reload): open the idea it names, or go to the start page.
  // Arriving with no idea in the URL, the conversation open on the last visit is put back in it. Only once
  // the person is known (`ready`), so nobody else's draft is opened on the way.
  const seenIdea = useRef<string | null | undefined>(undefined); // the URL's idea last handled; undefined before the first
  useEffect(() => {
    if (!ready) return;
    const before = seenIdea.current;
    if (before === urlIdea) return;
    seenIdea.current = urlIdea;
    if (urlIdea) {
      if (studio.draft?.id === urlIdea) return;
      void studio.open(urlIdea).then((d) => {
        if (!d) { studio.setError(""); toStart(); setMissing(urlIdea); return; } // not this person's, or gone: never rewrite the history
        setText(""); setAsk(null); setMenu(null); setEvalStep(null);
        setStage("chat"); setOpenId(urlIdea); setSlot(aliases[urlIdea] ?? urlIdea);
      });
    } else if (before === undefined) {
      if (openId && stage === "chat") nav({ idea: openId }, "replace");
    } else toStart();
  }, [ready, urlIdea]); // eslint-disable-line react-hooks/exhaustive-deps -- on a change of the URL's idea only

  // A new idea got its id (NextUp's first reply): the URL names it from now on, without a new history entry.
  // The reply can come while the evaluation still plays on the start page, so it waits for the chat too.
  const seenDraft = useRef<string | null>(null);
  useEffect(() => {
    const id = draft?.id ?? null;
    if (!id || stage !== "chat" || id === seenDraft.current) return;
    seenDraft.current = id;
    setOpenId(id);
    if (!shownIdea) { seenIdea.current = id; nav({ idea: id }, "replace"); }
  }, [draft?.id, stage]); // eslint-disable-line react-hooks/exhaustive-deps -- on a new draft in the chat only

  // The first reply is ready, or failed: the orb under the first message goes.
  const replied = !!draft?.turns.some((t) => t.role === "assistant") || !!sending?.reply || !!studio.error;
  const evaluating = evalStep !== null && !replied;
  useEffect(() => { if (replied) clearInterval(evalTimer.current); }, [replied]);

  // A screen the idea cannot show (the last look of a published idea, the document before three messages):
  // the chat instead. Checked once the idea in the URL is the one loaded, and not while it is being worked on.
  useEffect(() => {
    if (!draft || draft.id !== urlIdea || sending || busy || pubStep || view === "chat") return;
    const ok = view === "preview" ? !published && said >= MIN_EXCHANGES : view === "final" ? published || said >= MIN_EXCHANGES : true;
    if (!ok) nav({ view: "chat" }, "replace");
  }, [draft, urlIdea, sending, busy, pubStep, view, published, said, nav]);

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
  // `fixed`: the demo controls' fill - the same colleague and meeting every time, where the dev panel's varies them.
  useEffect(() => {
    fillRef.current = (fixed = false) => {
      const x = DEV_SAMPLES[fixed ? 0 : Math.floor(Math.random() * DEV_SAMPLES.length)];
      // People from this company's own seed: the samples' names only where they exist (the static demo renames them).
      const known = (n: string) => seed.people.some((p) => p.name === n);
      const lead = seed.people.find((p) => p.name === who.name)?.reportsTo ?? ev?.lead;
      const coll = seed.people.filter((p) => p.name !== who.name && p.name !== lead).map((p) => p.name);
      setStartText(x.text); setSegs(splitSegs(x.ctx)); caretRef.current = null; setStartAff(x.aff.filter((a) => !/^[A-Z]\. /.test(a) || known(a))); setMenu(null);
      setFiles((f) => ({ ...f, [slot]: x.files.map((name) => ({ id: newId("f"), name, url: "", img: false, file: new File([], name) })) }));
      const mate = coll.findIndex((n) => seed.people.find((p) => p.name === n)?.reportsTo === lead); // the demo's: a teammate
      const pick = fixed ? Math.max(0, mate) : Math.floor(Math.random() * coll.length);
      preview.setExtras(slot, { recv: lead ? [lead] : [], coll: coll.length ? [coll[pick]] : [], meet: fixed || Math.random() > 0.5 ? { dur: "15 min", when: "this week" } : null, vis: "public", visTo: [] });
    };
  });

  // The demo controls (lib/demo-controls.ts): the click the script needs next, made from the controls -
  // fill, Ask NextUp, each answer filled and sent, the last look, Finalize, Send. The handlers are this render's (see below).
  const scriptRef = useRef({ send: () => {}, preview: () => {}, finalize: () => {}, sendFinal: () => {} });
  const autoPick = useRef(false); // sent from the controls: the receiver NextUp ranks first gets it, no dialog to answer
  const publishRef = useRef<(to: Receiver) => Promise<void>>(async () => {});
  const idle = ready && !sending && !published && !pubStep && !busy;
  const canIdea = story && idle && stage === "start" && !evaluating;
  const canSend = story && idle && !evaluating && (stage === "start" ? (startText.trim() || segsContext(segs).trim()).length >= 3 : !!draft && view === "chat" && text.trim().length >= 3);
  const answer = story && scriptAt >= 1 && scriptAt <= FILLED_ANSWERS ? DEMO_SCRIPT[scriptAt].say : null; // the script's next answer
  const canAnswer = story && idle && stage === "chat" && view === "chat" && !!draft && !!answer && text.trim() !== answer;
  const canPreview = story && idle && stage === "chat" && !!draft && canFinalize && !looking && !prepping && view !== "final";
  const canConfirm = story && idle && looking && !drafting && !!draft;
  const canSendFinal = story && idle && stage === "chat" && !!draft && view === "final" && !looking && canFinalize;
  useEffect(() => (canIdea || canSend || canAnswer || canPreview || canConfirm || canSendFinal ? registerRaiseHooks({
    at: scriptAt,
    fillIdea: canIdea ? () => fillRef.current(true) : null,
    fillAnswer: canAnswer && answer ? () => { setText(answer); setTimeout(() => chatField.current?.focus(), 0); } : null,
    send: canSend ? () => scriptRef.current.send() : null,
    preview: canPreview ? () => scriptRef.current.preview() : null,
    finalize: canConfirm ? () => scriptRef.current.finalize() : null,
    sendFinal: canSendFinal ? () => scriptRef.current.sendFinal() : null,
  }) : undefined), [canIdea, canSend, canAnswer, answer, canPreview, canConfirm, canSendFinal, scriptAt, setText]);
  // Sent from the controls: once the suggestions are in, the first one receives it after a moment to read it.
  useEffect(() => {
    if (!autoPick.current || !Array.isArray(pubStep) || !pubStep.length) return;
    autoPick.current = false;
    const to = pubStep[0], t = setTimeout(() => void publishRef.current(to), 1200);
    return () => clearTimeout(t);
  }, [pubStep]);

  if (!ready) return <PageSkeleton kind="raise" delay />;

  // The chat shows NextUp's reply with its short read; the full analysis opens only when asked for.
  const shownView = view === "preview" ? "chat" : view; // the last look opens over the chat
  // The rail: the topics prepared when the idea was raised - for a draft from an earlier visit, worked out
  // again from its first message.
  const benchCtx = ideaContext(seed.routes, GOALS, S.cases);
  const myTopics = topics[slot] ?? (firstIdx >= 0 ? topicsOf(benchmark({ text: turns[firstIdx].text, affected: [], attachments: 0 }, benchCtx).parts) : []);
  // The demo script has its own eight topics, cleared one per answer, as long as the conversation follows it.
  const gaps: Topic[] = !draft || !turns.length ? [] : scriptAt >= 1 ? scriptRail(scriptAt) : gapsOf(myTopics, parts, preview.unknown[draft.id] ?? []);
  // Under the latest reply: the one point still unclear - the one being asked, else the next still open.
  const lastAi = [...turns].reverse().find((t) => t.role === "assistant")?.id ?? null;
  const unclear = [...gaps.filter((g) => g.status === "active"), ...gaps.filter((g) => g.status === "open" || g.status === "unknown")].slice(0, 1);

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
  const toggleMenu = (at: "start" | "chat") => setMenu((m) => (m ? null : { at, view: "main" }));

  // A screen of the open idea: a new entry in the browser's history, so back returns to the one before.
  const go = (v: View) => nav({ view: v });
  // Leaving a draft the start form made: remember which slot holds its choices, for when it is reopened.
  const leave = () => { if (draft && slot !== draft.id) setAliases((a) => ({ ...a, [draft.id]: slot })); setSb((x) => (x === "open" ? "auto" : x)); };
  const newIdea = () => {
    leave(); toStart();
    if (urlIdea) nav({ idea: null });
    setTimeout(() => startField.current?.focus(), 60);
  };
  // Another idea: the URL names it, and the URL's effect above opens it.
  const openDraft = (id: string) => { leave(); nav({ idea: id, view: "chat" }); };

  // Send from the start page: the line, the context and the chosen extras go as the first message. The chat
  // opens at once with it on top; the evaluation plays under it, with the orb, until the coach has answered.
  const startRaise = () => {
    const main = startText.trim(), ctx = segsContext(segs);
    if (main.length < 3 || evaluating) return;
    const extra = [
      extras.recv.length ? "Suggested receiver: " + extras.recv.join(", ") : "",
      extras.coll.length ? "Colleagues who know this: " + extras.coll.join(", ") : "",
      extras.meet ? "I’d like a " + extras.meet.dur + " meeting " + extras.meet.when + "." : "",
    ].filter(Boolean).join("\n");
    const message = main + (ctx ? "\n\n" + ctx : "") + (extra ? "\n\n" + extra : "");
    // Every idea, the demo script's too, lands in the chat: NextUp's reply, its short read and what is still unclear.
    setMenu(null); setEvalStep(0);
    setTopics((x) => ({ ...x, [slot]: topicsOf(benchmark({ text: message, affected: startAff, attachments: myFiles.length }, benchCtx).parts) }));
    void studio.send(message, { affected: startAff, attachments: myFiles.length });
    setStage("chat"); setStartText(""); setSegs(EMPTY_BODY); caretRef.current = null;
    let step = 0;
    clearInterval(evalTimer.current);
    evalTimer.current = setInterval(() => {
      step += 1;
      if (step < EVAL_STEPS.length) setEvalStep(step); else clearInterval(evalTimer.current); // the last step holds until the reply
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

  // What the case will say: the demo script's main points, or the idea as the conversation has it - its
  // first paragraph the description, "*Label* text" lines the details, the rest context (without the
  // start page's receiver, colleague and meeting lines: those are chips of their own).
  const outgoing = scripted ? DEMO_CASE : { body: idea.body, upside: ev?.payload.upside ?? "" };
  const mine = draft ? looks[draft.id] ?? null : null;
  const bodyOf = (l: Look) => [l.description.trim(), l.context.trim(),
    l.prompts.filter((x) => x.label.trim() && x.text.trim()).map((x) => "*" + x.label.trim() + "* " + x.text.trim()).join("\n")].filter(Boolean).join("\n\n");
  const setLook = (l: Look) => { if (draft) setLooks((x) => ({ ...x, [draft.id]: l })); };

  // "Publish": first the last look (PublishPreview.tsx) - the idea as the receiver's inbox shows it, the
  // author's part editable - and from there NextUp finds who should receive it. The look is kept per
  // draft, so closing and reopening it loses nothing.
  // The last look as NextUp first lays it out: the description is the author's own first line (the
  // script's case has its own); what they wrote under it is the context.
  const lookOf = (): Look => {
    const parts = splitBody(outgoing.body);
    const description = scripted ? parts.description : (idea.text.split(/\n\s*\n/)[0] ?? "").trim();
    const rest = scripted ? parts.context ?? "" : [parts.description, parts.context].filter(Boolean).join("\n\n");
    const context = rest.split("\n").filter((l) => !/^(Suggested receiver|Colleagues who know|I’d like a)/.test(l.trim())).join("\n").trim();
    return { title: finishTitle(draft?.title || idea.title), description, context, prompts: parts.facts };
  };
  // Opened by a link or the back button there is no kept look yet: the first layout shows until it is edited.
  const shownLook = mine ?? (looking && draft ? lookOf() : null);
  const openLook = () => {
    if (!draft || busy || published || pubStep || prepping) return;
    setMenu(null);
    if (!mine) setLook(lookOf());
    setSb((x) => (x === "open" ? "auto" : x)); // on a phone the drawer closes, so the window is what shows
    // A second of placeholder first, while NextUp lays it out; then the last look, with Finalize.
    setPrepping(true);
    setTimeout(() => { setPrepping(false); nav({ view: "preview" }); }, 1000);
  };

  // "Publish idea": the button says what NextUp does - reads the idea, asks the router, checks the org
  // chart, ranks who fits - then the author picks who receives it (RaisePublish.tsx).
  const askReceiver = async () => {
    if (!draft || busy || published || pubStep) return;
    setMenu(null);
    const text = await step(setPubStep, "Reading your idea…", "working", () => (mine ? mine.title + "\n\n" + bodyOf(mine) : idea.text), 450);
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
    // The author's last look wins: its title and body are what the receiver reads.
    const title = mine?.title.trim() || r.title;
    const e = evaluate({ kind: "idea", text: title, context: r.body, affected, attachments: myFiles.length, who }, { ...seed, cases: S.cases }, r.brain);
    // The demo script's case carries its main points instead of the raw conversation.
    const made = scripted ? DEMO_CASE : { body: r.body, upside: e.payload.upside };
    const body = mine ? bodyOf(mine) : made.body;
    await step(setPubWork, "Raising the case for " + to.name + "…", "composing", () => act.raise({ ...e.payload, title, body, upside: made.upside, assignee: to.name, routeId: to.routeId ?? e.payload.routeId }, caseId), 600);
    const images = myFiles.filter((f) => f.img).slice(0, MAX_SHOTS);
    if (images.length) {
      const kept = await step(setPubWork, "Saving the screenshots…", "working", async () => {
        const shots = await Promise.all(images.map((f) => shrinkImage(f.file).catch(() => null)));
        return saveShots(tenant.slug, caseId, shots.filter((x) => x !== null));
      }, 400);
      if (!kept) showToast("Published — the screenshots did not fit in this browser's storage.");
    }
    setBusy(false); setPubWork(null); setPubStep(null);
    go("chat"); // published from the document: back to the conversation, where the case is offered
    void studio.open(draft.id);
  };

  const send = () => {
    const t = text.trim();
    if (!t || sending) return;
    if (/^publish( now)?$/i.test(t)) { setText(""); openLook(); return; }
    if (/^review analysis$/i.test(t)) { setText(""); go("analysis"); return; }
    if (/^finali[sz]e( idea)?$/i.test(t)) { setText(""); if (canFinalize) go("final"); return; }
    if (published) { showToast("This idea is published — follow-ups go through Overview."); return; }
    if (t.length < 3) return;
    // "Not sure": the active topic becomes unknown, and the coach is told not to ask it again.
    const skip = draft ? [...(preview.unknown[draft.id] ?? [])] : [];
    const unsure = draft && isUnsure(t) ? (gaps.find((g) => g.ask === ask) ?? gaps.find((g) => g.status === "active")) : undefined;
    if (draft && unsure) { preview.markUnknown(draft.id, unsure.id); skip.push(unsure.id); }
    // Edits made in the Idea view travel with this message, so the coach and the score see them.
    const message = edit ? t + IDEA_UPDATE + edit.text : t;
    if (draft && edit) preview.edit(draft.id, null);
    if (lastAi && unclear.length) setAsked((a) => (a[lastAi] ? a : { ...a, [lastAi]: unclear.map((g) => g.id) }));
    void studio.send(message, { affected, attachments: myFiles.length, skip });
    setText(""); setAsk(null);
  };

  // The last look confirmed: the final document opens. Sent from the document: it is final, and NextUp finds who receives it.
  // The last look confirmed: the window closes, the document is laid out for a moment and a half, then it opens.
  const confirmLook = () => {
    if (drafting) return;
    if (!mine && shownLook) setLook(shownLook);
    setDrafting(true);
    setTimeout(() => { setDrafting(false); go("final"); }, 1500);
  };
  const sendFinal = () => { if (!draft) return; setFinals((f) => ({ ...f, [draft.id]: turns.length })); void askReceiver(); };
  // This render's handlers, for the demo controls (handed over after the render, see Sync).
  const syncScript = () => {
    scriptRef.current = {
      send: stage === "start" ? startRaise : send, preview: openLook, finalize: confirmLook,
      sendFinal: () => { autoPick.current = true; sendFinal(); },
    };
    publishRef.current = publish;
  };

  const editIdea = (description: string, context: string) => {
    if (!draft) return;
    preview.edit(draft.id, { orig: current, text: description + (context.trim() ? "\n\n" + context : "") });
  };

  // ── Derived for the views ───────────────────────────────────────────────────────────────────
  // Where it went: the published case's own assignee; before that, the team lead it would land with.
  const lead = (draft?.caseId ? S.cases.find((c) => c.id === draft.caseId)?.assignee : undefined) ?? ev?.lead ?? "your team lead";
  const team = affected[0] ?? who.line.split(",")[0];

  const chips: Chip[] = (() => {
    const at = stage === "start" ? "start" : "card";
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
  const fileChips: Chip[] = myFiles.map((f) => ({ key: f.id, title: f.name, sub: "Attached", kind: "file", lead: (f.name.split(".").pop() || "file").slice(0, 4).toUpperCase(), img: f.img ? f.url : undefined, open: () => openMenu(stage === "start" ? "start" : "card", "file"), remove: () => removeFile(f.id) }));

  const menuFor = (at: NonNullable<Menu>["at"]) => menu && menu.at === at ? (
    <RaiseMenu at={at === "card" ? "card" : "bar"} view={menu.view} onView={(v) => setMenu({ at, view: v })} onClose={() => setMenu(null)}
      extras={extras} onExtras={(x) => preview.setExtras(key, x)} affected={affected} onAffected={setAffected}
      files={myFiles} onAddFiles={addFiles} onRemoveFile={removeFile} people={seed.people} depts={seed.depts} me={who.name} />
  ) : null;

  // The conversation without the first message - that is the idea, shown in the Idea view.
  const advice = adviceOf(overall, threshold, team || "your team");
  // Under the latest reply: the five dials as bars and words (the numbers stay in the full analysis), and the
  // point still unclear. Under an earlier one: what it asked, ticked once that is clear.
  // What the latest answer moved: the conversation read up to it, against the one up to the answer before.
  const lastSaid = turns.map((t) => t.role).lastIndexOf("user");
  const readAt = (n: number) => dialsOf(scoreDraft({ turns: turns.slice(0, n), affected, attachments: myFiles.length }, benchCtx).parts);
  const moved = lastSaid > firstIdx ? dialsMoved(readAt(lastSaid), readAt(lastSaid + 1)) : {};
  const read: Read = { dials: dialsOf(parts), advice, moved, open: published ? [] : unclear };
  const msgs: ChatMsg[] = turns.flatMap((t, i): ChatMsg[] => {
    if (i === firstIdx) return [];
    if (t.role === "user") { const u = splitUpdate(t.text); return [{ id: t.id, role: "user", text: u.said, note: u.updated ? "Idea changes shared with NextUp" : null }]; }
    const isLast = t.id === lastAi && !sending;
    return [{
      id: t.id, role: "ai", text: stripTags(t.text),
      note: i === firstIdx + 1 ? "Title added" : null,
      read: t.id === lastAi ? read : undefined, // stays while the next reply is on its way, so the page does not jump
      asked: t.id === lastAi ? undefined : (asked[t.id] ?? []).flatMap((id) => gaps.filter((g) => g.id === id)),
      publish: isLast && !published && canFinalize,
    }];
  });
  if (sending) {
    if (turns.length) { const u = splitUpdate(sending.text); msgs.push({ id: "sending", role: "user", text: u.said, note: u.updated ? "Idea changes shared with NextUp" : null }); }
    if (sending.reply) msgs.push({ id: "reply", role: "ai", text: stripTags(sending.reply) });
  }
  // On top: the idea as it was asked - its title, what was written under it, and its details (the start
  // page's receiver, colleague and meeting lines, who it affects, the files).
  const firstText = firstIdx >= 0 ? turns[firstIdx].text : sending && !turns.length ? sending.text : null;
  if (firstText) {
    const { description, context } = splitIdea(stripTags(firstText));
    const details: { key: string; value: string }[] = affected.length ? [{ key: "Affected", value: affected.join(", ") }] : [];
    const body = context.split("\n").filter((line) => {
      const to = line.trim().match(/^(Suggested receiver|Colleagues who know this): (.+)$/), meet = line.trim().match(/^I’d like a (.+) meeting (.+)\.$/);
      if (to) details.push({ key: to[1] === "Suggested receiver" ? "Receiver" : "Colleagues", value: to[2] });
      if (meet) details.push({ key: "Meeting", value: meet[1] + " · " + meet[2] });
      return !to && !meet;
    }).join("\n").trim();
    myFiles.forEach((f) => details.push({ key: "File", value: f.name }));
    msgs.unshift({ id: "idea", role: "user", text: description, idea: { body, details } });
  }
  if (published) msgs.push({ id: "published", role: "ai", text: "Published. It’s on " + lead + "’s desk now — you’ll see their reply in Overview.",
    link: draft?.caseId ? { label: "Open the case", href: href("/cases/" + draft.caseId) } : undefined });
  // "Ask this now" on the rail: the coach asks that step straight away, and the rail shows it as the one
  // being asked, until the answer is sent.
  const asking = !sending && !published && ask ? gaps.find((g) => g.ask === ask) ?? null : null;
  if (asking) msgs.push({ id: "ask:" + asking.id, role: "ai", text: (asking.status === "unknown" ? "Back to " : "Let’s jump to ") + asking.label.toLowerCase() + ". " + asking.ask });
  const railGaps: Topic[] = asking ? gaps.map((g) => ({ ...g, status: g.id === asking.id ? "active" : g.status === "active" ? "open" : g.status })) : gaps;

  const card: DraftCard | null = stage === "chat" && draft ? {
    title: draft.title || idea.title, published, canPublish: canFinalize,
    pubHint: published ? "On " + lead + "’s desk · follow it in Overview" : "Goes to your team lead, " + lead,
    finalOn: shownView === "final", finalized, canFinalize, onFinal: () => { setMenu(null); go(shownView === "final" ? "chat" : "final"); },
    onPublish: openLook, working: pubStep && !Array.isArray(pubStep) ? pubStep : null, onRename: (title) => void studio.save({ title }),
    hasIdea: firstIdx >= 0, ideaOn: shownView === "idea", ideaEdited: !!edit, onIdea: () => { setMenu(null); go(shownView === "idea" ? "chat" : "idea"); },
    aiOn: shownView === "analysis", analysed: turns.length > 0, onAI: () => go(shownView === "analysis" ? "chat" : "analysis"),
    acts: chips, files: fileChips,
    saveLabel: published ? "Published " + clockLabel(draft.updatedAt) : draft.updatedAt ? "Saved " + clockLabel(draft.updatedAt) : "Save as draft", saved: !!draft.updatedAt,
    onSave: () => { void studio.save({}).then((ok) => showToast(ok ? "Draft saved. You find it under Ideas." : "Could not save the draft.")); },
    discardLabel: published ? "Remove from list" : "Discard draft",
    onDiscard: () => { void studio.discard().then(() => { toStart(); nav({ idea: null }, "replace"); }); showToast(published ? "Removed from the list." : "Draft discarded."); },
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
          canSend={!!text.trim() && !sending} chips={[]} strip={false}
          actions={<RaiseActions rows={actionsOf(extras, myFiles.length, affected.length)} open={menu?.at === "add" ? menu.view : null}
            onOpen={(v) => setMenu((m) => (m?.at === "add" && m.view === v ? null : { at: "add", view: v }))} menu={menuFor("add")} onAddFiles={addFiles} />}
          onUnsupported={() => showToast("Dictation isn’t supported in this browser.")} />
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
    // What the dials' "Checked across the company" lines read (features/ideas/company-read.ts), where the company has it.
    ...([
      ["Org chart", seed.depts.reduce((n, d) => n + d.people, 0), "people, " + seed.depts.length + " departments", "DOC"], ["Named problems", seed.problems.length, "problems", "DATA"],
      ["Initiatives", seed.initiatives.length, "running or done", "IDEA"], ["Shipped outcomes", seed.outcomes.length, "promise vs result", "DATA"],
    ] as const).filter(([, n]) => n > 0).map(([name, n, what, ext]) => ({ name, where: n + " " + what, ext })),
    ...(myFiles.length ? [{ name: "Your evidence", where: myFiles.length + (myFiles.length === 1 ? " file" : " files"), ext: "DATA" as const }] : []),
  ];
  const sims: Similar[] = similar
    ? [{ title: similar.title, status: "Open", where: "Raised by", by: similar.from, href: href("/cases/" + similar.id) }]
    : [{ title: "No close matches", status: "–", where: "Searched " + openCases + " open cases", href: null }];
  const cats = [...new Set([ev?.route?.type, affected[0] ?? "General", "Idea"].filter((x): x is string => !!x))];
  const pattern = affected.length > 1 ? "The problem is felt beyond one team: " + affected.join(", ") + "." : "It stands on its own.";
  const company = companyRead({
    text: idea.text, lead: ev?.lead ?? lead, myDept: who.line.split(",")[0].trim(), affected, people: seed.people, depts: seed.depts,
    routes: seed.routes, goals: GOALS, problems: seed.problems, ideas: seed.ideas, initiatives: seed.initiatives, outcomes: seed.outcomes,
    cases: S.cases, promiseDays: seed.promiseDays, spendLimitEur: SPEND_LIMIT_EUR,
  });
  const summaryOf = (text: string) => ((x) => (x.length > 320 ? x.slice(0, 320).replace(/\s+\S*$/, "") + "…" : x))(text.replace(/\s+/g, " ").trim()) || "Nothing to summarise yet.";
  const analysis: AnalysisData = { dials: dialsOf(parts), company, summary: summaryOf(idea.text || ""), advice, pattern, cats, similar: sims, reviewers, sources };
  // NextUp's first reply stands under the full analysis: as the idea reads now while that reply is the latest,
  // after that as its first message was read - the scores it was answered with, not today's.
  const firstAi = turns[firstIdx + 1]?.role === "assistant" ? turns[firstIdx + 1].id : null;
  const firstRead: AnalysisData = !firstAi || firstAi === lastAi ? analysis : (() => {
    const b = scoreDraft({ turns: turns.slice(0, firstIdx + 1), affected, attachments: myFiles.length }, benchCtx);
    return { ...analysis, dials: dialsOf(b.parts), advice: adviceOf(b.overall, threshold, team || "your team"), summary: summaryOf(ideaFromTurns(turns.slice(0, firstIdx + 1)).text) };
  })();
  const thread = msgs.map((m) => (m.id === firstAi ? { ...m, full: firstRead } : m));

  const dials = analysis.dials;
  const finalDoc = ideaDoc({
    title: mine?.title.trim() || draft?.title || idea.title, author: who.name, team: team || "", receiver: lead,
    date: now.toLocaleDateString("en-GB", { day: "numeric", month: "long", year: "numeric" }),
    advice, overall: parts.some((p) => p.value > 0) ? Math.round(overall) : null,
    description: mine ? mine.description : shown.description,
    context: mine ? [mine.context.trim(), ...mine.prompts.filter((x) => x.label.trim() && x.text.trim()).map((x) => x.label.trim() + ": " + x.text.trim())].filter(Boolean).join("\n") : shown.context, dials,
    company, pattern,
    openTopics: gaps.filter((g) => g.status !== "clear").map((g) => g.label + (g.ask ? ": " + g.ask : "")),
    similar: sims.filter((m) => m.href).map((m) => ({ title: m.title, status: m.status, by: m.by ?? "" })),
    sources: sources.map((x) => ({ name: x.name, where: x.where })), turns,
  });

  const main = stage === "start" ? (
    <RaiseStart name={greetName(who.name)}
      composer={
        <RaiseComposer value={startText} onChange={setStartText} onSubmit={startRaise} fieldRef={startField} sendLabel="Ask NextUp"
          placeholder="Share an idea that would make work better…" canSend={startText.trim().length >= 3 && !evaluating}
          chips={[...chips, ...fileChips]} strip
          menuOpen={menu?.at === "start"} onMenu={() => toggleMenu("start")} menu={menuFor("start")}
          body={<PromptBody segs={segs} onSegs={setSegs} caretRef={caretRef} focus={bodyFocus} onFocus={setBodyFocus} headRef={startField} />}
          tray={<PromptTray onAdd={(p) => { const r = insertBlock(segs, caretRef.current, p); setSegs(r.segs); setBodyFocus({ seg: r.at, on: p.custom ? "label" : "text" }); }} />}
          onUnsupported={() => showToast("Dictation isn’t supported in this browser.")} />
      } />
  ) : drafting ? (
    <DocLoading />
  ) : shownView === "idea" ? (
    <IdeaSheet description={shown.description} context={shown.context} locked={published} onChange={editIdea} onClose={() => go("chat")} />
  ) : shownView === "final" && draft ? (
    <RaiseFinal doc={finalDoc} final={finalized} published={published} canSend={canFinalize && !pubStep}
      onSend={sendFinal}
      onEdit={() => go("preview")} onBack={() => go("chat")} onClose={() => go("chat")}
      onCopied={(ok) => showToast(ok ? "Copied the document as text." : "Could not copy it.")} />
  ) : shownView === "analysis" ? (
    <AnalysisSheet ready={turns.length > 0} onClose={() => go("chat")} {...analysis} />
  ) : (
    <RaiseChat msgs={thread} typing={!!sending && !sending.reply} error={studio.error}
      thinking={evaluating && evalStep !== null && firstText ? { step: evalStep, sub: (firstText.match(/\S+/g) || []).length + " words from " + (who.handle ?? who.name) + " · " + who.line } : null}
      gaps={railGaps} onAsk={(g) => { setAsk(g.ask); setTimeout(() => chatField.current?.focus(), 0); }}
      onAnalysis={() => go("analysis")} onPublish={openLook}
      dock={composerChat} followKey={turns.length + ":" + (sending ? sending.reply.length : -1) + ":" + (draft?.id ?? "") + ":" + (asking?.id ?? "")} />
  );

  return (
    <RaisePeople.Provider value={{ people: seed.people, depts: seed.depts }}>
    <div className={s.root} data-sb={sb} data-raise-root="">
      <Sync run={syncScript} />
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
      {prepping && <PreviewLoading />}
      {looking && !drafting && shownLook && draft && !published && (
        <PublishPreview author={who.name} look={shownLook} onLook={setLook}
          meet={extras.meet} onMeet={(meet) => preview.setExtras(key, { meet })}
          coll={extras.coll} people={seed.people} onColl={(coll) => preview.setExtras(key, { coll })}
          affected={affected} depts={seed.depts.map((d) => d.name)} onAffected={setAffected}
          files={myFiles} onAddFiles={addFiles} onRemoveFile={removeFile}
          aiLine={"Summary, scores, and " + sources.length + " sources are added for the receiver."}
          onClose={() => go("chat")} onConfirm={confirmLook} />
      )}
      <div className={s.main}>
        <div className={s.showSb}><button type="button" className={s.iconBtn} onClick={() => setSb("open")} title="Show sidebar" aria-label="Show sidebar"><Icon name="sidebar" size={12} /></button></div>
        {main}
      </div>
    </div>
    </RaisePeople.Provider>
  );
}

