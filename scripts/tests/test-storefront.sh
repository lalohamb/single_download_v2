#!/usr/bin/env bash
# =============================================================================
# test-storefront.sh
# Smoke tests for public-facing storefront pages and API routes.
# Checks that pages return 200 and key API routes are reachable.
#
# Usage:
#   chmod +x scripts/tests/test-storefront.sh
#   ./scripts/tests/test-storefront.sh https://bodyandsleeves.com
# =============================================================================

BASE_URL="${1:-https://bodyandsleeves.com}"

GREEN='\033[0;32m'
RED='\033[0;31m'
NC='\033[0m'

pass=0
fail=0

check() {
  local label="$1"
  local url="$2"
  local expected="${3:-200}"

  status=$(curl -s -o /dev/null -w "%{http_code}" -L "$url")

  if [ "$status" = "$expected" ]; then
    echo -e "${GREEN}✓${NC} [$status] $label"
    ((pass++))
  else
    echo -e "${RED}✗${NC} [$status, expected $expected] $label"
    ((fail++))
  fi
}

echo ""
echo "============================================"
echo " Storefront Smoke Tests"
echo " Base URL: $BASE_URL"
echo "============================================"
echo ""

# Public pages
check "Homepage"           "$BASE_URL/"
check "Shop"               "$BASE_URL/shop"
check "About"              "$BASE_URL/about"
check "Track order"        "$BASE_URL/track"
check "Privacy policy"     "$BASE_URL/privacy-policy"
check "Terms of service"   "$BASE_URL/terms-of-service"
check "Refund policy"      "$BASE_URL/refund-policy"
check "Sitemap"            "$BASE_URL/sitemap.xml"
check "Robots.txt"         "$BASE_URL/robots.txt"

# Admin login page (should be 200, not redirect loop)
check "Admin login"        "$BASE_URL/admin"

# Public API routes (no auth needed)
check "Stripe mode API"    "$BASE_URL/api/stripe-mode" "401"
check "SEO API"            "$BASE_URL/api/seo" "401"

echo ""
echo "============================================"
echo " Results: ${pass} passed, ${fail} failed"
echo "============================================"
echo ""

[ "$fail" -gt 0 ] && exit 1 || exit 0
