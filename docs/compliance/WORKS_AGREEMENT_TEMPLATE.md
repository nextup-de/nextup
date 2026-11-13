Updated 2026-11-10 · Draft for legal review, not legal advice.

# Works agreement — template (BetrVG § 87(1) no. 6)

Between **[Employer]** and the works council of **[site]** on the introduction and use of NextUp. A starting
point for the parties; it holds only what the product does. Names, dates and signatures are theirs.

## 1. Purpose and scope

NextUp routes problems and ideas raised by employees to responsible roles and follows them to a decision. It is
not a tool for monitoring performance or behaviour. The agreement covers all employees of **[site]** who use it.

## 2. What the product does not do

- It shows **no person rankings and no person metrics.** Metrics are counts per unit or role. The code has no contributor
  ranking and no person page keyed by name (`apps/app/tests/unit/met/no-person-metrics.test.ts`).
- **Minimum of 5 people.** A unit or role with fewer than `MIN_GROUP` (5) active people shows "too few", and the next
  smaller sibling is hidden when needed so a hidden group cannot be found by subtraction.
- The assistant and the routing proposal **propose and never decide**. No decision about a person is taken by a model.
- Audit entries are not sorted or counted by person, and show no total when filtered to one person.

## 3. Data

The data categories are in `RECORD_OF_PROCESSING.md`. Raising can be anonymous: the author is shown to others by an anonymous
handle. The handle is only a label: every event still stores the author's user id (`actorUserId`), so the person stays linked to their ideas in the
database and finds them in their own privacy export. Before an idea goes out, the employee chooses for that idea whether it carries the handle or their name; the
handle is preselected. Nobody else can make this choice for them, and a choice for one idea does not name their other
ideas. Team leads and managers raise by name. **[If the employer wants the name preselected instead (Settings →
Rules), the parties agree it here. The employee can still choose the handle for every idea.]** The employer does not
use the data for personnel decisions, appraisals or discipline. **[Parties may widen this.]**

## 4. Access to the audit log

- Only company admins read the audit log (Settings → Audit log) and export it. **[The parties name the admins and whether the works council gets a read-only copy.]**
- The log lists changes made by admins, NextUp support and the system, never what employees wrote.
- Every export of the log is itself logged. If the employer sends the log to a SIEM (`syslog` receiver), the receiver is bound to this agreement.
- Entries are kept 24 months and then removed.
- NextUp support can enter a company only through a grant the employer's admin gives for a limited time, or a break-glass
  window the employer's operator opens; both are visible in the log.

## 5. Artificial intelligence

A model provider is called only if the employer chose one and recorded a DPA date; the works council is told which
(`SUBPROCESSORS.md`). Questions are masked before they leave the stack. During setup an admin may start a draft of the company profile: it searches the files that admin may open, sends masked file names and short snippets to the provider, and stores only what a person reviews and saves, which is then text that came from a file. It reads no mail or chats and assesses no person. **[Parties decide whether the assistant is switched on at all.]**

## 6. Rights of employees

Employees can ask the employer for an export of their data and for pseudonymisation after they leave
(`docs/PRIVACY.md`). Pseudonymising does not erase free text that was written.

## 7. Changes, review, duration

A new feature that adds a person metric, a ranking or a new data flow needs the works council's agreement first.
Review every **[12]** months. Term and termination: **[ ]**.

| Employer | Works council |
|---|---|
| Name, role, date, signature: **[ ]** | Name, role, date, signature: **[ ]** |
