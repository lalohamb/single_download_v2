#!/usr/bin/env bash
# =============================================================================
# test-admin-auth.sh
# Tests that all protected admin API routes return 401 without a token,
# and 200 (or non-401) with a valid Bearer token.
#
# Usage:
#   chmod +x scripts/tests/test-admin-auth.sh
#   ./scripts/tests/test-admin-auth.sh https://bodyandsleeves.com <your-bearer-token>
#
# Get your bearer token from the browser console while logged into /admin:
#   localStorage.getItem('sb-bdazupyepobieyjzuamf-auth-token')
#   Then parse the JSON and copy the access_token value.
# =============================================================================

BASE_URL="${1:-https://bodyandsleeves.com}"
TOKEN="${2:-}"

GREEN='\033[0;32m'
RED='\033[0;31m'
YELLOW='\033[1;33m'
NC='\033[0m'

pass=0
fail=0
skip=0

check() {
  local label="$1"
  local url="$2"
  local method="${3:-GET}"
  local body="${4:-}"

  # Test WITHOUT token — expect 401
  if [ -n "$body" ]; then
    status_no_auth=$(curl -s -o /dev/null -w "%{http_code}" -X "$method" \
      -H "Content-Type: application/json" -d "$body" "$url")
  else
    status_no_auth=$(curl -s -o /dev/null -w "%{http_code}" -X "$method" "$url")
  fi

  if [ "$status_no_auth" = "401" ]; then
    echo -e "${GREEN}✓${NC} [No token → 401] $label"
    ((pass++))
  else
    echo -e "${RED}✗${NC} [No token → $status_no_auth, expected 401] $label"
    ((fail++))
  fi

  # Test WITH token — expect anything except 401
  if [ -n "$TOKEN" ]; then
    if [ -n "$body" ]; then
      status_with_auth=$(curl -s -o /dev/null -w "%{http_code}" -X "$method" \
        -H "Content-Type: application/json" \
        -H "Authorization: Bearer $TOKEN" \
        -d "$body" "$url")
    else
      status_with_auth=$(curl -s -o /dev/null -w "%{http_code}" -X "$method" \
        -H "Authorization: Bearer $TOKEN" "$url")
    fi

    if [ "$status_with_auth" != "401" ]; then
      echo -e "${GREEN}✓${NC} [With token → $status_with_auth] $label"
      ((pass++))
    else
      echo -e "${RED}✗${NC} [With token → 401, expected non-401] $label"
      ((fail++))
    fi
  else
    echo -e "${YELLOW}~${NC} [With token → skipped, no token provided] $label"
    ((skip++))
  fi
}

echo ""
echo "============================================"
echo " Admin API Auth Tests"
echo " Base URL: $BASE_URL"
echo "============================================"
echo ""

check "GET /api/stripe-mode"           "$BASE_URL/api/stripe-mode"
check "GET /api/stripe-setup"          "$BASE_URL/api/stripe-setup"
check "GET /api/stripe-admin balance"  "$BASE_URL/api/stripe-admin?action=balance"
check "GET /api/shipping-diagnostic"   "$BASE_URL/api/shipping-diagnostic"
check "GET /api/admin/customers"       "$BASE_URL/api/admin/customers"
check "GET /api/admin/email-settings"  "$BASE_URL/api/admin/email-settings"
check "GET /api/admin/manage"          "$BASE_URL/api/admin/manage"
check "GET /api/seo"                   "$BASE_URL/api/seo"
check "GET /api/mailerlite groups"     "$BASE_URL/api/mailerlite?action=groups"
check "GET /api/resend domains"        "$BASE_URL/api/resend?path=/domains"
check "GET /api/affiliates"            "$BASE_URL/api/affiliates"
check "GET /api/affiliates/payouts"    "$BASE_URL/api/affiliates/payouts"
check "POST /api/revalidate"           "$BASE_URL/api/revalidate" "POST" '{"paths":["/"]}'

echo ""
echo "============================================"
echo " Results: ${pass} passed, ${fail} failed, ${skip} skipped"
echo "============================================"
echo ""

[ "$fail" -gt 0 ] && exit 1 || exit 0
