Updated 2026-11-11 · Draft for legal review, not legal advice.

# Data processing agreement (Art. 28 GDPR) — template

> Sections 4, 7, 9, 10 and annex 4 changed for block S (2026-11-11): draft for Marc.

Between **[Customer, address]** (the controller) and **[NextUp operator, address]** (the processor). Party names,
dates and signatures are filled in by the parties. This template says only what the product does today.

## 1. Subject, duration, nature and purpose

NextUp is software for routing problems and ideas raised by employees to the right role, and for following them to a
decision. The processor runs it for the controller on a stack of its own (`stack/`) and supports it. Duration: the
term of the main agreement. Nature: storing, displaying, routing, exporting and deleting the data below. Purpose:
the controller's internal improvement process.

## 2. Data and people

- **People:** the controller's employees and other members it adds; contact people.
- **Data:** name, work email, role, unit, optional initials, personnel number, an anonymous handle, sign-in data
  (login-code hash, second-factor secret sealed, Entra or SAML identifiers), the cases and ideas they write and the
  events on them, assistant questions in masked form, bug reports (with a screenshot unless the company switched it
  off), audit entries.
- No special categories are asked for. Free text can contain anything an employee types; the controller instructs
  its people accordingly.

## 3. Instructions

The processor acts on the controller's documented instructions: this agreement, the settings its admins make in the
product, and written requests. It tells the controller if it thinks an instruction breaches data protection law.

## 4. Confidentiality

People at the processor who can reach the data are bound to confidentiality. Access to a customer stack is not
standing. On the controller's own server the processor holds no stack secrets and break-glass is a window the
controller's operator opens (`stack/break-glass.sh`). On a server the processor hosts, the processor holds root and the
stack secrets, and opens break-glass only as annex 4 says. On both, support access is a time-limited grant the
controller's admin gives in the product and can end (`TOMS.md`, Access control).

## 5. Security (Art. 32)

The measures are in `TOMS.md` (Annex 2), with a proof for each. Measures marked *not provided* there are not part
of the processor's promise.

## 6. Sub-processors

The controller agrees to the sub-processors in `SUBPROCESSORS.md` (Annex 3) that apply to its stack. Those marked
*only when the company chooses it* are used only when the controller's admins switch them on, and an AI provider is
not called for real people before a DPA date is recorded. The processor informs the controller of an addition or
change before it applies; the controller may object within **[30]** days. The processor imposes the same duties on
a sub-processor in a written contract.

## 7. Rights of data subjects

The product lets a company admin export a company or one person as JSON (kept 7 days), pseudonymise a person who
has left, delete a person, and set retention rules (`docs/PRIVACY.md`). No admin deletes the company: at the end the
processor destroys the whole stack (section 10). The processor passes on any
request it receives. **Limits:** pseudonymising does not scrub free text an employee wrote or that others wrote
about them; case events are append-only and keep their ids; copies outside NextUp are not changed.

## 8. Assistance

The processor helps with the controller's duties under Art. 32 to 36 with the documents in this folder
(`DPIA.md`, `RECORD_OF_PROCESSING.md`) and the audit log, which company admins read and export.

## 9. Personal data breach

The processor tells the controller without undue delay, and at the latest within **72 hours** after it becomes aware
of a breach affecting the controller's data, with what it knows; it sends what it learns later as it learns it.
Contact at the controller: **[name, mail, phone]**. Not provided: a 24/7 on-call service.

## 10. Return and deletion

After the end date the stack stays up for **30 days** for the controller's company admins only, so they can export
its data; invitations and mails stop on the end date. On day 30 the processor destroys, on one day, the stack with
its database and volumes, its server, and the backup bucket with every snapshot, and removes its own access to the
stack (`docs/ops/CONTRACT_END.md`). Backups go with the bucket; none is kept. On the controller's own server the
controller's IT removes the stack, the server and the bucket and confirms this in writing. Within 5 working days of
day 30 the processor sends the controller's data protection officer a deletion statement that names each item, its
date and who deleted it, signed by the processor.

## 11. Audits

The controller may ask for the evidence named in `TOMS.md` and `VDA_ISA_SELF_ASSESSMENT.md` and for an audit on
reasonable notice. No certification (TISAX, ISO 27001) is held today.

## 12. Transfers

Data stays on the stack's host. A transfer to a third country can arise only through a sub-processor in
`SUBPROCESSORS.md` chosen for that stack, and the parties record the safeguard here: **[to be completed per stack]**.

## Annexes

1. Description of processing: sections 1 and 2 and `RECORD_OF_PROCESSING.md`.
2. Technical and organisational measures: `TOMS.md`.
3. Sub-processors: `SUBPROCESSORS.md`.
4. Break-glass on a server the processor hosts (below).

## Annex 4: break-glass on a server the processor hosts

> **Kevin decides; this is the recommendation** (Q8.7, Q10.9). It applies only where the processor hosts the server.

The processor opens a break-glass window into the admin console only:

- for a ticket: a written request from the controller's company admin or IT contact;
- with the ticket number as the recorded reason, for at most 4 hours;
- after telling the controller's IT contact before it opens;
- and it sends the controller's IT contact the log of the window (opened, closed, expired; never the code) afterwards.

| Controller | Processor |
|---|---|
| Name, role, date, signature: **[ ]** | Name, role, date, signature: **[ ]** |
