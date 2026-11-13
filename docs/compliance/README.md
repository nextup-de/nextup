Updated 2026-11-04 · Draft for legal review, not legal advice.

# Compliance pack

Documents that a customer's legal, data protection and works council people can read and sign. They are written
from what runs on `main` for a non-demo company. Where the code does not do something a template usually
promises, the document says **not provided** or **planned for the pilot**. Nothing here is a legal claim beyond
the code, and nothing is signed: signatures, dates and party names are filled in by the parties. English only for now.

| File | What it is for | Who signs or approves |
|---|---|---|
| `DPA_TEMPLATE.md` | Data processing agreement under Art. 28 GDPR; the annexes point to `TOMS.md` and `SUBPROCESSORS.md` | The customer's legal signatory and NextUp |
| `TOMS.md` | Technical and organisational measures (Art. 32), each with its proof | NextUp states it; the customer's security owner reviews it |
| `RECORD_OF_PROCESSING.md` | Record of processing activities (Art. 30), NextUp as processor | NextUp keeps it; the customer copies what it needs into its own record |
| `DPIA.md` | Data protection impact assessment (Art. 35): routing, metrics, AI proposals, SSO and SCIM data, audit export | The customer's data protection officer decides; NextUp supplies the facts |
| `WORKS_AGREEMENT_TEMPLATE.md` | Works agreement for BetrVG § 87(1) no. 6 | Employer and works council |
| `AI_INFORMATION.md` | The information to employees about the AI (AI Act Art. 26(7) and 50), which the Agreements card on Go-live asks for while the AI is on. **Draft, Marc to review** | The employer hands it out; Marc reviews it before anyone does |
| `VDA_ISA_SELF_ASSESSMENT.md` | Self-assessment against the VDA ISA 6 chapters, with an honest maturity per control | NextUp's head engineer; a customer may ask for evidence |
| `SUBPROCESSORS.md` | Where data can be sent: hosting, mail relay, AI providers a company chooses | Listed in the DPA annex; the customer approves changes |

Sources: `docs/SECURITY.md`, `docs/PRIVACY.md`, `docs/IDENTITY.md`, `docs/ASSISTANT.md`, `docs/ops/RPO_RTO.md`.
Gaps answered: G-227 to G-232 of `docs/audit/gaps/platform.md`.

## Rules for these files

- A name in backticks (file, function, setting) exists on `main`. `apps/app/tests/unit/sec/compliance.test.ts` checks it.
- Every row of the TOMs table names a test file and a test title found in it, or says *organisational* with an owner.
- A feature the code supports only when a company chooses it is marked so.
- Not provided today: a certification (TISAX, ISO 27001), 24/7 operations, high availability, disk encryption set up
  by NextUp, an outside penetration test. These are said again where they matter.
