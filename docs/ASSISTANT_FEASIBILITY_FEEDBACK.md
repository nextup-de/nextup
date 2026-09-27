# Raise page assistant: feasibility feedback

## Overall assessment

**Feasible, with moderate-to-high implementation complexity.** The proposed “ask first, raise it anyway” experience has a coherent product flow and a sensible separation of responsibilities: the app answers from company knowledge, while n8n handles imports and downstream actions. The mock provider and existing raise-flow fallback make a staged rollout practical.

This is a substantial feature rather than a small UI change. The work spans sensitive-data handling, classification enforcement, tenant isolation, streamed responses, audit and retention, knowledge ingestion, admin visibility, and end-to-end integration. The four-PR sequence is a reasonable way to reduce integration risk, but the estimate of roughly 300 lines per PR is likely optimistic given that breadth. A rough initial estimate is **2–4 weeks for one engineer**, excluding compliance review, AWS setup/access, and pilot feedback.

## Main feasibility findings

- **Architecture:** The app/provider/n8n split is practical. Keep the model call server-side, enforce company identity from the authenticated session, and make model-proposed tools read-only. The model should not be able to initiate an external action; an employee confirmation should remain the gate for raising a case or any later action.
- **Data residency:** An EU geographic Bedrock inference profile fits the stated “data stays in the EU” requirement, but requests can be processed in EU regions other than `eu-central-1`. If the actual requirement is Frankfurt-only, the model and endpoint must support single-region inference instead. AWS distinguishes geographic profiles from single-region inference in its [cross-region inference documentation](https://docs.aws.amazon.com/bedrock/latest/userguide/cross-region-inference.html).
- **Sensitive data:** Regexes and seeded-name replacement are useful safeguards but cannot guarantee detection of all personal data, secrets, or identifying context. The chosen fail-closed behavior should mask known patterns and block flagged or ambiguous text before any model call. Treat this as risk reduction, not a proof that sensitive content can never pass through. If an absolute guarantee is required, the assistant must not process free text until an approved detection/review control can establish that guarantee.
- **Bedrock retention and model access:** Confirm the target account’s model availability, exact inference-profile ID, and retention settings before pilot use. AWS documents region-scoped retention behavior and model-specific requirements in its [data retention documentation](https://docs.aws.amazon.com/bedrock/latest/userguide/data-retention.html). “Bedrock” by itself should not be treated as proof of a particular retention configuration.
- **TISAX and privacy review:** The proposed controls can support a customer’s security/compliance review, but using Bedrock does not itself establish TISAX alignment. Validate the processing purpose, data categories, access, retention, sub-processors, and incident/audit expectations with the responsible compliance owner before enabling real employee traffic.
- **Knowledge quality:** Full-text search is a viable first version and avoids the extra operational work of embeddings. The main risk is answer quality and freshness, so source attribution, “I don’t know” behavior, classification filtering, and import idempotency are key acceptance criteria.
- **Project verification:** The available workspace currently contains only an `ops/n8n` directory and no Git repository, application source, or referenced integration docs. The implementation paths and reuse claims in the proposal therefore could not be independently verified here. Reconcile them with the active checkout before implementation decisions are treated as confirmed.

## Recommended execution and gates

1. **Confirm the real checkout and contracts.** Verify the active Next.js/Prisma app, company/session authorization helpers, raise payload, knowledge feature, stage policy, throttle mechanism, and n8n credential/scope conventions. Update paths and reuse points in the proposal to match what exists.
2. **Build the pure assistant core first.** Add deterministic classification, redaction/blocking, prompt construction, answer post-filtering, approved knowledge tools, and raise-draft logic. Define tests for known sensitive patterns, ambiguous/high-risk blocking, above-ceiling sources, and unsourced answers before connecting a provider.
3. **Add server/provider/storage behind a kill switch.** Implement the authenticated streaming endpoint, mock provider, Bedrock provider, rate limits, tenant-scoped persistence, and retention. Store only redacted conversation text. Keep production stages disabled unless assistant enablement and DPA prerequisites are satisfied.
4. **Connect the raise UX and preserve fallback.** Stream answers into the raise page, provide follow-up and “Raise it anyway,” and feed the generated draft into the existing evaluation and case-creation flow. Disabled or unavailable assistant behavior must leave the current raise path usable.
5. **Add imports and admin visibility after the core path works.** Require explicit document classification and idempotency for imports; default unclassified documents to a non-searchable/high classification. Report only department-level aggregate metrics, as proposed.
6. **Pilot only after the region, account retention, model ID, DPA, and audit behavior are verified.** Start with the mock provider, then a controlled sandbox Bedrock test, and only then consider enabling a customer pilot.

## Acceptance criteria

- Mock-provider flow answers from allowed company knowledge with source citations and supports follow-up questions.
- “Raise it anyway” produces a draft and creates a case through the existing flow, with the assistant session linked for audit/context.
- Sensitive/ambiguous input is blocked before provider invocation; blocked turns are auditable without persisting the original unredacted text.
- Searches and stored turns enforce tenant boundaries and classification ceilings.
- Assistant is off by default outside demo and fails closed when required enablement/DPA conditions are absent.
- Provider outage, disabled state, and throttling retain a clear path to the normal raise flow.
- n8n document imports are authenticated, scoped, idempotent, classified, and searchable only within the requesting company and allowed ceiling.
- Desktop and mobile flows are usable, and admin metrics do not expose per-person usage.

## Assumptions and open implementation checks

- EU geographic routing is acceptable; Frankfurt-only routing is not required.
- Fail-closed sensitive-text handling is preferred over smoother best-effort sending, while acknowledging that software pattern detection is not infallible.
- The stated Claude model and SDK integration are validated against the customer’s Bedrock account and current Anthropic/AWS SDK documentation at implementation time; the model ID should be configured rather than hard-coded.
- Existing company-knowledge, raise-flow, session, and event contracts match the proposal once the correct active checkout is available.
