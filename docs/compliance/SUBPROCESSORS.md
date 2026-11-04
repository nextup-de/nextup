Updated 2026-11-04 · Draft for legal review, not legal advice.

# Sub-processors

Only what the code can send a company's data to. Each company runs its own stack, so hosting and mail depend on
how that stack is set up. Annex to `DPA_TEMPLATE.md`. Nothing is sent to an analytics or advertising service; the
app's content security policy allows the browser to talk to its own origin only (`connect-src 'self'`).

| Sub-processor | What it receives | When | Where |
|---|---|---|---|
| Hosting of the company's stack (server operator chosen with the customer; NextUp's reference setup is a Hetzner server, `docs/DEPLOY.md`) | Everything the stack holds: database, `.env`, backups on the host | Always, for a hosted stack. A customer who runs the stack on its own server has no hosting sub-processor of NextUp | Set per stack; name and country are filled in per customer |
| Off-box backup storage (`s3:` target in `RESTIC_REPOSITORY`) | Encrypted restic snapshots (database dump, `.env`, n8n data); the provider cannot read them without `RESTIC_PASSWORD` | Production stacks, `BACKUP_OFFBOX=required` | Set per stack |
| Mail relay configured per stack (`SMTP_URL`, `MAIL_FROM`) | Notification and invitation mails: recipient address, subject, text (for example a route owner told about a case, a login invitation, an export notice) | Only when `SMTP_URL` is set. Unset: nothing is sent, and a demo stack catches mail in `mailpit` inside the stack | Set per stack |
| `bedrock` (Claude on Amazon Bedrock, AWS) | Redacted question text and knowledge snippets for the assistant; text of a case for a routing proposal | **Only when the company chooses it**, the assistant or routing switch is on, and a DPA date (`dpaSignedAt`) is recorded. Default region `eu-central-1` (`LLM_REGION`) | AWS region of the choice |
| `azure-openai` | Same data as above, sent to the company's own Azure OpenAI endpoint through the brain | **Only when the company chooses it**, same gate | The company's endpoint |
| `openai-compatible` | Same data as above, sent to the endpoint the company enters | **Only when the company chooses it**, same gate | The company's endpoint |

How the gate works: `aiGate` in `apps/app/src/features/ai/gate.ts` fails closed. For a real company with any model
choice and no `dpaSignedAt`, nothing leaves the stack. The choice `off` and the `mock` provider send nothing. Data is
masked before it is sent (`docs/ASSISTANT.md`); this reduces risk and is not a guarantee.

## Not sub-processors

- The company's own integrations (Microsoft 365 and Entra at `graph.microsoft.com` and `login.microsoftonline.com`,
  Jira, Teams, SuccessFactors). The customer connects them with its own accounts and it is the customer's decision.
- NextUp's own platform at admin.sellux.ch: a stack can report bug reports and health to it when `OPS_URL` is set.

## Changes

NextUp tells the customer before it adds a sub-processor and the customer may object, as set out in `DPA_TEMPLATE.md`.
