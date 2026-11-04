Updated 2026-11-04 · Draft for legal review, not legal advice.

# VDA ISA self-assessment

A self-assessment by the developer against the chapters of the VDA ISA catalogue (information security, version 6).
It is not a TISAX assessment and no audit provider has reviewed it. Maturity uses the ISA scale: 0 incomplete,
1 performed, 2 managed, 3 established, 4 predictable, 5 optimizing. The scope is the NextUp software and the stack
it is delivered on, not the customer's organisation. Where the answer is below 3, the gap says what is missing.

| Chapter | Control area | Maturity | What exists | Gap |
|---|---|---|---|---|
| 1 IS policies and organisation | Security policy, roles, risk, incidents | 1 | `docs/SECURITY.md` records doors, locks and the open list; a head engineer reviews every change (`CLAUDE.md`) | No approved written policy, no risk register, no incident process beyond ad hoc |
| 2 Human resources | Staff screening, awareness, confidentiality | 1 | A small team; changes by pull request with a review | No screening, training or confidentiality procedure written down |
| 3 Physical security and business continuity | Premises, backups, restore | 2 | Nightly restic backups, off-box target for production, weekly restore test, RPO 24 h and RTO 1 h (`docs/ops/RPO_RTO.md`) | No physical security of its own (the host operator's), no high availability, no continuity plan beyond restore |
| 4 Identity and access management | Sign-in, roles, privileged access | 3 | Personal codes, TOTP for managers, Entra OIDC and SAML, role checks, no standing access for staff, break-glass window, customer-granted support access (`TOMS.md`) | Second factor missing for leaders and members using codes; the rate limiter is per process (G-225) |
| 5 IT security and cyber security | Cryptography, operations, logging, vulnerabilities, development | 2 | AES-256-GCM vault, key rotation scripts, strict headers, audit log with SIEM export, CI with `npm audit`, Trivy and a ZAP baseline | No disk encryption set up, no outside penetration test, no formal vulnerability process or patch window |
| 6 Supplier relationships | Sub-processors and hosting | 1 | A sub-processor list (`SUBPROCESSORS.md`); an AI provider is gated until a DPA date is recorded | No supplier review or contract set yet; hosting contract is per customer |
| 7 Compliance | Legal duties, data protection, audit | 2 | Export, pseudonymise, retention and audit (`docs/PRIVACY.md`); this compliance pack | Drafts under legal review; no processing register signed; no internal audit programme |

## Reading this honestly

- Nothing here claims a certificate. Prototype protection and the ISA data protection module are not assessed.
- Gaps already on the register: G-224 (disk encryption and rotation), G-225 (shared rate limiter), G-226 (penetration
  test), G-233 (customer guides), G-234 (TISAX assessment, 24/7 operations, high availability), in
  `docs/audit/gaps/platform.md`.
- A customer who needs a higher maturity in a chapter should ask for the plan, not assume it.
