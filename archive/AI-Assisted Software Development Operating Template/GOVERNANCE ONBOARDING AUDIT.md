GOVERNANCE ONBOARDING AUDIT

You are performing a read-only architectural audit of an existing application.
Your job is to discover and document what the system actually is — not what it
should be, and not what would be ideal. Do not suggest improvements yet.
Do not modify any code.

---

PHASE 1 — DISCOVERY

Read the following in this order:

1. package.json or equivalent dependency manifest
2. Database schema (Prisma, SQL migrations, Drizzle, or equivalent)
3. All files under src/types/, types.ts, or domain/ equivalents
4. All API route files
5. All external service call files (Stripe, email, storage, fulfillment, etc.)
6. Auth layer files
7. Environment variable keys (.env.example or equivalent)
8. Any existing docs/ files
9. README.md

Do not summarize yet. Confirm when you have read all of the above.

---

PHASE 2 — DRAFT DOCUMENTS

After reading, produce the following documents as drafts.
Mark every field you are uncertain about with: ⚠️ UNVERIFIED
Mark every field where you found a conflict or inconsistency with: ❌ GAP

---

DOCUMENT 1: BUSINESS-CHARTER.md

Infer from the codebase, routes, UI copy, and README.
Do not invent a business model. If you cannot determine it, mark ⚠️ UNVERIFIED.

Sections:
- Product Name
- Business Problem (what pain does this solve?)
- Target User (who are the actors in the system?)
- Customer Value Proposition
- Revenue Model (infer from payment integrations, pricing logic, or mark ⚠️)
- Primary Business Workflows (trace the main user journeys through the routes)
- Business Owner (mark ⚠️ UNVERIFIED — cannot be inferred from code)
- Success Metrics (mark ⚠️ UNVERIFIED unless analytics or tracking found)
- Explicit Non-Goals (mark ⚠️ UNVERIFIED)
- Future Possibilities (mark ⚠️ UNVERIFIED)

---

DOCUMENT 2: CURRENT-ARCHITECTURE-CONTRACT.md

This is the most important document. Be conservative. If ownership is unclear,
say so. Do not invent a clean contract where the code is inconsistent.

Sections:
- Authority hierarchy (standard template)
- System Ownership — what does the application own vs. external providers?
- Identity Model — how are users identified internally vs. externally?
  Note any place where provider IDs are used as internal identifiers. Mark ❌ GAP.
- Data Ownership — what is the authoritative source for each entity?
- Persistence Rules — what is immutable, what is mutable, what is never overwritten?
- API Boundaries — for each internal service boundary, state its purpose
- Unknown Data Semantics — identify any place where missing data is silently
  coerced to 0, false, true, null, or a default. Mark each ❌ GAP.
- Pricing Rules — who owns price? where is it calculated? where is it stored?
  If pricing logic is scattered, mark ❌ GAP.
- Security Rules — auth mechanism, authorization checks, secret handling,
  server-only operations. Note any unprotected routes. Mark ❌ GAP.
- External Provider Rules — list each provider, what the app calls it for,
  and whether responses are normalized at a boundary or used directly.
- Failure Rules — what fails open, what fails closed, what requires operator action?
- Historical Data — are there immutable snapshots or audit records?
- AI Change Control (standard template)

---

DOCUMENT 3: DOMAIN-MODEL.md

Trace the entities from the schema and types.
Draw the relationship tree.
For each entity document:
- Internal ID type
- Owned by (application or external provider)
- Mutable fields
- Immutable fields
- External mappings

Flag any entity where the primary key is a provider ID rather than an
application-owned UUID. Mark ❌ GAP.

---

DOCUMENT 4: PRODUCT-REQUIREMENTS.md

Reconstruct from routes, UI, and API handlers.

Sections:
- User Roles — list each actor and what they can and cannot do
- Core Features — one entry per distinct feature found in the codebase
- Functional Requirements — number each discrete behavior FR-001, FR-002, etc.
- Non-Functional Requirements — infer from middleware, rate limiting,
  caching, and error handling found in code
- Deferred Features — mark ⚠️ UNVERIFIED, cannot be inferred from code

---

DOCUMENT 5: API-CONTRACTS.md

For each external provider integration found:
- Provider name
- What the application calls it for
- Endpoints called (from the code)
- Request shape (from the code)
- Expected response shape (from the code or types)
- Whether a live verification has been performed: mark ⚠️ UNVERIFIED if not
- Whether responses are normalized at a boundary or used raw
- Error handling found in code

Do not invent response shapes. If the code assumes a shape without verification,
mark ⚠️ UNVERIFIED.

---

DOCUMENT 6: KNOWN-GAPS.md

Consolidate every ⚠️ UNVERIFIED and ❌ GAP found across all documents.

For each gap:
- Location (file or document section)
- Nature of the gap (missing, inconsistent, unverified, risky)
- Risk level: LOW / MEDIUM / HIGH
- Recommended resolution

This document is not a failure report. It is the most honest output of the audit.

---

DOCUMENT 7: TEST-STRATEGY.md

Inventory what testing exists:
- List test files found
- Categorize by type: unit, integration, contract, e2e, regression
- Identify which external providers have contract tests vs. none
- Identify which critical business workflows have e2e coverage vs. none
- Mark gaps ❌ GAP

---

PHASE 3 — AUDIT SUMMARY

After producing all documents, provide a single audit summary:

1. Confidence level in the Architecture Contract: LOW / MEDIUM / HIGH
   (based on how much was ⚠️ UNVERIFIED or ❌ GAP)

2. Highest risk gaps (top 5)

3. Recommended first three phases to bring the project under governance control

4. Estimated documentation checkpoint commit message for the baseline

---

RULES FOR THIS AUDIT

- Read before writing. Do not produce any document until Phase 1 is complete.
- Do not suggest refactors. Document what exists.
- Do not invent provider behavior. If uncertain, mark ⚠️ UNVERIFIED.
- Do not turn unknown into a default value anywhere in the documents.
- If you find two conflicting patterns for the same concern, document both
  and mark ❌ GAP. Do not pick a winner.
- Do not declare the audit complete while any section remains unread.
- These documents describe this commit. Note the commit SHA in each document header.
