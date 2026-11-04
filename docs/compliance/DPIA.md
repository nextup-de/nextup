Updated 2026-11-04 · Draft for legal review, not legal advice.

# Data protection impact assessment (Art. 35 GDPR)

Prepared by the processor from what the code does, for the controller's data protection officer, who decides
whether the risk is acceptable. Parts in **[brackets]** are the controller's to fill.

## 1. Processing

NextUp lets employees raise a problem or an idea; the case is routed to a role, decided, handed over or closed,
and metrics show how the process runs. The facts of the processing are in `RECORD_OF_PROCESSING.md`.

## 2. Necessity and proportion

Purpose: a faster, traceable improvement process. Data is limited to what a case needs: a person is identified by
user id, an anonymous raise keeps an anonymous handle, and display names are not used to decide who someone is
(`docs/IDENTITY.md`). **[The controller states why this is needed and why a less intrusive way is not enough.]**

## 3. Risks and what answers them

| Area | Risk to people | What the product does | Residual risk |
|---|---|---|---|
| Routing to roles | A case about a person reaches people who should not see it | Routes point to roles and seats, not names; `mayAppend` limits who can decide, hand over or ask; visibility rules per case | Free text can still name someone; a role holder sees what reaches the role |
| Metrics | Performance monitoring of employees | Aggregates only; a unit or role under `MIN_GROUP` (5) people is hidden and cannot be derived by subtraction; no contributor ranking and no person route keyed by name | Small organisations show few tiles; a manager who knows the team can still guess |
| AI proposals | A model decides about a person; data goes to a third party | The model proposes and never decides: the person's chosen route is never changed, and the keyword proposal takes over when the AI is off. `aiGate` keeps everything local until the company chooses a provider and records a DPA date. Names, contact data and secrets are masked before a request. The assistant is told to point to roles and not to judge people | Masking is pattern matching and misses context; a provider sees masked text |
| SSO and SCIM data | Over-collection from the directory; wrong deactivation | The Microsoft role claim sets the role; SCIM and SuccessFactors read an allow-list of fields and never return the personnel number; each change writes an `audit.directory` row with counts, not names | The directory's own data quality |
| Audit export | A log with personal data leaves the company | Entries hold the actor and the fields changed, no names, emails or secrets; the export is itself audited; the SIEM receiver is the customer's; 24 months | A receiver that is badly secured |
| Free text and exports | Data stays after a person leaves | Export, pseudonymise and delete exist (`docs/PRIVACY.md`); retention rules per company | Pseudonymising does not scrub authored text or copies outside NextUp |
| Operations | Loss or misuse of the data | See `TOMS.md`: sealed secrets, no standing staff access, break-glass window, support grant, backups | No 24/7 operations, no disk encryption set up by NextUp, no outside penetration test yet |

## 4. Consultation

Works council: `WORKS_AGREEMENT_TEMPLATE.md`. Data subjects: **[the controller's view]**. Authority consultation under
Art. 36 only if the controller finds a high residual risk: **[ ]**.

## 5. Outcome

| Decision | Date | By |
|---|---|---|
| **[Accepted / accepted with conditions / not accepted]** | **[ ]** | **[Data protection officer]** |
