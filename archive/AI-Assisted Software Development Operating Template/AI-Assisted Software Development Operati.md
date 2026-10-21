# AI-Assisted Software Development Operating Template

## AI-Assisted Software Product Development Template

---

## 0. Project Operating Principle

Every project should have four clearly separated layers:

```
BUSINESS INTENT
      ↓
PRODUCT REQUIREMENTS
      ↓
ARCHITECTURE CONTRACT
      ↓
IMPLEMENTATION
      ↓
TESTS / VERIFICATION
      ↓
RELEASE
```

AI does not determine the architecture dynamically while coding.
AI implements within an architecture that has already been explicitly established.

The governing rule is:

- Business requirements define what the product must accomplish.
- The Architecture Contract defines how the system is allowed to accomplish it.
- Code implements the contract.
- Tests prove the implementation.
- Reports document what happened.

---

## 1. Recommended Repository Documentation Structure

For a new project, establish this structure before substantial coding begins:

```
project-root/
│
├── README.md
│
├── package.json
├── .env.example
│
├── docs/
│   │
│   ├── README.md
│   │
│   ├── CURRENT-ARCHITECTURE-CONTRACT.md
│   │
│   ├── BUSINESS-CHARTER.md
│   ├── PRODUCT-REQUIREMENTS.md
│   ├── DOMAIN-MODEL.md
│   ├── API-CONTRACTS.md
│   ├── SECURITY-MODEL.md
│   ├── TEST-STRATEGY.md
│   ├── ENVIRONMENT-MODEL.md
│   ├── RELEASE-READINESS.md
│   ├── KNOWN-GAPS.md
│   ├── REPORT-INDEX.md
│   │
│   ├── decisions/
│   │   ├── ADR-001-....md
│   │   ├── ADR-002-....md
│   │   └── ...
│   │
│   ├── reports/
│   │   ├── PHASE-01-REPORT.md
│   │   ├── PHASE-02-REPORT.md
│   │   └── ...
│   │
│   └── archive/
│       └── superseded-documents/
│
├── src/
│   ├── app/
│   ├── components/
│   ├── lib/
│   ├── services/
│   ├── domain/
│   ├── types/
│   └── ...
│
├── tests/
│   ├── unit/
│   ├── integration/
│   ├── contract/
│   ├── regression/
│   └── e2e/
│
├── scripts/
│
├── migrations/
│
└── fixtures/
    ├── api/
    └── test-data/
```

The exact application folders can vary by framework. The documentation hierarchy should remain stable.

---

## 2. BUSINESS-CHARTER.md

This is the first document.
It should answer why the product exists before discussing frameworks or databases.

Use:

```markdown
# BUSINESS CHARTER

## Product Name

[Name]

## Business Problem

What problem are we solving?

## Target User

Who uses this product?

## Customer Value Proposition

Why would someone use or pay for this?

## Revenue Model

Examples:

- subscription
- transaction fee
- ecommerce margin
- licensing
- lead generation
- advertising
- internal operational savings

## Primary Business Workflows

Example:

Customer discovers product
→ selects product
→ configures product
→ pays
→ fulfillment occurs
→ customer receives product

## Business Owner

Who has final product authority?

## Success Metrics

Examples:

- conversion rate
- monthly recurring revenue
- order completion rate
- lead acceptance rate
- time saved
- support reduction

## Explicit Non-Goals

What are we deliberately NOT building?

## Future Possibilities

Ideas that are valid but intentionally deferred.
```

That last section is important. It prevents:

> "This would be useful too..."

from quietly becoming part of the current implementation.

---

## 3. PRODUCT-REQUIREMENTS.md

Business objectives become explicit functionality.

```markdown
# PRODUCT REQUIREMENTS

## User Roles

### Customer
Can:
- ...
- ...

Cannot:
- ...

### Administrator
Can:
- ...
- ...

### System
Automatically:
- ...
- ...

## Core Features

### Feature 1

Business purpose:

User flow:

Required data:

Success condition:

Failure behavior:

## Functional Requirements

FR-001:
FR-002:
FR-003:

## Non-Functional Requirements

Performance:

Security:

Reliability:

Accessibility:

Scalability:

Observability:

## Deferred Features

Feature:
Reason deferred:
Possible future phase:
```

Every significant feature should eventually map to a requirement.

---

## 4. CURRENT-ARCHITECTURE-CONTRACT.md

This is the most important document for controlling AI drift.
It should remain relatively short.
It is not a development diary.
It describes architecture that future AI agents are not allowed to reinterpret silently.

Template:

```markdown
# CURRENT ARCHITECTURE CONTRACT

## Authority

This document defines the current architectural invariants.

When conflicts exist, authority is:

1. CURRENT-ARCHITECTURE-CONTRACT.md
2. current production code
3. current passing tests
4. live-verified external provider behavior
5. current ADRs
6. historical reports

Historical reports do not override this contract.

---

## System Ownership

Application owns:

- ...
- ...

External provider owns:

- ...
- ...

---

## Identity Model

Internal identity:

External identity:

Mapping:

Never use external provider identity directly for:

- ...
- ...

---

## Data Ownership

Authoritative source for:

Customer:
Product:
Price:
Order:
Provider status:

---

## Persistence Rules

What gets persisted?

What is immutable?

What can be updated?

What must never be overwritten?

---

## API Boundaries

Service A:

Purpose:

Authoritative endpoint:

Normalization boundary:

---

## Unknown Data Semantics

UNKNOWN must remain UNKNOWN.

Missing data must never automatically become:

- 0
- false
- true
- available
- unavailable
- active

unless an authoritative source establishes that value.

---

## Pricing Rules

Define pricing ownership.

Define cost semantics.

Define margin semantics.

---

## Security Rules

Authentication:

Authorization:

Secrets:

Server-only operations:

---

## External Provider Rules

Provider responses must be normalized at the integration boundary.

Application code should not depend unnecessarily on provider response shapes.

---

## Failure Rules

Fail open:

Fail closed:

Operator intervention required:

---

## Historical Data

Define immutable snapshots and audit history.

---

## AI Change Control

Before making code changes:

1. Read this contract.
2. State scope.
3. State files expected to change.
4. Identify applicable invariants.
5. Do not expand scope.
6. UNKNOWN remains UNKNOWN.
7. Provider behavior must not be invented.
8. STOP when requested work conflicts with this contract.
9. Never declare completion while requirements remain incomplete.
```

That document becomes your project constitution.

---

## 5. DOMAIN-MODEL.md

Before writing tables and APIs, identify the domain.

Example:

```
User
 │
 ├── owns Account
 │
 ├── creates Order
 │
 └── manages Preferences

Product
 │
 ├── has Variants
 │
 ├── has Price
 │
 └── maps to ProviderProduct

Order
 │
 ├── contains OrderItems
 │
 ├── contains immutable Snapshot
 │
 └── maps to ProviderOrder
```

Then document each important entity:

```markdown
## Product

Internal ID:
UUID

Owned by:
Application

Mutable:
title
description
price

Immutable:
product UUID

External mappings:
provider_product_id
```

This prevents provider IDs, database IDs, and customer-visible IDs from becoming mixed together later.

---

## 6. API-CONTRACTS.md

For every important external API:

```markdown
# SERVICE

## Purpose

Why the application calls this service.

## Endpoint

GET /...

## Verified

Date:
Environment:

## Request

...

## Actual Response

...

## Application Normalization

ProviderResponse
→ DomainObject

## Pagination

...

## Error Semantics

404:
429:
500:

## Rate Limits

...

## Unknown Fields

...

## Verification Requirement

Any changed endpoint or response contract must be
live-verified before implementation.
```

This would have prevented much of the Printful confusion.
A critical rule should be:

> Never implement an uncertain provider contract based only on AI recollection, old project reports, or TypeScript definitions.

For uncertain behavior:

```
one controlled read-only request
→ capture actual response
→ create fixture
→ write contract test
→ implement adapter
```

---

## 7. Folder / Scaffolding Design

Before implementation, have the AI propose the scaffold.

Example:

```
src/
├── app/
│   ├── api/
│   └── admin/
│
├── domain/
│   ├── products/
│   ├── orders/
│   └── users/
│
├── services/
│   ├── payments/
│   ├── fulfillment/
│   └── email/
│
├── lib/
│   ├── database/
│   ├── auth/
│   └── validation/
│
├── components/
│
└── types/
```

Do not immediately let the agent generate 100 files.
First approve:

```
architecture
→ module boundaries
→ directory structure
→ dependency direction
```

---

## 8. ADR — Architecture Decision Records

Important decisions deserve a tiny permanent record.

Example:

```markdown
# ADR-007 — Store Variant Identity

Status: Accepted

## Problem

External provider variant IDs were being used directly
inside the customer cart.

## Decision

The application will own stable UUID variant identities.

## Architecture

Store Variant UUID
→ Provider Mapping
→ Provider Variant ID

## Reason

- provider neutrality
- stable customer identity
- auditability
- provider migration

## Rejected Alternatives

Use provider ID directly.

Reason rejected:
provider coupling.

## Consequences

Requires server-side provider resolution.
```

ADRs stop future AI agents from "simplifying" deliberate architecture.

---

## 9. Development Phase Template

Every development phase should follow exactly the same lifecycle:

```
DISCOVER
   ↓
BASELINE
   ↓
DESIGN
   ↓
IMPLEMENT
   ↓
TEST
   ↓
VERIFY
   ↓
OPERATOR ACCEPTANCE
   ↓
GIT CHECKPOINT
   ↓
NEXT PHASE
```

Phase file:

```markdown
# PHASE X — NAME

## Objective

Exactly what this phase accomplishes.

## Out of Scope

Explicitly excluded work.

## Starting Baseline

Tests:
TypeScript:
Build:
Git commit:

## Architecture Invariants

Relevant sections from CURRENT-ARCHITECTURE-CONTRACT.

## Expected Files

Files likely to change.

## Implementation

Step 1
Step 2
Step 3

## Tests Required

...

## Safety Constraints

...

## Completion Gate

Phase is complete only when:

- ...
- ...
- ...

## STOP Conditions

Stop if:

- architecture conflict
- schema change unexpectedly required
- external provider contract uncertain
- destructive action required
```

---

## 10. AI Coding Prompt Header

Every AI coding task should begin with the same governance header.

```
PROJECT CHANGE CONTROL

Read:

docs/CURRENT-ARCHITECTURE-CONTRACT.md

before making any changes.

The architecture contract is authoritative.

Historical reports are reference only.

Before editing:

1. Restate the requested scope.
2. Identify relevant architecture invariants.
3. List expected files to modify.
4. Identify any conflicts.
5. If architecture conflicts with the requested task, STOP.
6. Do not improve adjacent code.
7. UNKNOWN must remain UNKNOWN.
8. Do not invent external API behavior.
9. Do not modify files outside the approved scope without stopping first.
10. Do not declare completion until all required gates pass.
```

Then append the actual task.

---

## 11. Small-Change Rule

A major lesson from your CountyBuys experience:
AI agents should receive bounded implementation scopes.

**Bad:**

> Fix the Printful integration and improve the builder.

**Better:**

```
Change only catalog variant retrieval.

Allowed files:
- catalog.ts
- types.ts
- associated tests

Do not modify:
- pricing
- UI
- fulfillment
- database

Run:
- TypeScript
- tests

STOP afterward.
```

Large features can still be built, but they should be divided into controlled phases.

---

## 12. External API Verification Process

Use this whenever Stripe, Printful, AWS, Google, Supabase, etc. are involved.

```
DOCUMENTATION
     ↓
READ-ONLY LIVE REQUEST
     ↓
CAPTURE RESPONSE
     ↓
STORE FIXTURE
     ↓
CONTRACT TEST
     ↓
ADAPTER
     ↓
DOMAIN MODEL
     ↓
APPLICATION
```

Never:

```
AI assumption
→ implementation
→ hope API behaves that way
```

---

## 13. Test Strategy

Each project should have multiple verification layers.

| Layer | Covers |
|---|---|
| **STATIC** | TypeScript, lint, schema validation |
| **UNIT** | business logic, validation, calculations |
| **INTEGRATION** | database, service boundaries, API handlers |
| **CONTRACT** | external API fixtures, response normalization, provider errors |
| **REGRESSION** | bugs previously discovered |
| **E2E** | real user workflows |
| **LIVE CONTROLLED** | external provider verification |
| **OPERATOR UX** | human interaction |

Important rule:

> Passing unit tests do not prove an external provider contract.

Your Printful experience demonstrated that clearly.

---

## 14. Bug Regression Rule

Every meaningful bug gets a regression test.

Example:

```
Bug:
DTF showed embroidery placements.

Regression:

Given:
technique = DTFILM

Then:
only technique-specific placements are returned.

And:
stale embroidery templates cannot reappear.
```

The system gradually becomes harder to break.

---

## 15. Test Fixtures

For provider integrations, maintain:

```
fixtures/
└── printful/
    ├── product-679.json
    ├── regional-unavailable.json
    ├── catalog-variants-page-1.json
    ├── catalog-variants-page-2.json
    ├── rate-limit.json
    └── provider-error.json
```

Tests then run against real captured provider shapes, not AI-invented structures.

---

## 16. Completion Report Template

Every phase should end with the same report.

```markdown
# PHASE X COMPLETION REPORT

## Objective

...

## Scope Completed

...

## Files Changed

...

## Architecture Impact

None / describe.

## Database Changes

...

## External API Changes

...

## Tests

Unit:
Integration:
Regression:
Contract:
E2E:

## TypeScript

PASS / FAIL

## Build

PASS / FAIL

## Live Verification

...

## Safety

Database writes:
Orders created:
Payments:
External side effects:

## Known Gaps

...

## Deferred Work

...

## Operator Verification

PASS / FAIL / REQUIRED

## Git

Branch:
Commit:

## Phase Status

COMPLETE / INCOMPLETE
```

The critical rule is:

> If "Known Gaps" contains something required by the phase, the phase cannot say COMPLETE.

That directly addresses one of the drift behaviors you encountered.

---

## 17. Git Checkpoint Process

Every meaningful phase should conclude:

```
tests PASS
   ↓
TypeScript PASS
   ↓
build PASS
   ↓
operator approval
   ↓
git diff reviewed
   ↓
commit
```

Then the next phase begins.
Avoid letting multiple architectural phases accumulate in an uncommitted working tree.
That was one of the major factors that made the CountyBuys repair process difficult.

---

## 18. Git Branch Recommendation

For larger features:

```
main
 │
 ├── feature/catalog-builder
 ├── feature/provider-pricing
 └── feature/admin-dashboard
```

For risky architecture:

```
main
 ↓
architecture/provider-v2
```

Merge only after the phase gates pass.

---

## 19. Database Change Process

Every migration should answer:

- What changes?
- Why?
- Backward compatible?
- Data migration?
- Rollback strategy?
- RLS impact?
- Index impact?
- Foreign-key impact?
- Production risk?

AI must inspect the existing schema first.

Never allow:

> "I created a new table because it seemed easier."

without architecture approval.

---

## 20. Security Review

Before production:

- Authentication
- Authorization
- RLS
- admin routes
- secret handling
- webhook authentication
- rate limits
- input validation
- SQL injection
- XSS
- CSRF
- file uploads
- third-party credentials
- logging
- PII
- audit trails

Security changes should also generate regression tests.

---

## 21. Release Gate

Production release occurs only when:

- [ ] Business requirement approved
- [ ] Architecture contract satisfied
- [ ] Database migrations verified
- [ ] Tests PASS
- [ ] TypeScript PASS
- [ ] Build PASS
- [ ] Security checks PASS
- [ ] External API contracts verified
- [ ] Operator UX test PASS
- [ ] Rollback strategy known
- [ ] Git checkpoint created

---

## 22. Post-Release Verification

After deployment:

- health check
- login
- critical workflow
- database writes
- external APIs
- webhooks
- logs
- error rate
- performance

Do not immediately begin another feature. Verify production first.

---

## 23. REPORT-INDEX.md

Add `docs/REPORT-INDEX.md` to every project. It becomes the authoritative map of all phases, reports, and their status — so you can return months later without reconstructing history from old chats.

Structure:

```
docs/
└── REPORT-INDEX.md
```

Example layout:

```
M0
 ├─ Architecture
 ├─ Governance
 └─ Pre-integration checkpoint

M1
 ├─ M1A
 ├─ M1B
 ├─ M1C.1
 ├─ M1C.2
 ├─ M1C.3
 ├─ M1D.1
 ├─ M1D.1A
 ├─ M1D.2
 └─ M1 Completion

Post-M1
 └─ M1C.4
```

Each entry records:

| Field | Description |
|---|---|
| Phase | e.g. M1A, M1D.1 |
| Report file | e.g. `reports/PHASE-M1A-REPORT.md` |
| Commit SHA | Git checkpoint at phase close |
| Status | PASS / FAIL / INCOMPLETE |
| Product Owner accepted | YES / NO / PENDING |

Template:

```markdown
# REPORT INDEX

## M0 — Foundation

| Phase | Report | Commit | Status | PO Accepted |
|---|---|---|---|---|
| Architecture | reports/PHASE-M0-ARCHITECTURE.md | abc1234 | PASS | YES |
| Governance | reports/PHASE-M0-GOVERNANCE.md | def5678 | PASS | YES |
| Pre-integration checkpoint | reports/PHASE-M0-PREINTEGRATION.md | ghi9012 | PASS | YES |

## M1 — [Milestone Name]

| Phase | Report | Commit | Status | PO Accepted |
|---|---|---|---|---|
| M1A | reports/PHASE-M1A-REPORT.md | ... | PASS | YES |
| M1B | reports/PHASE-M1B-REPORT.md | ... | PASS | YES |
| M1C.1 | reports/PHASE-M1C1-REPORT.md | ... | PASS | YES |
| M1C.2 | reports/PHASE-M1C2-REPORT.md | ... | PASS | YES |
| M1C.3 | reports/PHASE-M1C3-REPORT.md | ... | PASS | YES |
| M1D.1 | reports/PHASE-M1D1-REPORT.md | ... | PASS | YES |
| M1D.1A | reports/PHASE-M1D1A-REPORT.md | ... | PASS | YES |
| M1D.2 | reports/PHASE-M1D2-REPORT.md | ... | PASS | YES |
| M1 Completion | reports/PHASE-M1-COMPLETION.md | ... | PASS | YES |

## Post-M1

| Phase | Report | Commit | Status | PO Accepted |
|---|---|---|---|---|
| M1C.4 | reports/PHASE-M1C4-REPORT.md | ... | PASS | YES |
```

Rules:

- A phase is not closed until its row is complete with commit SHA and PO acceptance.
- REPORT-INDEX.md is updated at the end of every phase, not retroactively.
- The index does not replace phase reports — it maps to them.
- When the Architecture Contract is updated, note the relevant phase commit in the index.
- Every authorized development phase must create its completion report as a tracked repository artifact under `docs/reports/`. The report must be included in the phase commit or, when Product Owner acceptance necessarily occurs afterward, in the immediately following documentation checkpoint. Agent-chat output alone is not an official project report.

---

## 24. Historical Documentation Policy

Old reports should be preserved, but clearly demoted.

```
docs/
├── CURRENT-ARCHITECTURE-CONTRACT.md
├── reports/
└── archive/
```

Rule:

> Reports explain history. The Architecture Contract defines the present.

This prevents AI from reading an old report and resurrecting obsolete architecture.

---

## 25. AI Drift Detection Checklist

Stop the AI if you see behavior such as:

- [ ] Declares completion while requirements remain open
- [ ] Modifies files outside requested scope
- [ ] Invents provider fields
- [ ] Turns unknown into `0` / `true` / `active`
- [ ] Rewrites architecture to fix a local compile problem
- [ ] Introduces a second implementation of an existing subsystem
- [ ] Uses historical reports over the current contract
- [ ] Adds "helpful" features that were not requested
- [ ] Changes database schema without approval
- [ ] Replaces a proven deterministic path with AI-driven logic
- [ ] Changes tests merely to accommodate incorrect behavior
- [ ] Runs live/destructive calls during a diagnostic phase

Those are warning signals that the agent is starting to solve its interpretation of the project instead of your project.

---

## 26. Master New-Project Process

For every new code product, follow this sequence:

```
1. Business Charter
        ↓
2. Product Requirements
        ↓
3. Domain Model
        ↓
4. Architecture Design
        ↓
5. Architecture Contract
        ↓
6. Folder / Scaffold Approval
        ↓
7. Environment Setup
        ↓
8. Database Foundation
        ↓
9. Core Domain Logic
        ↓
10. External Integrations
        ↓
11. UI / UX
        ↓
12. Security
        ↓
13. Integration Testing
        ↓
14. E2E Testing
        ↓
15. Operator Acceptance
        ↓
16. Production Release
        ↓
17. Production Verification
        ↓
18. Git Checkpoint
        ↓
19. Next Feature
```

The important difference is that AI doesn't start at Step 8 anymore.
It starts by helping you establish Steps 1–6.

---

## 27. The Four Documents I Would Require for Every Project

If you want the lightweight version, require these four before serious coding:

1. `BUSINESS-CHARTER.md`
2. `PRODUCT-REQUIREMENTS.md`
3. `CURRENT-ARCHITECTURE-CONTRACT.md`
4. `TEST-STRATEGY.md`

Those four documents answer:

| Document | Question |
|---|---|
| BUSINESS-CHARTER.md | WHY are we building it? |
| PRODUCT-REQUIREMENTS.md | WHAT must it do? |
| CURRENT-ARCHITECTURE-CONTRACT.md | HOW must it be built? |
| TEST-STRATEGY.md | HOW do we prove it works? |

Everything else can grow around them.

---

You remain the product owner and architecture authority. AI acts as analyst, implementation engineer, tester, and auditor—but cannot silently redefine the system.

The new process prevents that history from becoming accidental instructions.
The AI should spend far less time repairing its own assumptions and far more time implementing your intended system.
