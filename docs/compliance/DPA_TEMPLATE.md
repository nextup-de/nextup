Updated 2026-11-04 · Draft for legal review, not legal advice.

# Data processing agreement (Art. 28 GDPR) — template

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
standing: the processor holds no stack secrets, break-glass is a window the customer's operator opens (`stack/break-glass.sh`),
and support access is a time-limited grant the customer's admin gives in the product and can end (`TOMS.md`, Access control).

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
has left, delete a person or the company, and set retention rules (`docs/PRIVACY.md`). The processor passes on any
request it receives. **Limits:** pseudonymising does not scrub free text an employee wrote or that others wrote
about them; case events are append-only and keep their ids; copies outside NextUp are not changed.

## 8. Assistance

The processor helps with the controller's duties under Art. 32 to 36 with the documents in this folder
(`DPIA.md`, `RECORD_OF_PROCESSING.md`) and the audit log, which company admins read and export.

## 9. Personal data breach

The processor tells the controller without undue delay after it becomes aware of a breach affecting the controller's
data, with what it knows. **[Contact and time limit to be agreed.]** Not provided: a 24/7 on-call service.

## 10. Return and deletion

At the end the controller can export its data; the processor then deletes the company and its stack. Backups made
before are pruned by the restic retention of the stack and are not erased on the day (`docs/ops/RPO_RTO.md`).

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

| Controller | Processor |
|---|---|
| Name, role, date, signature: **[ ]** | Name, role, date, signature: **[ ]** |
