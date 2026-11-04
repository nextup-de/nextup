"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { useDemo } from "@/components/dashboard/DemoProvider";
import { profileOf } from "@/features/demo/profiles";
import { personHref } from "@/features/people/links";
import styles from "./ProfileView.module.css";
import { M365Card } from "./M365Card";
import { NotifySettings } from "./NotifySettings";
import type { M365Card as M365CardData } from "@/server/m365-profile";
import { Banner, DeptChip, PageHeader, PersonFace, SectionCard } from "@/components/ui/elements";
import { setLocale } from "@/i18n/actions";
import { useLocale, useT } from "@/i18n/client";
import { LOCALES, type Locale, type MessageKey } from "@/i18n";

type WorkKind = "ideaRaised" | "problemRaised" | "collaboration" | "idea";
const WORK_LABEL: Record<WorkKind, MessageKey> = {
  ideaRaised: "profile.typeIdeaRaised",
  problemRaised: "profile.typeProblemRaised",
  collaboration: "profile.typeCollaboration",
  idea: "profile.typeIdea",
};
const CASE_STATUS: Record<string, MessageKey> = {
  open: "profile.statusWaiting",
  discussion: "profile.statusDiscussion",
  decided: "profile.statusDecided",
  asked: "profile.statusAsked",
  building: "profile.statusBuilding",
  shipped: "profile.statusShipped",
};
// Each language is named in its own language, so these are never translated.
const LANGUAGE_KEY: Record<Locale, MessageKey> = { de: "profile.languageGerman", en: "profile.languageEnglish" };

export function ProfileView({ m365, mailPrefs }: { m365?: M365CardData | null; mailPrefs?: { template: string; on: boolean }[] | null }) {
  const ctx = useDemo();
  const t = useT();
  const { D, seed, persona, tenant, href } = ctx;
  const name = persona.who.name;
  const org = seed.people.find((p) => p.name === name);
  const role = org?.role ?? persona.role.label;
  const deptId = org?.dept ?? persona.role.dept;
  const dept = seed.depts.find((d) => d.id === deptId)?.name ?? deptId;
  const email = ctx.email ?? (tenant.demoTools ? profileOf(name).email : null);
  const location = tenant.demoTools ? profileOf(name).location : null;
  const anonymous = ctx.actor !== name;

  // A public profile only shows attributed work. Anonymous submissions never get joined to a person.
  const ideas = D.ideas.filter((i) => i.proposedBy.split(",")[0].trim() === name || i.team.includes(name));
  const initiatives = D.initiatives.filter((i) => i.members.some((m) => m.name === name));
  const cases = D.cases.filter((c) => ctx.actorUserId !== null && c.fromUserId === ctx.actorUserId);
  const ideaCount = ideas.length + cases.filter((c) => c.kind === "idea" && !c.linkedIdea).length;
  const manager = org?.reportsTo && org.reportsTo !== name ? seed.people.find((p) => p.name === org.reportsTo) : null;
  // A colleague is listed only when their seat belongs to a user with a person page (personLinks).
  const linkOf = (personName: string) => { const userId = seed.seats.find((s) => s.label === personName)?.userId; return userId ? personHref(tenant, userId) : null; };
  const colleagues = seed.people.filter((p) => p.name !== name && p.name !== manager?.name && p.dept === deptId && linkOf(p.name)).slice(0, 4);
  const work = [
    ...(cases.map((c) => ({ id: c.id, title: c.title, type: (c.kind === "idea" ? "ideaRaised" : "problemRaised") as WorkKind, status: CASE_STATUS[c.status] ? t(CASE_STATUS[c.status]) : c.status[0].toUpperCase() + c.status.slice(1), href: href("/cases/" + encodeURIComponent(c.id)) }))),
    ...initiatives.map((i) => ({ id: i.id, title: i.name, type: "collaboration" as WorkKind, status: i.status, href: href("/collaboration?id=" + encodeURIComponent(i.id)) })),
    ...ideas.map((i) => ({ id: i.id, title: i.title, type: "idea" as WorkKind, status: i.status, href: href("/ideas?id=" + encodeURIComponent(i.id)) })),
  ].slice(0, 6);

  return <div className={styles.page}>
    <Link href={href("/overview")} className={styles.back}>{t("profile.backOverview")}</Link>
    <PageHeader title={t("profile.myProfile")} action={<span className={styles.company}>{tenant.name}</span>} />

    <SectionCard name="identity">
      <section className={styles.identity} aria-labelledby="profile-name">
        <span className={styles.heroFace}><PersonFace name={name} /></span>
        <div className={styles.identityText}>
          <div className={styles.nameLine}><h2 id="profile-name">{name}</h2><span className={styles.you}>{t("profile.you")}</span></div>
          <p>{role}{dept ? <> · <DeptChip name={dept} /></> : null}</p>
          <span className={styles.affiliation}>{[location, tenant.name].filter(Boolean).join(" · ")}</span>
        </div>
        <Link className={styles.contact} href={href(ctx.role === "member" ? "/team" : "/leader")}>{ctx.role === "member" ? t("profile.myCases") : t("profile.openInbox")}<span aria-hidden="true">→</span></Link>
      </section>
    </SectionCard>

    <section className={styles.stats} aria-label={t("profile.statsLabel")}><div><strong>{cases.length}</strong><span>{t("profile.casesYouRaised")}</span></div><div><strong>{ideaCount}</strong><span>{t("profile.ideas")}</span></div><div><strong>{initiatives.length}</strong><span>{t("profile.collaborations")}</span></div></section>

    <div className={styles.columns}>
      <div className={styles.mainColumn}>
        {anonymous && <section className={styles.privacy}><Banner tone="info"><span><strong>{t("profile.howSeen")}</strong> {t("profile.seenAs")} <strong>{ctx.actor}</strong>. {t("profile.seenHidden")}</span></Banner></section>}

        <SectionCard title={t("profile.yourWork")} name="work" action={<span className={styles.count}>{work.length}</span>}>
          {work.length ? <div className={styles.workList}>{work.map((item) => <Link className={styles.workItem} href={item.href} key={item.type + item.id}><span className={styles.workIcon}>{item.type === "problemRaised" ? "P" : item.type === "collaboration" ? "↗" : "✳"}</span><span className={styles.workText}><strong>{item.title}</strong><small>{t(WORK_LABEL[item.type])}</small></span><span className={styles.status}>{item.status}</span><span className={styles.arrow} aria-hidden="true">→</span></Link>)}</div> : <div className={styles.empty}>{t("profile.noWork")}</div>}
        </SectionCard>

        <Link href={href("/team")} className={styles.myCases}><span><strong>{t("profile.followSent")}</strong><small>{t("profile.followSentSub")}</small></span><span aria-hidden="true">→</span></Link>
      </div>

      <aside className={styles.sideColumn} aria-label={t("profile.detailsLabel")}>
        <SectionCard title={t("profile.details")} name="details"><dl className={styles.details}><div><dt>{t("profile.role")}</dt><dd>{role}</dd></div><div><dt>{t("profile.department")}</dt><dd>{dept ? <DeptChip name={dept} /> : t("profile.notSpecified")}</dd></div>{location && <div><dt>{t("profile.location")}</dt><dd>{location}</dd></div>}{email && <div><dt>{t("profile.email")}</dt><dd><a href={"mailto:" + email}>{email}</a></dd></div>}</dl></SectionCard>
        <LanguageSwitch />
        {m365 ? <M365Card card={m365} /> : null}
        {mailPrefs ? <NotifySettings slug={tenant.slug} prefs={mailPrefs} /> : null}
        {(manager || colleagues.length > 0) && <SectionCard title={t("profile.peopleNearby")} name="nearby"><div className={styles.people}>{manager && <PersonLink name={manager.name} subtitle={t("profile.reportsTo")} href={linkOf(manager.name)} />}{colleagues.map((p) => <PersonLink key={p.name} name={p.name} subtitle={p.role} href={linkOf(p.name)} />)}</div></SectionCard>}
      </aside>
    </div>
  </div>;
}

function PersonLink({ name, subtitle, href }: { name: string; subtitle: string; href: string | null }) {
  const { href: withPrefix } = useDemo();
  const body = <><PersonFace name={name} /><span><strong>{name}</strong><small>{subtitle}</small></span></>;
  return href ? <Link href={withPrefix(href)} className={styles.person}>{body}<span className={styles.arrow} aria-hidden="true">→</span></Link> : <div className={styles.person}>{body}</div>;
}

/** The language of the app for this person: a cookie (and the profile when signed in), then a refresh. */
function LanguageSwitch() {
  const t = useT();
  const locale = useLocale();
  const router = useRouter();
  const [error, setError] = useState<string | null>(null);
  const [pending, start] = useTransition();
  const choose = (next: Locale) => {
    if (next === locale) return;
    setError(null);
    start(async () => {
      const res = await setLocale(next);
      if (res.ok) router.refresh();
      else setError(res.error);
    });
  };
  return <section aria-label={t("profile.language")}>
    <SectionCard title={t("profile.language")} name="language">
      <div role="radiogroup" aria-label={t("profile.language")} className={styles.languages}>
        {LOCALES.map((l) => <button key={l} type="button" role="radio" lang={l} aria-checked={l === locale} disabled={pending} className={styles.segment} onClick={() => choose(l)}>{t(LANGUAGE_KEY[l])}</button>)}
      </div>
      {error ? <Banner tone="error">{error}</Banner> : null}
    </SectionCard>
  </section>;
}
