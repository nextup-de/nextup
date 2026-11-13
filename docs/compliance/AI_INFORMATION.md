Updated 2026-11-13 · Draft, Marc to review, not legal advice.

# Information to employees about the AI in NextUp

**Draft, Marc to review.** Nobody hands this out before Marc has reviewed it. It is the information the employer gives its employees and the works
council while the AI is switched on (AI Act Art. 26(7) and Art. 50). The Agreements card on Settings → Go-live records it as "Employees informed about the
AI" (`aiInfo`, `features/pilot/agreements.ts`) and asks for it exactly while the AI is on. The parties fill in the **[brackets]**; everything else
describes what the code does on `main`.

## 1. Whether the AI is on at **[Employer]**

The AI is off until the employer switches it on. A company that has chosen a model provider records the date of its data-processing agreement; until that
date is recorded no model is called for real people (`aiGate`, `features/ai/gate.ts`). The employer's admin can switch the assistant off at any time on
`/admin/assistant`. **[The employer states here which provider it chose and since when: Amazon Bedrock, Azure OpenAI, an OpenAI-compatible endpoint, or the
model on NextUp's own stack, which sends nothing out.]** `SUBPROCESSORS.md` lists who can receive data.

## 2. Where you meet it

- **The assistant on the raise page.** When you type a problem or an idea, NextUp answers from the company's own knowledge: who handles this, what
  already exists, which goal it touches. The answer comes with its sources. If it does not help, you raise the idea anyway.
- **A routing proposal.** NextUp proposes which desk should get your idea. A person decides: you pick the desk, and the proposal is kept next to it.
- **Reading and coaching in the idea studio.** NextUp reads your idea and asks what is missing. Its scores and hints are advice to you and to the desk.
- **Drafts for projects.** A planning draft on an idea, a check-in draft and, if the project's lead switches it on, the project agent's suggestions
  (a nudge, a weekly update, a plan). Nothing is sent, moved or changed because of a suggestion: a person accepts, edits or dismisses it.
- **A draft of the company profile** during setup, started by an admin and reviewed by a person before it is saved.

## 3. What it reads and what leaves the stack

- Names are replaced by roles, and email addresses, phone numbers, IBANs, card numbers, vehicle numbers, keys and passwords are masked before text
  goes to a model. This reduces risk and is not a guarantee: free text such as "the colleague who was off sick in May" can get through.
- A text the company marks above its classification ceiling is not sent at all.
- What was asked and answered is kept redacted, with the sources and counts of what was masked, for **[90]** days (the company's setting) and is then purged.
- Nothing is sent to an analytics or advertising service.

## 4. What it does not do

- It takes **no decision about a person**. It points to roles, proposes and never decides. A desk says yes or no, with its reason.
- It shows **no ranking and no score of a person**, and nothing counts what a person asked or wrote (`docs/ASSISTANT.md`, controls).
- It does not appraise performance or behaviour. **[The employer confirms here that it does not use the data for personnel decisions, appraisals or discipline, as the works agreement says.]**

## 5. Your options and your contacts

- You can raise anything without using the assistant: **Raise it anyway** needs no model.
- You can ask the employer for an export of your data and for pseudonymisation after you leave (`docs/PRIVACY.md`).
- Questions about the AI: **[role and contact at the employer]**. Questions to the works council: **[contact]**.
- Where this information was handed out, to whom and on what date is recorded on Go-live as a role and a date, never a name.
