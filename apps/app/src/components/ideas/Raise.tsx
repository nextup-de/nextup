"use client";
// The raise page (Claude Design handoff "Raise", docs/IDEAS.md): type one line, add context and
// people, NextUp evaluates it, the coach grills you on what is missing, you review the analysis and
// publish it to the right desk.
//
//   sidebar   search, the open draft and its actions, the ideas list        RaiseSidebar
//   main      start | chat (+ progress rail) | idea | analysis             RaiseStart, RaiseChat, RaiseSheets
//
// The conversation, the drafts, the benchmark and publishing are the idea studio's (lib/use-idea-studio.ts).
// Kept per page, not in the draft: who sees it, pins, "not sure" answers and idea edits are stand-ins
// (raisePreview.ts, RAISE-FOR-KEVIN.txt). The receiver is a desk chosen in the publish window (RaisePublish.tsx). What is open here - the conversation, the view, unsent text -
// is kept per company and person (lib/use-kept.ts): a visit to the dashboard and back finds it as it was.
//
// `script`: the static demo (app/demo, no company behind it) - the demo controls fill the demo script's
// idea and answers (features/ideas/demo-script.ts, lib/demo-controls.ts), the coach answers each with its
// prepared reply, the rail shows the script's eight topics, and nothing leaves the browser. The company's
// /raise never sets it.
import { Suspense, useCallback, useEffect, useMemo, useRef, useState } from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { useDemo } from "@/components/dashboard/DemoProvider";
import { mineOf } from "@/features/cases/selectors";
import { isSampleId } from "@/features/demo/sample-data";
import { PageSkeleton } from "@/components/dashboard/shared/PageSkeleton";
import { stripTags } from "@/features/assist/check";
import { newId } from "@/features/cases/events";
import { closest, evaluate } from "@/features/evaluate";
import { audienceOf } from "@/features/ideas/audience";
import { choosesPosting } from "@/features/ideas/posting";
import { benchmark } from "@/features/ideas/benchmarks";
import { finishTitle, ideaFromTurns } from "@/features/ideas/coach";
import { briefOfDoc, ideaDoc } from "@/features/ideas/finalize";
import { companyRead } from "@/features/ideas/company-read";
import type { ExportAnalysis, ExportIdea } from "@/features/ideas/export";
import { splitBody } from "@/features/ideas/brief";
import { ideaContext, routingTextHash, turnLimitReached, type ShownProposal } from "@/features/ideas/drafts";
import { DEMO_CASE, DEMO_SCRIPT, FILLED_ANSWERS, SCRIPT_MOVES, scriptDials, scriptOverall, scriptRail, scriptStep } from "@/features/ideas/demo-script";
import { useLocale, useT } from "@/i18n/client";
import { formatDate } from "@/i18n/format";
import { DEFAULT_LOCALE, LOCALES, translate, type MessageKey } from "@/i18n";
import { adviceFromReading, dialsFromReading, gapsFromReading, latestReading, proposalOf } from "@/features/ideas/reading";
import { adviceOf, clockLabel, dialsMoved, dialsOf, greetName, IDEA_UPDATE, ideaNow, initials, isUnsure, gapsOf, answeredOf, MAX_TOPICS, openCount, splitIdea, topicIn, splitUpdate, topicLabel, topicsOf, dayGroup, whenGroup, whenLabel, type Dial, type DialKey, type Topic } from "@/features/ideas/raise";
import { registerRaiseHooks } from "@/lib/demo-controls";
import { DEV_SAMPLES, registerDevFill } from "@/lib/dev-fill";
import { seatAboveRole } from "@/features/cases/sheets";
import type { CaseProposal } from "@/features/cases/events/case";
import { desksFor, otherDesks, type Desk } from "@/features/ideas/desks";
import { answeringDesk } from "@/features/overload/answer";
import { raiseTarget } from "@/features/ideas/raise-actions";
import { addWorkdays } from "@/features/clock/calendar";
import { saveShots, shrinkImage } from "@/lib/shots";
import { saveRaised } from "@/lib/raised";
import { brainProposalAction } from "@/server/actions/brain";
import { useIdeaStudio } from "@/lib/use-idea-studio";
import { useKept } from "@/lib/use-kept";
import type { Chip } from "./RaiseComposer";
import { RaiseComposer } from "./RaiseComposer";
import { actionsOf, RaiseActions, RaiseMenu, type MenuView } from "./RaiseMenu";
import { PromptBody, PromptTray, type BodyFocus } from "./RaisePrompts";
import { followDraft, mayFollow } from "@/features/cases/links";
import { EMPTY_BODY, insertBlock, promptContext, segsContext, splitPrompts, splitSegs, type Caret, type Seg } from "@/features/ideas/prompts";
import { DeskDialog, type Sent, type Work } from "./RaisePublish";
import { PreviewLoading, PublishPreview, type Look } from "./PublishPreview";
import { RaiseExport } from "./RaiseExport";
import { RaiseChat, repeatsAsk, type ChatMsg, type PastTopic, type Read } from "./RaiseChat";
import { AnalysisSheet, IdeaSheet, type AnalysisData, type Reviewer, type Similar, type Source } from "./RaiseSheets";
import { RaiseSidebar, type DraftCard, type IdeaRow } from "./RaiseSidebar";
import { RaiseStart } from "./RaiseStart";
import { useRaisePreview, type FileItem } from "./raisePreview";
import { Icon } from "./raiseIcons";
import { RaisePeople } from "./RaisePerson";
import s from "./Raise.module.css";
import { track } from "@/lib/test-analytics";

// Runs `run` after every render: how handlers made after the page's early return reach a ref.
function Sync({ run }: { run: () => void }) { useEffect(run); return null; }

// Older drafts carry the start page's former receiver, colleague and meeting lines in the first message; these
// still recognise them (in any language the catalog has) so they stay hidden.
const escapeRe = (x: string) => x.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
const lineRes = (key: MessageKey) => LOCALES.map((l) => new RegExp("^" + translate(l, key).split(/\{\w+\}/).map(escapeRe).join("(.+)") + "$"));
const RECV_LINE = lineRes("ideas.pageExtraReceiver"), COLL_LINE = lineRes("ideas.pageExtraColleagues"), MEET_LINE = lineRes("ideas.pageExtraMeeting");
const lineMatch = (res: RegExp[], line: string) => { for (const re of res) { const m = line.match(re); if (m) return m; } return null; };
const isExtraLine = (line: string) => [RECV_LINE, COLL_LINE, MEET_LINE].some((res) => lineMatch(res, line.trim()));

// An earlier item's status as the reading carries it (the case's own word, or "known problem"), in the page's language.
const SIM_STATUS: Record<string, MessageKey> = { open: "ideas.pageSimOpen", discussion: "ideas.pageSimDiscussion", decided: "ideas.pageSimDecided", asked: "ideas.pageSimAsked", building: "ideas.pageSimBuilding", shipped: "ideas.pageSimShipped", "known problem": "ideas.pageSimProblem" };

// The author's messages (the idea, then answers) before it can be published: the demo script's pace, and the most a
// rail from the AI reading can hold it back (its questions are asked afresh each turn, so they cannot be checked off).
const MIN_EXCHANGES = FILLED_ANSWERS + 1;
const MAX_SHOTS = 4; // screenshots kept with the case in this browser (lib/shots.ts)
const sizeOf = (bytes: number) => (bytes > 1e6 ? (bytes / 1e6).toFixed(1) + " MB" : Math.max(1, Math.round(bytes / 1e3)) + " KB");
type DeskPlan = { desks: Desk[]; aiOff: boolean }; // the desks to choose from, and whether the keywords made the proposal
type Menu = { at: "start" | "chat" | "card" | "add"; view: MenuView } | null; // "add": under a start-page action button

// The screens of an open idea, as the URL names them (`?idea=<draft id>&view=…`, no view = the chat). The URL
// is the source of truth for which idea and which screen are open, so the browser's back and forward walk
// the screens and a reload or a shared link opens the same place. Which screens an idea may show comes from
// its own state (messages, finalized, published), never from the URL: a screen it is past or not yet at
// falls back to the chat, and a published idea stays read-only - going back never undoes anything.
type View = "chat" | "idea" | "analysis" | "preview" | "export";
const VIEWS: readonly string[] = ["idea", "analysis", "preview", "export"];

// useSearchParams needs a Suspense boundary above it; the skeleton is what shows until the URL is read.
export function Raise(p: { script?: boolean }) {
  return <Suspense fallback={<PageSkeleton kind="raise" delay />}><RaisePage {...p} /></Suspense>;
}

function RaisePage({ script = false }: { script?: boolean }) {
  const t = useT();
  const locale = useLocale();
  const { seed, S, persona, role, act, ready, href, tenant, showToast, serverMode, f, me, sampleData } = useDemo();
  const router = useRouter();
  const story = script && role === "member"; // the demo script is the employee's story; others raise their own
  // The static demo scores and answers in this browser, against the seed it shows.
  const local = useMemo(() => (script ? ideaContext(seed.routes, seed.goals, S.cases, seed.spend) : null), [script, seed.routes, seed.goals, seed.spend, S.cases]);
  const studio = useIdeaStudio(tenant.slug, serverMode, persona.who.name, local);
  const scope = tenant.slug + "/" + persona.who.name; // whose page this is: what is kept across visits, per person
  const preview = useRaisePreview(scope);
  const { draft, live, threshold, sending } = studio;
  const who = persona.who;
  // Who the idea goes out as (decision Q1.7): the company preselects, the member can change it on the last look.
  const [asName, setAsName] = useState<boolean | null>(null);
  const postsByName = asName ?? seed.postAs === "name";

  const [keptStage, setStage] = useKept<"start" | "chat">(scope, "stage", "start");
  const [openId, setOpenId] = useKept<string | null>(scope, "open", null); // the draft open in the chat, reopened on the next visit
  const pathname = usePathname(), params = useSearchParams();
  const urlIdea = params.get("idea");
  // "Start a better idea from it" (plan SEE, D15): /raise?follows=<case>. Only the raiser of a no may follow it up; any other value is ignored and the page works as without it.
  const urlFollows = params.get("follows");
  const follows = useMemo(() => {
    const c = urlFollows ? S.cases.find((x) => x.id === urlFollows) : undefined;
    return c && mayFollow(c, me.userId) ? c : null;
  }, [urlFollows, S.cases, me.userId]);
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
  const [sb, setSb] = useKept<"auto" | "open" | "hidden">(scope, "sb", "hidden"); // closed until asked for. auto, after a pick from an open one: stays open on screens, the drawer closes on phones (CSS)
  const [query, setQuery] = useState("");
  const [startText, setStartText] = useKept(scope, "startText", "");
  const followed = useRef<string | null>(null); // the follow-up whose start was filled in: once, so a person's own edits are never overwritten
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
  const [evalOn, setEvalOn] = useState(false); // the first message is sent: the evaluation shows until the first reply (its phases: studio.evalRun)
  const [busy, setBusy] = useState(false);
  // Publishing: the step NextUp is on while it finds where the idea should go, then the desks to
  // choose from; `pubWork` is the step while the chosen one is published, `sent` the window afterwards.
  const [pubStep, setPubStep] = useState<null | Work | DeskPlan>(null);
  const [pubWork, setPubWork] = useState<Work | null>(null);
  const [sent, setSent] = useState<Sent | null>(null);
  // The last look before publishing: per draft, the author's words as the case will carry them; open or not.
  const [looks, setLooks] = useKept<Record<string, Look>>(scope, "looks", {});
  // Per reply of NextUp's: the topics it left unclear, as they stood when the author answered it - they stay under it.
  const [asked, setAsked] = useKept<Record<string, string[]>>(scope, "asked", {});
  const [prepping, setPrepping] = useState(false); // the second between "Publish" and the last look (PreviewLoading)
  const [now, setNow] = useState(() => new Date());
  const startField = useRef<HTMLTextAreaElement>(null);
  const shownRouting = useRef<{ proposal: CaseProposal; hash: string } | null>(null); // the proposal the desk window showed, and the text it was made for
  const caretRef = useRef<Caret | null>(null); // where a block from the mini bar lands
  const fillRef = useRef<(fixed?: boolean) => void>(() => {});
  const chatField = useRef<HTMLTextAreaElement>(null);

  const key = slot;
  const extras = preview.extras(key);
  const myFiles = useMemo(() => files[key] ?? [], [files, key]);
  const turns = useMemo(() => draft?.turns ?? [], [draft]);
  const idea = useMemo(() => ideaFromTurns(turns), [turns]);
  const affected = draft?.affected ?? startAff;
  const storedParts = live?.parts ?? draft?.scores ?? [];
  // The model's reading of the idea: what the page shows. Null: no model, or it failed - the keyword benchmark answers.
  // While a message is on its way the page stays with the reply it answers: the new reading lands with its own
  // reply, so the dials under the old one do not jump and jump back.
  const reading = script ? null : live && !sending ? live.reading : latestReading(turns);
  const overall = studio.overall;
  const published = draft?.status === "published";
  const firstIdx = turns.findIndex((t) => t.role === "user");
  const current = useMemo(() => ideaNow(turns), [turns]); // the first message with every answer since in its context
  const edit = draft ? preview.edits[draft.id] ?? null : null;
  const shown = splitIdea(edit ? edit.text : current);
  // The demo script: where this conversation stands in it (-1 once the author wrote their own words).
  const scriptAt = story ? scriptStep(turns) : -1;
  // The rail: the topics prepared when the idea was raised - for a draft from an earlier visit, worked out
  // again from its first message. As many as the idea needs: one or two for a precise one, many for a vague one.
  const benchCtx = useMemo(() => ideaContext(seed.routes, seed.goals, S.cases, seed.spend), [seed.routes, seed.goals, seed.spend, S.cases]);
  // The scores come from the studio in the default language; in another one they are read again from the conversation.
  const parts = locale === DEFAULT_LOCALE || !turns.length ? storedParts : benchmark({ text: idea.text, affected, attachments: myFiles.length }, benchCtx, locale).parts;
  const myTopics = topics[slot] ?? (firstIdx >= 0 ? topicsOf(benchmark({ text: turns[firstIdx].text, affected: [], attachments: 0 }, benchCtx, locale).parts, locale) : []);
  // Each answer since the idea, with the benchmark as it stood just before it: answeredOf replays them, so a
  // topic is checked off once the author has answered it, in their own words, even where the benchmark cannot tell.
  const rounds = useMemo(() => turns.flatMap((tn, i) => (i <= firstIdx || tn.role !== "user" ? []
    : [{ said: tn.text, parts: benchmark({ text: ideaFromTurns(turns.slice(0, i)).text, affected, attachments: myFiles.length }, benchCtx, locale).parts }])),
  [turns, firstIdx, affected, myFiles.length, benchCtx, locale]);
  const unknownHere = draft ? preview.unknown[draft.id] ?? [] : [];
  // The demo script has its own eight topics, cleared one per answer, as long as the conversation follows it.
  // With the AI reading on, the rail is the reading's open questions instead.
  const gaps: Topic[] = !draft || !turns.length ? [] : reading ? gapsFromReading(reading, unknownHere) : scriptAt >= 1 ? scriptRail(scriptAt)
    : gapsOf(myTopics, parts, unknownHere, locale, answeredOf(myTopics, rounds, unknownHere, locale));
  // Publishing waits until the rail is done: every topic answered, checked off or "not sure", and NextUp has
  // replied - after one answer for a precise idea, after many for a vague one. The demo script keeps its
  // own pace: the idea and the two answers the controls fill (FILLED_ANSWERS).
  const said = turns.filter((t) => t.role === "user").length;
  const scripted = story && scriptAt >= MIN_EXCHANGES;
  // At the turn limit no further question can be asked: the rail counts as done, and the last look lists what is still open (plan REM, R1).
  const atLimit = turnLimitReached(turns.length);
  const railDone = scriptAt >= 1 ? said >= MIN_EXCHANGES
    : turns.some((t) => t.role === "assistant") && (openCount(gaps) === 0 || (reading !== null && said >= MIN_EXCHANGES) || atLimit);
  const stillOpen = atLimit && !published ? gaps.filter((g) => g.status === "open" || g.status === "active").map((g) => g.label) : [];
  const canFinalize = turns.length > 0 && !busy && !sending && (railDone || published);

  useEffect(() => { const t = setInterval(() => setNow(new Date()), 60_000); return () => clearInterval(t); }, []);

  // The start page, empty: a new idea, or where the browser's back led from an open one.
  const toStart = useCallback(() => {
    studio.startNew(); setText(""); setAsk(null); setMenu(null); setOpenId(null);
    setStage("start"); setStartText(""); setSegs(EMPTY_BODY); caretRef.current = null; setStartAff([]); setEvalOn(false); setSlot(newId("n"));
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
        if (before !== undefined) setText(""); // arriving, the box is empty or holds a message a reload cut off
        setAsk(null); setMenu(null); setEvalOn(false);
        setStage("chat"); setOpenId(urlIdea); setSlot(aliases[urlIdea] ?? urlIdea);
      });
    } else if (before === undefined) {
      if (openId && stage === "chat") nav({ idea: openId }, "replace");
    } else toStart();
  }, [ready, urlIdea]); // eslint-disable-line react-hooks/exhaustive-deps -- on a change of the URL's idea only

  // A reload cut off a message before it was answered: it is back in the box, the idea itself on the start page.
  useEffect(() => {
    const r = studio.recovered;
    if (!r) return;
    studio.setRecovered(null);
    if (r.first) {
      const at = r.text.indexOf("\n\n");
      setStartText(at < 0 ? r.text : r.text.slice(0, at));
      setSegs(at < 0 ? EMPTY_BODY : splitSegs(r.text.slice(at + 2)));
    } else setText(splitUpdate(r.text).said);
    showToast(t("ideas.pageToastRecovered"));
  }, [studio.recovered]); // eslint-disable-line react-hooks/exhaustive-deps -- when one comes back

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
  const evaluating = evalOn && !replied;

  // A screen the idea cannot show (the last look or the export of a published idea, or before the rail is done):
  // the chat instead. Checked once the idea in the URL is the one loaded, and not while it is being worked on.
  useEffect(() => {
    if (!draft || draft.id !== urlIdea || sending || busy || pubStep || view === "chat") return;
    const ok = view === "preview" || view === "export" ? !published && railDone : true;
    if (!ok) nav({ view: "chat" }, "replace");
  }, [draft, urlIdea, sending, busy, pubStep, view, published, railDone, nav]);

  // What the evaluation and the analysis say about who receives it: the routing, run here on the open idea.
  const ev = useMemo(() => {
    if (!idea.text && !startText.trim()) return null;
    return evaluate({ kind: "idea", text: idea.text || startText, affected, attachments: myFiles.length, who }, { ...seed, cases: S.cases }, reading ? proposalOf(reading) : null);
  }, [idea.text, startText, affected, myFiles.length, who, seed, S.cases, reading]);

  const similar = useMemo(() => {
    if (!idea.text) return null;
    return closest(idea.text, S.cases.filter((c) => c.open && c.id !== draft?.caseId), (c) => c.title);
  }, [idea.text, S.cases, draft?.caseId]);

  // The follow-up starts with the old title as its line and the editable context about the answer, while both are empty (D15).
  useEffect(() => {
    if (!follows || followed.current === follows.id || stage !== "start") return;
    followed.current = follows.id;
    if (startText.trim() || segsContext(segs).trim()) return;
    const start = followDraft(follows, t);
    setStartText(start.text);
    setSegs(splitSegs(start.context));
  }, [follows, stage, startText, segs, t, setStartText, setSegs]);

  // The dev panel's "Fill a sample idea", offered while the start view is open (lib/dev-fill.ts).
  useEffect(() => (stage === "start" ? registerDevFill(() => fillRef.current()) : undefined), [stage]);
  // `fixed`: the demo controls' fill - the same sample every time.
  useEffect(() => {
    fillRef.current = (fixed = false) => {
      const x = DEV_SAMPLES[fixed ? 0 : Math.floor(Math.random() * DEV_SAMPLES.length)];
      // People from this company's own seed: the samples' names only where they exist (the static demo renames them).
      const known = (n: string) => seed.people.some((p) => p.name === n);
      setStartText(x.text); setSegs(splitSegs(x.ctx)); caretRef.current = null; setStartAff(x.aff.filter((a) => !/^[A-Z]\. /.test(a) || known(a))); setMenu(null);
      setFiles((f) => ({ ...f, [slot]: x.files.map((name) => ({ id: newId("f"), name, url: "", img: false, file: new File([], name) })) }));
      preview.setExtras(slot, { vis: "public", visTo: [] });
    };
  });

  // The demo controls (lib/demo-controls.ts): the click the script needs next, made from the controls -
  // fill, Ask NextUp, each answer filled and sent, the last look, Choose a desk. The handlers are this render's (see below).
  const scriptRef = useRef({ send: () => {}, preview: () => {}, findReceiver: () => {} });
  const autoPick = useRef(false); // sent from the controls: the desk NextUp proposes first gets it, no dialog to answer
  const publishRef = useRef<(to: Desk) => Promise<void>>(async () => {});
  const idle = ready && !sending && !published && !pubStep && !busy;
  const canIdea = story && idle && stage === "start" && !evaluating;
  const canSend = story && idle && !evaluating && (stage === "start" ? (startText.trim() || segsContext(segs).trim()).length >= 3 : !!draft && view === "chat" && text.trim().length >= 3);
  const answer = story && scriptAt >= 1 && scriptAt <= FILLED_ANSWERS ? DEMO_SCRIPT[scriptAt].say : null; // the script's next answer
  const canAnswer = story && idle && stage === "chat" && view === "chat" && !!draft && !!answer && text.trim() !== answer;
  const canPreview = story && idle && stage === "chat" && !!draft && canFinalize && !looking && !prepping;
  const canConfirm = story && idle && looking && !!draft;
  useEffect(() => (canIdea || canSend || canAnswer || canPreview || canConfirm ? registerRaiseHooks({
    at: scriptAt,
    fillIdea: canIdea ? () => fillRef.current(true) : null,
    fillAnswer: canAnswer && answer ? () => { setText(answer); setTimeout(() => chatField.current?.focus(), 0); } : null,
    send: canSend ? () => scriptRef.current.send() : null,
    preview: canPreview ? () => scriptRef.current.preview() : null,
    findReceiver: canConfirm ? () => scriptRef.current.findReceiver() : null,
  }) : undefined), [canIdea, canSend, canAnswer, answer, canPreview, canConfirm, scriptAt, setText]);
  // Sent from the controls: once the desks are in, the first one receives it after a moment to read it.
  useEffect(() => {
    if (!autoPick.current || !pubStep || !("desks" in pubStep) || !pubStep.desks.length) return;
    autoPick.current = false;
    const to = pubStep.desks[0], t = setTimeout(() => void publishRef.current(to), 1200);
    return () => clearTimeout(t);
  }, [pubStep]);

  if (!ready) return <PageSkeleton kind="raise" />;

  // The chat shows NextUp's reply with its short read; the full analysis opens only when asked for.
  const shownView = view === "preview" ? "chat" : view; // the last look opens over the chat
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
    const message = main + (ctx ? "\n\n" + ctx : "");
    // Every idea, the demo script's too, lands in the chat: NextUp's reply, its short read and what is still unclear.
    setMenu(null); setEvalOn(true);
    setTopics((x) => ({ ...x, [slot]: topicsOf(benchmark({ text: message, affected: startAff, attachments: myFiles.length }, benchCtx, locale).parts, locale) }));
    void studio.send(message, { affected: startAff, attachments: myFiles.length });
    track("coach_message_sent", { n: 1 });
    setStage("chat"); setStartText(""); setSegs(EMPTY_BODY); caretRef.current = null;
  };

  // One step of the work, said in the button while it runs: the label and the orb's mode, the real work,
  // and a short minimum so each step can be read.
  const step = async <T,>(set: (w: Work) => void, label: string, orb: Work["orb"], work: () => Promise<T> | T, min: number): Promise<T> => {
    set({ label, orb });
    const [v] = await Promise.all([Promise.resolve().then(work), new Promise((r) => setTimeout(r, min))]);
    return v;
  };

  // What the case will say: the demo script's main points, or the idea as the conversation has it - its
  // first paragraph the description, "*Label* text" lines the details, the rest context (without the
  // former receiver, colleague and meeting lines of an older draft).
  const outgoing = scripted ? DEMO_CASE : { body: idea.body, upside: ev?.payload.upside ?? "" };
  const mine = draft ? looks[draft.id] ?? null : null;
  const bodyOf = (l: Look) => [l.description.trim(), l.context.trim(),
    l.prompts.filter((x) => x.label.trim() && x.text.trim()).map((x) => "*" + x.label.trim() + "* " + x.text.trim()).join("\n")].filter(Boolean).join("\n\n");
  const setLook = (l: Look) => { if (draft) setLooks((x) => ({ ...x, [draft.id]: l })); };

  // "Publish": first the last look (PublishPreview.tsx) - the idea as the desk's inbox shows it, the
  // author's part editable - and from there NextUp proposes the desk. The look is kept per
  // draft, so closing and reopening it loses nothing.
  // The last look as NextUp first lays it out: the description is the author's own first line (the
  // script's case has its own); what they wrote under it is the context.
  const lookOf = (): Look => {
    const parts = splitBody(outgoing.body);
    // The first message's first paragraph only: idea.text joins later answers with a single newline, so its first
    // paragraph would swallow them and the context below would say them a second time.
    const description = scripted ? parts.description : splitIdea(current).description.trim();
    const rest = scripted ? parts.context ?? "" : [parts.description, parts.context].filter(Boolean).join("\n\n");
    const context = rest.split("\n").filter((l) => !isExtraLine(l)).join("\n").trim();
    return { title: finishTitle(draft?.title || idea.title), description, context, prompts: parts.facts };
  };
  // Opened by a link or the back button there is no kept look yet: the first layout shows until it is edited.
  const shownLook = mine ?? (looking && draft ? lookOf() : null);
  const openLook = () => {
    if (!draft || busy || published || pubStep || prepping) return;
    setMenu(null);
    track("publish_clicked", { exchanges: said });
    if (!mine) setLook(lookOf());
    setSb((x) => (x === "open" ? "auto" : x)); // on a phone the drawer closes, so the window is what shows
    // A second of placeholder first, while NextUp lays it out; then the last look, with Choose a desk.
    setPrepping(true);
    setTimeout(() => { setPrepping(false); nav({ view: "preview" }); }, 1000);
  };

  // Who really answers a raise to this desk (plan OVL, D25): known where the page holds the company's reduced state (server mode); the demo keeps today's line.
  // The page never waits on it: where working it out fails, the desk is offered as it is, without an answer.
  const answerOf = (d: Desk) => {
    if (!serverMode) return undefined;
    try {
      return answeringDesk(S, d.routeId, S.day, (roleId) => seatAboveRole(seed.seats ?? [], seed.roles ?? [], roleId)?.id ?? null);
    } catch {
      return undefined;
    }
  };
  const withAnswer = (d: Desk): Desk => {
    const answer = answerOf(d);
    return answer ? { ...d, answer: { why: answer.why, names: answer.names } } : d;
  };

  // "Publish idea": the button says what NextUp does - reads the idea, asks the router, checks the org
  // chart, lists the desks - then the author picks where it goes (RaisePublish.tsx).
  const askDesk = async () => {
    if (!draft || busy || published || pubStep) return;
    setMenu(null); setSent(null);
    shownRouting.current = null;
    const text = await step(setPubStep, t("ideas.pageStepReading"), "working", () => (mine ? mine.title + "\n\n" + bodyOf(mine) : idea.text), 450);
    const brain = await step(setPubStep, t("ideas.pageStepRouter"), "searching", () => (script ? null : brainProposalAction({ slug: tenant.slug, title: idea.title, body: idea.body }).catch(() => null)), 650);
    await step(setPubStep, t("ideas.pageStepOrg"), "connecting", () => null, 500);
    const plan = await step(setPubStep, t("ideas.pageStepRanking"), "weaving", () => {
      const proposal = evaluate({ kind: "idea", text, affected, attachments: myFiles.length, who }, { ...seed, cases: S.cases }, brain).payload.proposal;
      // The routing the author is about to see, with the fingerprint of the title and body it was made for: the raise sends both (plan REM, R1).
      if (mine && !script) shownRouting.current = { proposal, hash: routingTextHash(mine.title.trim(), bodyOf(mine)) };
      const desks = desksFor({ text, routes: seed.routes, seats: seed.seats, proposal, myDept: who.line.split(",")[0].trim(), affected, spendLimitEur: seed.spend?.limitEur ?? null }, locale);
      return { desks: desks.map(withAnswer), aiOff: proposal.source === "keywords" };
    }, 450);
    setPubStep(plan);
  };

  // When the desk owes an answer: the company's promise days on the working-day calendar (the demo counts days as the page does).
  const dueLabel = () => seed.clock.mode === "workdays"
    ? formatDate(locale, new Date(addWorkdays(new Date().toISOString().slice(0, 10), seed.promiseDays, seed.clock.calendar) + "T12:00:00Z"), "dayMonth")
    : f(S.day + seed.promiseDays);

  const publish = async (to: Desk) => {
    if (!draft || busy || published) return;
    track("recipient_chosen", { recommended: to.recommended, proposedBy: to.proposedBy ?? "none" });
    setBusy(true);
    const caseId = newId("c");
    const r = await step(setPubWork, t("ideas.pageStepChecking"), "solving", () => studio.publish(caseId), 500);
    if (!r.ok) { setBusy(false); setPubWork(null); setPubStep(null); showToast(r.reason); return; }
    // The server said yes: raise it now, on the desk the author chose. The router's own proposal stays
    // in the payload, so the decision log can compare it with where the case went.
    // The author's last look wins: its title and body are what the receiver reads.
    const title = mine?.title.trim() || r.title;
    const e = evaluate({ kind: "idea", text: title, context: r.body, affected, attachments: myFiles.length, who, ...audienceOf(extras) }, { ...seed, cases: S.cases }, r.brain);
    // The demo script's case carries its main points instead of the raw conversation.
    const made = scripted ? DEMO_CASE : { body: r.body, upside: e.payload.upside };
    const body = mine ? bodyOf(mine) : made.body;
    // The routing the author saw goes with the raise, with the fingerprint of its text: the server keeps it when the text is the same, else it asks again (plan REM, R1).
    const shown = shownRouting.current;
    const proposal: ShownProposal | CaseProposal | undefined = shown && shown.hash === routingTextHash(title, body) ? { ...shown.proposal, textHash: shown.hash } : e.payload.proposal;
    // The raise publishes the draft with it, or neither (Q1.11): refused, the draft stays open and the toast says why.
    const raised = await step(setPubWork, t("ideas.pageStepRaising", { name: to.title }), "composing", () => act.raiseDraft({ ...e.payload, proposal, ...(choosesPosting({ role, name: who.name, handle: who.handle ?? null }) ? { asName: postsByName } : {}), title, body, upside: made.upside, assignee: seed.routes.find((r) => r.id === to.routeId)?.owner.name ?? e.payload.assignee, routeId: raiseTarget(to).routeId ?? e.payload.routeId, ...(follows ? { follows: follows.id } : {}) }, caseId, draft.id), 600);
    if (!raised.ok) { setBusy(false); setPubWork(null); setPubStep(null); return; }
    // Everything the raise page worked out goes with the case: the document, the dials, every file (not only the images).
    saveRaised(tenant.slug, caseId, briefOfDoc({ ...finalDoc, receiver: to.title }, {
      files: myFiles.map((f) => ({ name: f.name, size: f.file.size ? sizeOf(f.file.size) : "" })), affected, categories: cats, receiverRole: to.title, depts: seed.depts, people: seed.people,
    }, locale));
    const images = myFiles.filter((f) => f.img).slice(0, MAX_SHOTS);
    if (images.length) {
      const kept = await step(setPubWork, t("ideas.pageStepShots"), "working", async () => {
        const shots = await Promise.all(images.map((f) => shrinkImage(f.file).catch(() => null)));
        return saveShots(tenant.slug, caseId, shots.filter((x) => x !== null));
      }, 400);
      if (!kept) showToast(t("ideas.pageToastShotsFull"));
    }
    setBusy(false); setPubWork(null);
    setSent({ role: to.title, names: to.answer?.names ?? to.holders, deputies: to.deputies, date: dueLabel(), why: to.answer?.why, nobody: to.answer === null && answerOf(to) === null }); // the window stays, now saying who owes an answer by when; `nobody`: it is known that nobody can answer, not that working it out failed
    go("chat"); // published: back to the conversation, where the case is offered
    void studio.open(draft.id);
  };

  const send = () => {
    const typed = text.trim();
    if (!typed || sending) return;
    if (/^(publish( now)?|veröffentlichen)$/i.test(typed)) { setText(""); openLook(); return; }
    if (/^(review analysis|analyse prüfen)$/i.test(typed)) { setText(""); go("analysis"); return; }
    if (published) { showToast(t("ideas.pageToastPublished")); return; }
    if (typed.length < 3) return;
    // "Not sure": the active topic becomes unknown, and the coach is told not to ask it again - nor the ones
    // the author has answered, this message included, so the coach and the rail agree on what is still open.
    const skip = draft ? [...(preview.unknown[draft.id] ?? [])] : [];
    const unsure = draft && isUnsure(typed) ? (gaps.find((g) => g.ask === ask) ?? gaps.find((g) => g.status === "active")) : undefined;
    if (draft && unsure) { preview.markUnknown(draft.id, unsure.id); skip.push(unsure.id); }
    // This answer counts as the replay will count it (answeredOf), so the coach does not ask the same point straight back.
    if (draft && scriptAt < 1 && !reading) skip.push(...answeredOf(myTopics, [...rounds, { said: typed, parts }], skip, locale));
    // Edits made in the Idea view travel with this message, so the coach and the score see them.
    const message = edit ? typed + IDEA_UPDATE + edit.text : typed;
    if (draft && edit) preview.edit(draft.id, null);
    if (lastAi && unclear.length) setAsked((a) => (a[lastAi] ? a : { ...a, [lastAi]: unclear.map((g) => g.id) }));
    // In the route's language, at most 20; a reading's question is cut to the 300 characters the route takes (they say which).
    void studio.send(message, { affected, attachments: myFiles.length, skip: [...new Set(skip.map((k) => topicIn(k, locale).slice(0, 300)))].slice(0, MAX_TOPICS) })
      .then((r) => { if (r === "failed") setText((x) => x || typed); });
    track("coach_message_sent", { n: said + 1, unsure: Boolean(unsure) });
    setText(""); setAsk(null);
  };

  // The last look confirmed ("Choose a desk"): the window closes and NextUp proposes the desks.
  const confirmLook = () => {
    if (!draft) return;
    if (!mine && shownLook) setLook(shownLook);
    go("chat");
    void askDesk();
  };
  // This render's handlers, for the demo controls (handed over after the render, see Sync).
  const syncScript = () => {
    scriptRef.current = {
      send: stage === "start" ? startRaise : send, preview: openLook,
      findReceiver: () => { autoPick.current = true; confirmLook(); },
    };
    publishRef.current = publish;
  };

  const editIdea = (description: string, context: string) => {
    if (!draft) return;
    preview.edit(draft.id, { orig: current, text: description + (context.trim() ? "\n\n" + context : "") });
  };
  // The Idea view shows the idea as the last look does (IdeaCard.tsx): its "*Label*" and "Impact:" lines
  // as rows, the former receiver, colleague and meeting lines of an older draft left out but kept in the text.
  const ctxLines = shown.context.split("\n");
  const extraLines = ctxLines.filter(isExtraLine);
  const ideaParts = splitPrompts(ctxLines.filter((l) => !isExtraLine(l)).join("\n"));
  const ideaLook: Look = { title: draft?.title || idea.title, description: shown.description, context: ideaParts.free, prompts: ideaParts.rows };
  const editLook = (l: Look) => editIdea(l.description, [promptContext(l.context, l.prompts), extraLines.join("\n")].filter(Boolean).join("\n"));
  const cardProps = {
    affected, depts: seed.depts.map((d) => d.name), onAffected: setAffected,
    files: myFiles, onAddFiles: addFiles, onRemoveFile: removeFile,
  };

  // ── Derived for the views ───────────────────────────────────────────────────────────────────
  // Where it went: the published case's own assignee; before that, the team lead it would land with.
  const lead = (draft?.caseId ? S.cases.find((c) => c.id === draft.caseId)?.assignee : undefined) ?? ev?.lead ?? t("ideas.pageYourTeamLead");
  const team = affected[0] ?? who.line.split(",")[0];

  const chips: Chip[] = (() => {
    const at = stage === "start" ? "start" : "card";
    const out: Chip[] = [];
    if (affected.length) out.push({ key: "a", title: affected.length === 1 ? affected[0] : affected[0] + " +" + (affected.length - 1), sub: t("ideas.pageChipAffected"), kind: "affected", lead: "", icon: "affected", open: () => openMenu(at, "affected"), remove: () => setAffected([]) });
    if (extras.vis !== "public") out.push(extras.vis === "private"
      ? { key: "v", title: t("ideas.pageChipPrivate"), sub: t("ideas.pageChipPrivateSub"), kind: "private", lead: "", icon: "lock", open: () => openMenu(at, "vis"), remove: () => preview.setExtras(key, { vis: "public", visTo: [] }) }
      : { key: "v", title: t("ideas.pageChipCustom"), sub: extras.visTo.length ? t("ideas.pageChipSelected", { n: extras.visTo.length }) : t("ideas.pageChipPickWho"), kind: "custom", lead: "", icon: "affected", open: () => openMenu(at, "visPick"), remove: () => preview.setExtras(key, { vis: "public", visTo: [] }) });
    return out;
  })();
  const fileChips: Chip[] = myFiles.map((f) => ({ key: f.id, title: f.name, sub: t("ideas.pageChipAttached"), kind: "file", lead: (f.name.split(".").pop() || "file").slice(0, 4).toUpperCase(), img: f.img ? f.url : undefined, open: () => openMenu(stage === "start" ? "start" : "card", "file"), remove: () => removeFile(f.id) }));

  const menuFor = (at: NonNullable<Menu>["at"]) => menu && menu.at === at ? (
    <RaiseMenu at={at === "card" ? "card" : "bar"} view={menu.view} onView={(v) => setMenu({ at, view: v })} onClose={() => setMenu(null)}
      extras={extras} onExtras={(x) => preview.setExtras(key, x)} affected={affected} onAffected={setAffected}
      files={myFiles} onAddFiles={addFiles} onRemoveFile={removeFile} people={seed.people} depts={seed.depts} me={who.name} />
  ) : null;

  // The conversation without the first message - that is the idea, shown in the Idea view.
  const advice = reading ? adviceFromReading(reading, locale) : adviceOf(story && scriptAt >= 1 ? scriptOverall(scriptAt - 1) : overall, threshold, team || t("ideas.pageYourTeam"), locale);
  // Under the latest reply: the five dials as bars and words (the numbers stay in the full analysis), and the
  // point still unclear. Under an earlier one: what it asked, ticked once that is clear.
  // What the latest answer moved: the conversation read up to it, against the one up to the answer before.
  const lastSaid = turns.map((t) => t.role).lastIndexOf("user");
  const scoreAt = (ts: typeof turns, aff: readonly string[], att: number) => benchmark({ text: ideaFromTurns(ts).text, affected: aff, attachments: att }, benchCtx, locale);
  const readAt = (n: number) => dialsOf(scoreAt(turns.slice(0, n), affected, myFiles.length).parts, locale);
  // In the demo script each answer moves a prepared one to three dials (SCRIPT_MOVES), so the card never says nothing changed.
  // Against the reading before it, also when the rules answered in between: dials on the two scales do not compare.
  const aiReads = turns.flatMap((x) => (x.role === "assistant" && x.reading ? [x.reading] : []));
  const readBefore = aiReads.length >= 2 ? aiReads[aiReads.length - 2] : null, readNow = aiReads[aiReads.length - 1] ?? null;
  const moved = lastSaid <= firstIdx ? {} : reading ? (readBefore && readNow ? dialsMoved(dialsFromReading(readBefore, locale), dialsFromReading(readNow, locale)) : {})
    : scriptAt >= 2 && SCRIPT_MOVES[scriptAt - 1] ? SCRIPT_MOVES[scriptAt - 1] : dialsMoved(readAt(lastSaid), readAt(lastSaid + 1));
  const scripted0 = (d: Dial[], answers: number) => (story && scriptAt >= 1 ? scriptDials(answers, d) : d); // the demo script reads the five checks its own way
  const byAi = !!reading || !!script; // the demo script reads as the AI does; a live page without a model says it does not
  const liveDials = reading ? dialsFromReading(reading, locale) : scripted0(dialsOf(parts, locale), scriptAt - 1);
  const read: Read = { dials: liveDials, moved, open: published ? [] : unclear, byAi, firstRead: !!reading && !readBefore };
  const ideaChanged = t("ideas.pageIdeaChanged");
  const msgs: ChatMsg[] = turns.flatMap((turn, i): ChatMsg[] => {
    if (i === firstIdx) return [];
    if (turn.role === "user") { const u = splitUpdate(turn.text); return [{ id: turn.id, role: "user", text: u.said, note: u.updated ? ideaChanged : null }]; }
    const isLast = turn.id === lastAi && !sending;
    return [{
      id: turn.id, role: "ai", text: stripTags(turn.text),
      note: i === firstIdx + 1 ? t("ideas.pageTitleAdded") : null,
      read: turn.id === lastAi ? read : undefined, // stays while the next reply is on its way, so the page does not jump
      // The reading words its questions anew each turn, and the rules ask their own: a point no longer on the list
      // may be answered or only worded differently, so it stays as it was asked, without a tick.
      asked: turn.id === lastAi ? undefined : (asked[turn.id] ?? []).flatMap((id): PastTopic[] => {
        const g = gaps.filter((x) => x.id === id);
        return g.length || script ? g : [{ id, label: topicLabel(id, locale), ask: id, status: "open", settled: true }];
      }),
      publish: isLast && !published && canFinalize,
    }];
  });
  if (sending) {
    if (turns.length) { const u = splitUpdate(sending.text); msgs.push({ id: "sending", role: "user", text: u.said, note: u.updated ? ideaChanged : null }); }
    if (sending.reply) msgs.push({ id: "reply", role: "ai", text: stripTags(sending.reply) });
  }
  // On top: the idea as it was asked - its title, what was written under it, and its details (the start
  // page's receiver, colleague and meeting lines, who it affects, the files).
  const firstText = firstIdx >= 0 ? turns[firstIdx].text : sending && !turns.length ? sending.text : null;
  if (firstText) {
    const { description, context } = splitIdea(stripTags(firstText));
    const details: { key: string; value: string }[] = affected.length ? [{ key: t("ideas.pageDetailAffected"), value: affected.join(", ") }] : [];
    const body = context.split("\n").filter((line) => !isExtraLine(line)).join("\n").trim();
    myFiles.forEach((f) => details.push({ key: t("ideas.pageDetailFile"), value: f.name }));
    msgs.unshift({ id: "idea", role: "user", text: description, idea: { body, details } });
  }
  if (published) msgs.push({ id: "published", role: "ai", text: t("ideas.pagePublishedMsg", { lead }),
    link: draft?.caseId ? { label: t("ideas.pageOpenCase"), href: href("/cases/" + draft.caseId) } : undefined });
  // "Ask this now" on the rail: the coach asks that step straight away, and the rail shows it as the one
  // being asked, until the answer is sent.
  const asking = !sending && !published && ask ? gaps.find((g) => g.ask === ask) ?? null : null;
  if (asking) msgs.push({ id: "ask:" + asking.id, role: "ai", text: repeatsAsk(asking) ? asking.ask : t(asking.status === "unknown" ? "ideas.pageBackTo" : "ideas.pageJumpTo", { topic: locale === DEFAULT_LOCALE ? asking.label.toLowerCase() : asking.label, ask: asking.ask }) });
  const railGaps: Topic[] = asking ? gaps.map((g) => ({ ...g, status: g.id === asking.id ? "active" : g.status === "active" ? "open" : g.status })) : gaps;

  const card: DraftCard | null = stage === "chat" && draft ? {
    title: draft.title || idea.title, published, canPublish: canFinalize,
    pubHint: published ? t("ideas.pagePubHintPublished", { lead }) : t("ideas.pagePubHint", { lead }),
    onPublish: openLook, working: pubStep && !("desks" in pubStep) ? pubStep : null, onRename: (title) => void studio.save({ title }),
    hasIdea: firstIdx >= 0, ideaOn: shownView === "idea", ideaEdited: !!edit, onIdea: () => { setMenu(null); go(shownView === "idea" ? "chat" : "idea"); },
    aiOn: shownView === "analysis", analysed: turns.length > 0, onAI: () => go(shownView === "analysis" ? "chat" : "analysis"),
    acts: chips, files: fileChips,
    saveLabel: published ? t("ideas.pageSavedPublished", { time: clockLabel(draft.updatedAt) }) : draft.updatedAt ? t("ideas.pageSavedAt", { time: clockLabel(draft.updatedAt) }) : t("ideas.pageSaveAsDraft"), saved: !!draft.updatedAt,
    onSave: () => { void studio.save({}).then((ok) => showToast(t(ok ? "ideas.pageToastDraftSaved" : "ideas.pageToastSaveFailed"))); },
    discardLabel: published ? t("ideas.pageRemoveFromList") : t("ideas.pageDiscardDraft"),
    onDiscard: () => { void studio.discard().then(() => { toStart(); nav({ idea: null }, "replace"); }); showToast(t(published ? "ideas.pageToastRemoved" : "ideas.pageToastDiscarded")); },
    menu: menuFor("card"),
  } : null;

  const needle = query.trim().toLowerCase();
  const rows: IdeaRow[] = studio.drafts
    .filter((d) => !needle || (d.title || t("ideas.pageUntitled")).toLowerCase().includes(needle))
    .map((d) => {
      const current = stage === "chat" && d.id === draft?.id;
      const last = current ? turns[turns.length - 1] : undefined;
      return {
        id: d.id, title: d.title, when: whenLabel(d.updatedAt, now, locale), group: whenGroup(d.updatedAt, now), current, pinned: preview.pinned.includes(d.id), published: d.status === "published",
        preview: last ? stripTags(last.text) : d.status === "published" ? t("ideas.pageRowPublished") : t("ideas.pageRowContinue"),
      };
    })
    // The Demo data switch: the sample cases this person raised. They have no draft behind them, so a click opens the case.
    .concat(!sampleData ? [] : mineOf(S, me).filter((c) => isSampleId(c.id) && (!needle || c.title.toLowerCase().includes(needle))).map((c) => ({
      id: c.id, title: c.title, when: f(c.raisedDay), group: dayGroup(S.day - c.raisedDay), current: false, pinned: false, published: true, preview: t("ideas.pageRowPublished"),
    })));

  const composerChat = (
    <div className={s.dock}>
      <div className={s.editedWrap}>
        {edit && (
          <div className={s.edited}>
            <div className={s.editedRow}>
              <Icon name="pencil" size={10.5} stroke="var(--nh-brand-ink)" width={2} />
              <span className={s.editedText}><b>{t("ideas.pageIdeaEdited")}</b> · {t("ideas.pageIdeaEditedNote")}</span>
              <button type="button" className={s.undo} onClick={() => draft && preview.edit(draft.id, null)}>{t("ideas.pageUndo")}</button>
            </div>
          </div>
        )}
      </div>
      <div className={s.dockBar}>
        <RaiseComposer value={text} onChange={setText} onSubmit={send} fieldRef={chatField} sendLabel={t("ideas.pageSend")}
          placeholder={ask ?? t(published ? "ideas.pageFollowUp" : turns.length ? "ideas.pageAnswer" : "ideas.pageDescribe")}
          canSend={!!text.trim() && !sending} chips={[]} strip={false}
          actions={<RaiseActions rows={actionsOf(extras, myFiles.length, affected.length)} open={menu?.at === "add" ? menu.view : null}
            onOpen={(v) => setMenu((m) => (m?.at === "add" && m.view === v ? null : { at: "add", view: v }))} menu={menuFor("add")} onAddFiles={addFiles} />}
          onUnsupported={() => showToast(t("ideas.pageToastNoDictation"))} />
      </div>
    </div>
  );

  // ── Analysis ────────────────────────────────────────────────────────────────────────────────
  const reviewers: Reviewer[] = ev ? [
    // The first desk, and why it is that one: no team lead known sends it to the route's desk, or to triage.
    ((name: string) => ({ initials: initials(name), name, role: t("ideas.pageRoleReceives"),
      why: ev.leadIs === "route" ? t("ideas.pageWhyRouteDesk", { route: ev.route?.type ?? t("ideas.pageThisArea") })
        : ev.leadIs === "triage" ? t("ideas.pageWhyTriage")
        : team ? t("ideas.pageWhyLeadTeam", { team }) : t("ideas.pageWhyLead") }))(ev.leadIs === "triage" ? t("ideas.pageTriageDesk") : ev.lead),
    ...(ev.passesTo && ev.passesTo !== ev.lead ? [{ initials: initials(ev.passesTo), name: ev.passesTo, role: t("ideas.pageRoleInformed"), why: t("ideas.pageWhyPasses", { route: ev.route?.type ?? t("ideas.pageThisArea") }) }] : []),
  ] : [];
  const openCases = S.cases.filter((c) => c.open).length;
  const sources: Source[] = [
    { name: t("ideas.pageSrcGoals"), where: t("ideas.pageSrcGoalsWhere", { n: seed.goals.length }), ext: "DOC" },
    { name: t("ideas.pageSrcRouting"), where: t("ideas.pageSrcRoutingWhere", { n: seed.routes.length }), ext: "DOC" },
    { name: t("ideas.pageSrcCases"), where: t("ideas.pageSrcCasesWhere", { n: openCases }), ext: "IDEA" },
    // What the dials' "Checked across the company" lines read (features/ideas/company-read.ts), where the company has it.
    ...([
      [t("ideas.pageSrcOrg"), seed.depts.reduce((n, d) => n + d.people, 0), t("ideas.pageSrcOrgWhere", { n: seed.depts.reduce((n, d) => n + d.people, 0), depts: seed.depts.length }), "DOC"],
      [t("ideas.pageSrcProblems"), seed.problems.length, t("ideas.pageSrcProblemsWhere", { n: seed.problems.length }), "DATA"],
      [t("ideas.pageSrcInitiatives"), seed.initiatives.length, t("ideas.pageSrcInitiativesWhere", { n: seed.initiatives.length }), "IDEA"],
      [t("ideas.pageSrcOutcomes"), seed.outcomes.length, t("ideas.pageSrcOutcomesWhere", { n: seed.outcomes.length }), "DATA"],
    ] as const).filter(([, n]) => n > 0).map(([name, , where, ext]) => ({ name, where, ext })),
    ...(myFiles.length ? [{ name: t("ideas.pageSrcEvidence"), where: t("ideas.pageSrcFiles", { count: myFiles.length }), ext: "DATA" as const }] : []),
  ];
  const inCase = (id: string) => S.cases.some((c) => c.id === id);
  const simsOf = (r: typeof reading): Similar[] => r ? (r.similar.length
    ? r.similar.map((m) => ({ title: m.title, status: SIM_STATUS[m.status] ? t(SIM_STATUS[m.status]) : m.status || t("ideas.pageSimOpen"), where: t(m.same ? "ideas.pageSimSame" : "ideas.pageSimRelated"), href: inCase(m.id) ? href("/cases/" + m.id) : null }))
    : [{ title: t("ideas.pageSimNone"), status: "–", where: t("ideas.pageSimChecked", { n: r.checked }), href: null }])
    : similar
    ? [{ title: similar.title, status: t("ideas.pageSimOpen"), where: t("ideas.pageSimRaisedBy"), by: similar.from, href: href("/cases/" + similar.id) }]
    : [{ title: t("ideas.pageSimNone"), status: "–", where: t("ideas.pageSimSearched", { n: openCases }), href: null }];
  const sims = simsOf(reading);
  const cats = [...new Set([ev?.route?.type, affected[0] ?? t("ideas.pageCatGeneral"), t("ideas.pageCatIdea")].filter((x): x is string => !!x))];
  const rulesPattern = affected.length > 1 ? t("ideas.pagePatternWide", { teams: affected.join(", ") }) : t("ideas.pagePatternAlone");
  const pattern = reading?.pattern ?? rulesPattern;
  // The keyword lookups under each dial: the reading's own notes replace them.
  const noLookups = { value: [], feas: [], cost: [], fit: [], risk: [] };
  const lookups = () => companyRead({
    text: idea.text, lead: ev?.lead ?? lead, myDept: who.line.split(",")[0].trim(), affected, people: seed.people, depts: seed.depts,
    routes: seed.routes, goals: seed.goals, problems: seed.problems, ideas: seed.ideas, initiatives: seed.initiatives, outcomes: seed.outcomes,
    cases: S.cases, promiseDays: seed.promiseDays, spendLimitEur: seed.spend?.limitEur ?? null,
  }, locale);
  const company = reading ? noLookups : lookups();
  const summaryOf = (text: string) => ((x) => (x.length > 320 ? x.slice(0, 320).replace(/\s+\S*$/, "") + "…" : x))(text.replace(/\s+/g, " ").trim()) || t("ideas.pageNothingToSummarise");
  const analysis: AnalysisData = { dials: liveDials, company, summary: reading?.summary ?? summaryOf(idea.text || ""), advice, pattern, cats, similar: sims, reviewers, sources, byAi };
  // NextUp's first reply stands under the full analysis: as the idea reads now while that reply is the latest,
  // after that as its first message was read - the scores it was answered with, not today's.
  const firstAi = turns[firstIdx + 1]?.role === "assistant" ? turns[firstIdx + 1].id : null;
  const firstReading = firstAi ? turns[firstIdx + 1].reading ?? null : null;
  // Whichever answered that first reply says so, whatever answers now: the rules' words never stand over the model's, or the other way round.
  const firstRead: AnalysisData = !firstAi || firstAi === lastAi ? analysis : firstReading
    ? { ...analysis, dials: dialsFromReading(firstReading, locale), advice: adviceFromReading(firstReading, locale), summary: firstReading.summary, pattern: firstReading.pattern, company: noLookups, similar: simsOf(firstReading), byAi: true }
    : (() => {
    const b = scoreAt(turns.slice(0, firstIdx + 1), affected, myFiles.length);
    return { ...analysis, dials: scripted0(dialsOf(b.parts, locale), 0), advice: adviceOf(story ? scriptOverall(0) : b.overall, threshold, team || t("ideas.pageYourTeam"), locale), summary: summaryOf(ideaFromTurns(turns.slice(0, firstIdx + 1)).text), pattern: rulesPattern, company: reading ? lookups() : company, similar: simsOf(null), byAi: !!script };
  })();
  // The first feedback marks the checks that came out better than the idea as written (before its affected people and
  // files counted): at most three. The demo script shows none: its first look is the low one.
  const improved: DialKey[] = !firstAi || story || (firstAi === lastAi ? reading : firstReading) ? [] : (() => {
    const asWritten = dialsOf(scoreAt(turns.slice(0, firstIdx + 1), [], 0).parts, locale);
    return firstRead.dials.filter((d) => d.scored).map((d) => ({ key: d.key, gain: d.value - (asWritten.find((b) => b.key === d.key)?.value ?? d.value) }))
      .filter((x) => x.gain > 0).sort((a, b) => b.gain - a.gain).slice(0, 3).map((x) => x.key);
  })();
  const thread = msgs.map((m) => (m.id === firstAi ? { ...m, full: { ...firstRead, improved } } : m));

  const dials = analysis.dials;
  // The idea as one document: no page of its own any more, it travels with the case (saveRaised in publish).
  const finalDoc = ideaDoc({
    title: mine?.title.trim() || draft?.title || idea.title, author: who.name, team: team || "", receiver: lead,
    date: formatDate(locale, now, "full"),
    advice, overall: reading || parts.some((p) => p.value > 0) ? Math.round(overall) : null,
    description: mine ? mine.description : shown.description,
    context: mine ? [mine.context.trim(), ...mine.prompts.filter((x) => x.label.trim() && x.text.trim()).map((x) => x.label.trim() + ": " + x.text.trim())].filter(Boolean).join("\n") : shown.context, dials,
    company, pattern,
    openTopics: gaps.filter((g) => g.status !== "clear").map((g) => (repeatsAsk(g) ? g.ask : g.label + (g.ask ? ": " + g.ask : ""))),
    similar: sims.filter((m) => m.href).map((m) => ({ title: m.title, status: m.status, by: m.by ?? "" })),
    sources: sources.map((x) => ({ name: x.name, where: x.where })), turns,
  }, locale);

  // The export view (RaiseExport.tsx, from the last look's "Export"): what the author wrote and chose,
  // and NextUp's assessment for when they switch it in.
  const outLook = mine ?? shownLook;
  const exportIdea: ExportIdea = {
    kind: "idea", title: outLook?.title ?? draft?.title ?? idea.title, summary: outLook?.description ?? shown.description, context: outLook?.context ?? shown.context ?? "",
    affected, prompts: outLook?.prompts ?? [], author: who.name, receiver: lead,
    meta: [who.name, affected[0] ?? team, formatDate(locale, now, "full")].filter(Boolean).join(" · "),
  };
  const exportAnalysis: ExportAnalysis = {
    rec: advice.name, why: advice.why, overall: Math.round(overall),
    scores: dials.map((x) => ({ label: x.label, val: x.scored ? String(x.value) : "–" })),
  };

  const main = stage === "start" ? (
    <RaiseStart name={greetName(who.name)}
      composer={
        <>
        {follows && <p className={s.follows} data-testid="raise-follows">{t("caseSee.followsUp", { title: follows.title })}</p>}
        <RaiseComposer value={startText} onChange={setStartText} onSubmit={startRaise} fieldRef={startField} sendLabel={t("ideas.pageAskNextUp")}
          placeholder={t("ideas.pageSharePlaceholder")} canSend={startText.trim().length >= 3 && !evaluating}
          chips={[...chips, ...fileChips]} strip
          menuOpen={menu?.at === "start"} onMenu={() => toggleMenu("start")} menu={menuFor("start")}
          body={<PromptBody segs={segs} onSegs={setSegs} caretRef={caretRef} focus={bodyFocus} onFocus={setBodyFocus} headRef={startField} />}
          tray={<PromptTray onAdd={(p) => { const r = insertBlock(segs, caretRef.current, p); setSegs(r.segs); setBodyFocus({ seg: r.at, on: p.custom ? "label" : "text" }); }} />}
          onUnsupported={() => showToast(t("ideas.pageToastNoDictation"))} />
        </>
      } />
  ) : shownView === "idea" ? (
    <IdeaSheet key={draft?.id ?? "none"} initial={ideaLook} card={cardProps} locked={published} onChange={editLook}
      onTitle={(t) => { if (t.trim() && t.trim() !== draft?.title) void studio.save({ title: t.trim() }); }} onClose={() => go("chat")} />
  ) : shownView === "export" && draft ? (
    <RaiseExport idea={exportIdea} analysis={exportAnalysis} byAi={byAi} onBack={() => go("preview")} onClose={() => go("chat")} />
  ) : shownView === "analysis" ? (
    <AnalysisSheet ready={turns.length > 0} onClose={() => go("chat")} {...analysis} />
  ) : (
    <RaiseChat msgs={thread} typing={!!sending && !sending.reply} slowNote={script ? null : t(sending?.step === "coaching" ? "ideas.chatSlowCoach" : "ideas.chatSlow")} error={studio.error}
      thinking={evaluating && studio.evalRun && firstText ? { run: studio.evalRun, sub: t("ideas.pageWordsFrom", { n: (firstText.match(/\S+/g) || []).length, who: who.handle ?? who.name, line: who.line }) } : null}
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
          onPick={(id) => { if (isSampleId(id)) router.push(href("/cases/" + id)); else openDraft(id); }} onPin={preview.togglePin} onNew={newIdea} />
      </div>
      <button type="button" className={s.scrim} onClick={() => setSb("hidden")} aria-label={t("ideas.pageCloseSidebar")} />
      {pubStep && "desks" in pubStep && (
        <DeskDialog desks={pubStep.desks} aiOff={pubStep.aiOff} search={(q) => otherDesks(seed.routes, seed.seats, q, locale).map(withAnswer)} work={pubWork} sent={sent} casesHref={href("/team")}
          onCancel={() => { setPubStep(null); setSent(null); }} onConfirm={(to) => void publish(to)} />
      )}
      {prepping && <PreviewLoading />}
      {looking && shownLook && draft && !published && (
        <PublishPreview look={shownLook} onLook={setLook} stillOpen={stillOpen}
          affected={affected} depts={seed.depts.map((d) => d.name)} onAffected={setAffected}
          files={myFiles} onAddFiles={addFiles} onRemoveFile={removeFile}
          aiLine={t("ideas.pageAiLine", { n: sources.length })}
          onClose={() => go("chat")} onConfirm={confirmLook}
          onExport={() => { if (!mine && shownLook) setLook(shownLook); go("export"); }}
          posting={choosesPosting({ role, name: who.name, handle: who.handle ?? null }) && who.handle ? { handle: who.handle, name: who.name, asName: postsByName, onChange: setAsName } : undefined} />
      )}
      <div className={s.main}>
        <div className={s.showSb}><button type="button" className={s.iconBtn} onClick={() => setSb("open")} title={t("ideas.pageShowSidebar")} aria-label={t("ideas.pageShowSidebar")}><Icon name="sidebar" size={12} /></button></div>
        {main}
      </div>
    </div>
    </RaisePeople.Provider>
  );
}

