#!/usr/bin/env bash
# audit-extract.sh
#
# Extracts project facts into docs/audit-raw/ for AI-assisted governance onboarding.
# Produces raw material only — no analysis, no modification of source files.
#
# Usage:
#   bash scripts/audit-extract.sh
#
# Run from project root.
# Output: docs/audit-raw/

set -euo pipefail

OUT="docs/audit-raw"
mkdir -p "$OUT"

echo "=== GOVERNANCE AUDIT EXTRACTION ==="
echo "Date:   $(date)"
echo "Commit: $(git rev-parse HEAD 2>/dev/null || echo 'not a git repo')"
echo "Output: $OUT/"
echo ""

# ---------------------------------------------------------------------------
# 1. Directory structure
# ---------------------------------------------------------------------------
echo ">> [1/11] directory structure"
tree -a -I 'node_modules|.git|.next|dist|build|coverage|.turbo|.cache' \
  --dirsfirst -L 6 > "$OUT/structure.txt" 2>/dev/null \
|| find . \
     -not -path '*/node_modules/*' \
     -not -path '*/.git/*' \
     -not -path '*/.next/*' \
     -not -path '*/dist/*' \
     -not -path '*/build/*' \
     -not -path '*/coverage/*' \
   | sort > "$OUT/structure.txt"

# ---------------------------------------------------------------------------
# 2. Dependency manifests
# ---------------------------------------------------------------------------
echo ">> [2/11] dependencies"
> "$OUT/dependencies.txt"
for f in package.json requirements.txt Gemfile go.mod Cargo.toml pyproject.toml; do
  [ -f "$f" ] && { echo "=== $f ==="; cat "$f"; echo ""; } >> "$OUT/dependencies.txt" || true
done

# ---------------------------------------------------------------------------
# 3. Environment variable keys (no values)
# ---------------------------------------------------------------------------
echo ">> [3/11] environment variable keys"
> "$OUT/env-keys.txt"
for f in .env.example .env.sample .env.template; do
  [ -f "$f" ] && { echo "=== $f ==="; cat "$f"; echo ""; } >> "$OUT/env-keys.txt" || true
done
# Extract keys only from live env files (never values)
for f in .env .env.local .env.development .env.production; do
  [ -f "$f" ] && {
    echo "=== $f (keys only) ==="
    grep -oP '^[A-Z_][A-Z0-9_]+(?==)' "$f" 2>/dev/null || true
    echo ""
  } >> "$OUT/env-keys.txt" || true
done

# ---------------------------------------------------------------------------
# 4. Database schema
# ---------------------------------------------------------------------------
echo ">> [4/11] database schema"
> "$OUT/schema.txt"

# Prisma
find . -name "schema.prisma" -not -path '*/node_modules/*' | sort | while read -r f; do
  echo "=== $f ===" >> "$OUT/schema.txt"
  cat "$f"          >> "$OUT/schema.txt"
  echo ""           >> "$OUT/schema.txt"
done

# SQL migrations
find . \( -name "*.sql" \) \
  -not -path '*/node_modules/*' \
  -not -path '*/.git/*' \
  | sort | while read -r f; do
    echo "=== $f ===" >> "$OUT/schema.txt"
    cat "$f"          >> "$OUT/schema.txt"
    echo ""           >> "$OUT/schema.txt"
  done

# Drizzle schema files
find . -name "*.ts" \( -path "*/db/schema*" -o -path "*/database/schema*" \) \
  -not -path '*/node_modules/*' | sort | while read -r f; do
    echo "=== $f ===" >> "$OUT/schema.txt"
    cat "$f"          >> "$OUT/schema.txt"
    echo ""           >> "$OUT/schema.txt"
  done

# Supabase migrations
find . -path "*/supabase/migrations/*.sql" | sort | while read -r f; do
  echo "=== $f ===" >> "$OUT/schema.txt"
  cat "$f"          >> "$OUT/schema.txt"
  echo ""           >> "$OUT/schema.txt"
done

# ---------------------------------------------------------------------------
# 5. API routes
# ---------------------------------------------------------------------------
echo ">> [5/11] API routes"
> "$OUT/api-routes.txt"

# Next.js app router
find . -path "*/app/api/**" \( -name "route.ts" -o -name "route.js" \) \
  -not -path '*/node_modules/*' | sort | while read -r f; do
    echo "=== $f ===" >> "$OUT/api-routes.txt"
    cat "$f"          >> "$OUT/api-routes.txt"
    echo ""           >> "$OUT/api-routes.txt"
  done

# Next.js pages router
find . -path "*/pages/api/**" \( -name "*.ts" -o -name "*.js" \) \
  -not -path '*/node_modules/*' | sort | while read -r f; do
    echo "=== $f ===" >> "$OUT/api-routes.txt"
    cat "$f"          >> "$OUT/api-routes.txt"
    echo ""           >> "$OUT/api-routes.txt"
  done

# Express / Fastify / generic router files
grep -rl \
  --include="*.ts" --include="*.js" \
  --exclude-dir=node_modules --exclude-dir=.git --exclude-dir=.next \
  -E "router\.(get|post|put|patch|delete)\s*\(" \
  . 2>/dev/null | sort | while read -r f; do
    echo "=== $f ===" >> "$OUT/api-routes.txt"
    cat "$f"          >> "$OUT/api-routes.txt"
    echo ""           >> "$OUT/api-routes.txt"
  done || true

# ---------------------------------------------------------------------------
# 6. External service calls
# ---------------------------------------------------------------------------
echo ">> [6/11] external service calls"
grep -rn \
  --include="*.ts" --include="*.js" \
  --exclude-dir=node_modules --exclude-dir=.git --exclude-dir=.next \
  -E \
  "(fetch|axios|got|https?\.request)\s*\(|\
new\s+(Stripe|Resend|SendGrid|Twilio|OpenAI|Anthropic|Printful|Shopify|Klaviyo)|\
(S3Client|SESClient|SNSClient|SQSClient|DynamoDBClient|LambdaClient)\s*\(|\
supabase\.(from|rpc|storage|functions)|\
createClient\s*\(" \
  . 2>/dev/null \
  | grep -v -E "\.(test|spec)\.(ts|js)" \
  > "$OUT/external-calls.txt" || true

# ---------------------------------------------------------------------------
# 7. Auth patterns
# ---------------------------------------------------------------------------
echo ">> [7/11] auth patterns"
grep -rn \
  --include="*.ts" --include="*.js" \
  --exclude-dir=node_modules --exclude-dir=.git --exclude-dir=.next \
  -E \
  "(getSession|getServerSession|auth\(\)|currentUser|verifyToken|\
jwt\.(verify|sign)|supabase\.auth\.|clerk\.|nextauth|\
withAuth|requireAuth|isAuthenticated|isAuthorized|\
RLS|row.level.security)" \
  . 2>/dev/null \
  > "$OUT/auth-patterns.txt" || true

# ---------------------------------------------------------------------------
# 8. TypeScript types and domain models
# ---------------------------------------------------------------------------
echo ">> [8/11] types and domain models"
> "$OUT/types.txt"
find . \( \
  -path "*/types/*.ts" \
  -o -name "types.ts" \
  -o -name "types.d.ts" \
  -o -path "*/domain/*.ts" \
  -o -path "*/models/*.ts" \
  -o -path "*/entities/*.ts" \
  \) \
  -not -path '*/node_modules/*' \
  -not -path '*/.next/*' \
  | sort | while read -r f; do
    echo "=== $f ===" >> "$OUT/types.txt"
    cat "$f"          >> "$OUT/types.txt"
    echo ""           >> "$OUT/types.txt"
  done

# ---------------------------------------------------------------------------
# 9. Config files
# ---------------------------------------------------------------------------
echo ">> [9/11] config files"
> "$OUT/config.txt"
for f in \
  next.config.js next.config.ts \
  tsconfig.json \
  vite.config.ts vite.config.js \
  webpack.config.js \
  tailwind.config.ts tailwind.config.js \
  supabase/config.toml \
  docker-compose.yml \
  Dockerfile \
  .eslintrc.js .eslintrc.json \
  jest.config.ts jest.config.js \
  vitest.config.ts; do
  [ -f "$f" ] && {
    echo "=== $f ==="
    cat "$f"
    echo ""
  } >> "$OUT/config.txt" || true
done

# ---------------------------------------------------------------------------
# 10. Test inventory
# ---------------------------------------------------------------------------
echo ">> [10/13] test inventory"
find . \( \
  -name "*.test.ts" -o -name "*.test.js" \
  -o -name "*.spec.ts" -o -name "*.spec.js" \
  -o -name "*.test.tsx" -o -name "*.spec.tsx" \
  \) \
  -not -path '*/node_modules/*' \
  -not -path '*/.next/*' \
  | sort > "$OUT/test-inventory.txt"

echo "" >> "$OUT/test-inventory.txt"
echo "=== Test count by type ===" >> "$OUT/test-inventory.txt"
echo "unit:        $(grep -c '/unit/'        "$OUT/test-inventory.txt" || echo 0)" >> "$OUT/test-inventory.txt"
echo "integration: $(grep -c '/integration/' "$OUT/test-inventory.txt" || echo 0)" >> "$OUT/test-inventory.txt"
echo "contract:    $(grep -c '/contract/'    "$OUT/test-inventory.txt" || echo 0)" >> "$OUT/test-inventory.txt"
echo "e2e:         $(grep -c '/e2e/'         "$OUT/test-inventory.txt" || echo 0)" >> "$OUT/test-inventory.txt"
echo "regression:  $(grep -c '/regression/'  "$OUT/test-inventory.txt" || echo 0)" >> "$OUT/test-inventory.txt"

# ---------------------------------------------------------------------------
# 11. Existing docs/ files
# ---------------------------------------------------------------------------
echo ">> [11/13] existing documentation"
> "$OUT/existing-docs.txt"
find . -path "./docs/*" \
  -not -path '*/node_modules/*' \
  -not -path '*/audit-raw/*' \
  \( -name "*.md" -o -name "*.txt" \) \
  | sort | while read -r f; do
    echo "=== $f ==" >> "$OUT/existing-docs.txt"
    cat "$f"         >> "$OUT/existing-docs.txt"
    echo ""          >> "$OUT/existing-docs.txt"
  done

# ---------------------------------------------------------------------------
# 12. README
# ---------------------------------------------------------------------------
echo ">> [12/13] README"
> "$OUT/readme.txt"
for f in README.md README.txt README; do
  [ -f "$f" ] && { echo "=== $f ==="; cat "$f"; echo ""; } >> "$OUT/readme.txt" || true
done

# ---------------------------------------------------------------------------
# 13. Git history summary
# ---------------------------------------------------------------------------
echo ">> [13/13] git history"
git log --oneline -50 2>/dev/null > "$OUT/git-log.txt" \
  || echo "not a git repository" > "$OUT/git-log.txt"


# ---------------------------------------------------------------------------
# Summary
# ---------------------------------------------------------------------------
echo ""
echo "=== EXTRACTION COMPLETE ==="
echo ""
echo "Files written to $OUT/:"
ls -lh "$OUT/"
echo ""
echo "Next step:"
echo "  Open an AI session with your codebase and paste the governance"
echo "  onboarding audit prompt, referencing the files in $OUT/"
echo ""
echo "Baseline commit to record:"
git rev-parse HEAD 2>/dev/null || echo "no git commit found"
