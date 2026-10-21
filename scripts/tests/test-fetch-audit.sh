#!/usr/bin/env bash
# =============================================================================
# test-fetch-audit.sh
# Scans the codebase for any remaining plain fetch() calls to /api/ routes
# inside admin pages that should be using fetchAdmin() instead.
#
# Usage:
#   chmod +x scripts/tests/test-fetch-audit.sh
#   ./scripts/tests/test-fetch-audit.sh
# =============================================================================

GREEN='\033[0;32m'
RED='\033[0;31m'
NC='\033[0m'

ADMIN_DIR="src/app/admin"

echo ""
echo "============================================"
echo " Unprotected fetch() Audit"
echo " Scanning: $ADMIN_DIR"
echo "============================================"
echo ""

# Find plain fetch("/api/...) calls that are NOT fetchAdmin and NOT already
# passing Authorization header on the same or adjacent line
# Uses a Python script for multi-line context awareness
results=$(python3 - <<'PYEOF'
import subprocess, re, sys

files = subprocess.check_output(
    ['grep', '-rl', 'fetch("/api/', 'src/app/admin', '--include=*.tsx', '--include=*.ts'],
    text=True
).strip().split('\n')

findings = []
for fpath in files:
    if not fpath:
        continue
    with open(fpath) as f:
        lines = f.readlines()
    for i, line in enumerate(lines):
        if 'fetch("/api/' not in line:
            continue
        if 'fetchAdmin' in line:
            continue
        if '//.*fetch' in line:
            continue
        # Check surrounding 3 lines for auth patterns
        context = ''.join(lines[max(0,i-1):i+4])
        if any(p in context for p in ['Authorization', 'authHeader', 'Bearer', 'fetchAdmin']):
            continue
        findings.append(f"{fpath}:{i+1}:{line.rstrip()}")

if findings:
    print('\n'.join(findings))
PYEOF
)

if [ -z "$results" ]; then
  echo -e "${GREEN}✓ No unprotected fetch calls found.${NC}"
  echo ""
  exit 0
else
  echo -e "${RED}✗ Unprotected fetch calls found:${NC}"
  echo ""
  echo "$results"
  echo ""
  echo "Fix: replace fetch(\"/api/...\") with fetchAdmin(\"/api/...\")"
  echo "Import: import { fetchAdmin } from \"@/lib/fetch-admin\";"
  echo ""
  exit 1
fi
