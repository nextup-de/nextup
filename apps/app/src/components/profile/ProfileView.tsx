"use client";

import Link from "next/link";
import { useDemo } from "@/components/dashboard/DemoProvider";
import { profileOf } from "@/features/demo/profiles";
import styles from "./ProfileView.module.css";
import { avatarTone } from "@/lib/avatar";

type Target = { name: string; role: string; dept: string; email: string | null };

const initials = (name: string) => name.split(/[.\s]+/).filter(Boolean).map((part) => part[0]).join("").slice(0, 2).toUpperCase();

export function ProfileView({ target }: { target?: Target }) {
  const ctx = useDemo();
  const { D, seed, persona, tenant, href } = ctx;
  const own = !target || target.name === persona.who.name;
  const name = own ? persona.who.name : target!.name;
  const org = seed.people.find((p) => p.name === name);
  const role = own ? (org?.role ?? persona.role.label) : target!.role;
  const deptId = own ? (org?.dept ?? persona.role.dept) : target!.dept;
  const dept = seed.depts.find((d) => d.id === deptId)?.name ?? deptId;
  const email = (own ? ctx.email : target!.email) ?? (tenant.demoTools ? profileOf(name).email : null);
  const location = tenant.demoTools ? profileOf(name).location : null;
  const anonymous = own && ctx.actor !== name;

  // A public profile only shows attributed work. Anonymous submissions never get joined to a person.
  const ideas = D.ideas.filter((i) => i.proposedBy.split(",")[0].trim() === name || i.team.includes(name));
  const initiatives = D.initiatives.filter((i) => i.members.some((m) => m.name === name));
  const cases = D.cases.filter((c) => c.from === name || (own && c.from === ctx.actor));
  const ideaCount = ideas.length + cases.filter((c) => c.kind === "idea" && !c.linkedIdea).length;
  const manager = org?.reportsTo && org.reportsTo !== name ? seed.people.find((p) => p.name === org.reportsTo) : null;
  const colleagues = seed.people.filter((p) => p.name !== name && p.name !== manager?.name && p.dept === deptId && !tenant.hiddenPeople?.includes(p.name)).slice(0, 4);
  const work = [
    ...(own ? cases.map((c) => ({ id: c.id, title: c.title, type: c.kind === "idea" ? "Idea raised" : "Problem raised", status: c.status === "open" ? "Waiting" : c.status[0].toUpperCase() + c.status.slice(1), href: href("/cases/" + encodeURIComponent(c.id)) })) : []),
    ...initiatives.map((i) => ({ id: i.id, title: i.name, type: "Collaboration", status: i.status, href: href("/collaboration?id=" + encodeURIComponent(i.id)) })),
    ...ideas.map((i) => ({ id: i.id, title: i.title, type: "Idea", status: i.status, href: href("/ideas?id=" + encodeURIComponent(i.id)) })),
  ].slice(0, 6);

  return <div className={styles.page}>
    <div className={styles.pageHead}><div><Link href={href("/dashboard")} className={styles.back}>← Dashboard</Link><h1>{own ? "My profile" : "Profile"}</h1></div><span className={styles.company}>{tenant.name}</span></div>

    <section className={styles.hero} aria-labelledby="profile-name">
      <div className={styles.identity}>
        <span className={styles.avatar} data-avatar={avatarTone(name)} aria-hidden="true">{initials(name)}</span>
        <div className={styles.identityText}><div className={styles.nameLine}><h2 id="profile-name">{name}</h2>{own && <span className={styles.you}>You</span>}</div><p>{role}{dept ? " · " + dept : ""}</p><span className={styles.affiliation}>{[location, tenant.name].filter(Boolean).join(" · ")}</span></div>
        {own ? <Link className={styles.contact} href={href(ctx.role === "member" ? "/team" : "/leader")}>{ctx.role === "member" ? "My cases" : "Open inbox"}<span aria-hidden="true">→</span></Link> : email && <a className={styles.contact} href={"mailto:" + email}>Email <span aria-hidden="true">↗</span></a>}
      </div>
    </section>

    <section className={styles.stats} aria-label="Contribution summary"><div><strong>{cases.length}</strong><span>{own ? "Cases you raised" : "Cases raised"}</span></div><div><strong>{ideaCount}</strong><span>Ideas</span></div><div><strong>{initiatives.length}</strong><span>Collaborations</span></div></section>

    <div className={styles.columns}>
      <div className={styles.mainColumn}>
        {own && anonymous && <section className={styles.privacy}><span className={styles.privacyIcon} aria-hidden="true">◎</span><div><h2>How people see you</h2><p>Your submissions appear as <strong>{ctx.actor}</strong>. Your name and role stay hidden on those posts.</p></div></section>}

        <section className={styles.card}><div className={styles.sectionHead}><h2>{own ? "Your work" : "Shared work"}</h2><span className={styles.count}>{work.length}</span></div>
          {work.length ? <div className={styles.workList}>{work.map((item) => <Link className={styles.workItem} href={item.href} key={item.type + item.id}><span className={styles.workIcon}>{item.type === "Problem raised" ? "P" : item.type.includes("Idea") ? "✳" : "↗"}</span><span className={styles.workText}><strong>{item.title}</strong><small>{item.type}</small></span><span className={styles.status}>{item.status}</span><span className={styles.arrow} aria-hidden="true">→</span></Link>)}</div> : <div className={styles.empty}>No shared work to show yet. Contributions will appear here as they happen.</div>}
        </section>

        {own && <Link href={href("/team")} className={styles.myCases}><span><strong>Follow what you sent</strong><small>See updates and answers to your cases</small></span><span aria-hidden="true">→</span></Link>}
      </div>

      <aside className={styles.sideColumn} aria-label="Profile details">
        <section className={styles.card}><div className={styles.sectionHead}><h2>Details</h2></div><dl className={styles.details}><div><dt>Role</dt><dd>{role}</dd></div><div><dt>Department</dt><dd>{dept || "Not specified"}</dd></div>{location && <div><dt>Location</dt><dd>{location}</dd></div>}{email && <div><dt>Email</dt><dd><a href={"mailto:" + email}>{email}</a></dd></div>}</dl></section>
        {(manager || colleagues.length > 0) && <section className={styles.card}><div className={styles.sectionHead}><h2>People nearby</h2></div>{manager && <PersonLink name={manager.name} subtitle="Reports to" href={href("/people/" + encodeURIComponent(manager.name))} />}{colleagues.map((p) => <PersonLink key={p.name} name={p.name} subtitle={p.role} href={href("/people/" + encodeURIComponent(p.name))} />)}</section>}
      </aside>
    </div>
  </div>;
}

function PersonLink({ name, subtitle, href }: { name: string; subtitle: string; href: string }) {
  return <Link href={href} className={styles.person}><span className={styles.personAvatar} data-avatar={avatarTone(name)}>{initials(name)}</span><span><strong>{name}</strong><small>{subtitle}</small></span><span className={styles.arrow} aria-hidden="true">→</span></Link>;
}
