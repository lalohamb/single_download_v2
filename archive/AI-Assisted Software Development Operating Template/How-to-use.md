# How to Use the Governance Onboarding Audit

Follow these steps in order. Do not skip ahead.

---

## Step 1 — Create a baseline git commit

Before anything else, snapshot the current state of the application.

```bash
git checkout -b governance/onboarding
git add .
git commit -m "baseline: pre-governance snapshot"
```

Record the commit SHA. You will need it for the REPORT-INDEX entry.

---

## Step 2 — Add `docs/audit-raw/` to `.gitignore`

The extraction script writes working material that is not a project artifact.

```bash
echo "docs/audit-raw/" >> .gitignore
```

---

## Step 3 — Run the extraction script

From your project root:

```bash
bash scripts/audit-extract.sh
```

This produces `docs/audit-raw/` containing:

| File | Contents |
|---|---|
| `structure.txt` | Directory tree |
| `dependencies.txt` | package.json / requirements.txt / go.mod etc. |
| `env-keys.txt` | Environment variable names only — no values |
| `schema.txt` | Prisma, SQL migrations, Drizzle, Supabase migrations |
| `api-routes.txt` | All API route files with full content |
| `external-calls.txt` | Every external service call with line numbers |
| `auth-patterns.txt` | Auth, session, JWT, RLS references with line numbers |
| `types.txt` | All types/, domain/, models/, entities/ files |
| `config.txt` | next.config, tsconfig, docker-compose, jest, eslint etc. |
| `test-inventory.txt` | All test files with count breakdown by type |
| `git-log.txt` | Last 50 commits |
| `existing-docs.txt` | All existing files under docs/ |
| `readme.txt` | README.md |

---

## Step 4 — Open a new AI session with the extracted facts

Attach the audit-raw files as context before pasting the audit prompt:

```
I am running a governance onboarding audit on an existing application.
I have extracted the following raw facts. Please read them before I give
you the audit prompt.

@docs/audit-raw/readme.txt
@docs/audit-raw/structure.txt
@docs/audit-raw/dependencies.txt
@docs/audit-raw/env-keys.txt
@docs/audit-raw/schema.txt
@docs/audit-raw/api-routes.txt
@docs/audit-raw/external-calls.txt
@docs/audit-raw/auth-patterns.txt
@docs/audit-raw/types.txt
@docs/audit-raw/config.txt
@docs/audit-raw/test-inventory.txt
@docs/audit-raw/git-log.txt
@docs/audit-raw/existing-docs.txt
```

Wait for the AI to confirm it has read all files before proceeding.

---

## Step 5 — Paste the governance onboarding audit prompt

Paste the full contents of `GOVERNANCE ONBOARDING AUDIT.md`.

The AI will run three phases:

- **Phase 1 — Discovery:** reads all extracted facts, confirms before writing
- **Phase 2 — Draft documents:** produces all seven documents with ⚠️ and ❌ markers
- **Phase 3 — Audit summary:** confidence level, top 5 risks, recommended first phases

Do not interrupt between phases. Let Phase 1 complete and confirm before Phase 2 begins.

---

## Step 6 — Review and correct each document

As each document is produced, correct it before moving to the next.

- Every **⚠️ UNVERIFIED** field is a question only you can answer — fill it in or confirm it
- Every **❌ GAP** is a real inconsistency found in the code — do not remove it, move it to KNOWN-GAPS.md
- Do not remove markers just to make the document look clean — an honest gap is better than a false contract

---

## Step 7 — Save each document to `docs/`

| AI-produced document | Save as |
|---|---|
| BUSINESS-CHARTER.md | `docs/BUSINESS-CHARTER.md` |
| CURRENT-ARCHITECTURE-CONTRACT.md | `docs/CURRENT-ARCHITECTURE-CONTRACT.md` |
| DOMAIN-MODEL.md | `docs/DOMAIN-MODEL.md` |
| PRODUCT-REQUIREMENTS.md | `docs/PRODUCT-REQUIREMENTS.md` |
| API-CONTRACTS.md | `docs/API-CONTRACTS.md` |
| KNOWN-GAPS.md | `docs/KNOWN-GAPS.md` |
| TEST-STRATEGY.md | `docs/TEST-STRATEGY.md` |

---

## Step 8 — Write the phase completion report

Create `docs/reports/PHASE-M0-GOVERNANCE.md` using the completion report template from the operating template.

Key fields:

- **Objective:** Governance onboarding audit
- **Scope Completed:** All seven onboarding documents drafted and corrected
- **Architecture Impact:** Describe — this is the first contract, not a change to one
- **Known Gaps:** Copy from KNOWN-GAPS.md
- **Phase Status:** COMPLETE only if all seven documents are saved and all ⚠️ fields are resolved or consciously deferred

> Agent-chat output alone is not an official project report. The report must be saved as a committed repository artifact.

---

## Step 9 — Commit the documentation layer

```bash
git add docs/
git commit -m "governance: M0 onboarding documentation complete"
```

Record the new commit SHA.

---

## Step 10 — Update REPORT-INDEX.md

Create or update `docs/REPORT-INDEX.md` with the M0 entry:

```markdown
## M0 — Governance Onboarding

| Phase | Report | Commit | Status | PO Accepted |
|---|---|---|---|---|
| Governance Onboarding | reports/PHASE-M0-GOVERNANCE.md | [SHA] | PASS | YES |
```

Commit the index update:

```bash
git add docs/REPORT-INDEX.md
git commit -m "governance: M0 REPORT-INDEX entry"
```

---

## The ⚠️ and ❌ markers

These markers are intentional. They make the draft self-auditing.

- Every **unmarked field** is a claim the AI is reasonably confident about based on the code
- Every **⚠️ UNVERIFIED** is a field the AI could not determine from code alone — only you can answer it
- Every **❌ GAP** is a real inconsistency or risk found in the codebase — it belongs in KNOWN-GAPS.md and must be resolved in a future phase

The project is now under governance control. Every subsequent development phase runs under the full phase template from the operating template.
