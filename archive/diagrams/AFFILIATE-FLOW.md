# Affiliate Program Flow

```mermaid
sequenceDiagram
  autonumber
  actor Affiliate
  actor Customer
  participant Browser
  participant NextJS as Next.js App
  participant DB as Supabase DB
  participant StripeCheckout as stripe-checkout<br/>(Edge Fn)
  participant StripeWebhook as stripe-webhook<br/>(Edge Fn)
  participant Resend
  actor Admin

  %% ── 1. Affiliate signup ──────────────────────────────────────────────────
  Affiliate->>NextJS: POST /api/affiliates/apply (name, email, platform_url, follower_count)
  NextJS->>DB: INSERT affiliates (status=pending, code=generated)
  DB-->>NextJS: { id, code }
  NextJS-->>Affiliate: Application received

  Admin->>DB: UPDATE affiliates SET status=active (manual approval)

  %% ── 2. Affiliate shares link ─────────────────────────────────────────────
  Affiliate->>Browser: Share link: https://store.com/?ref=AFFILIATECODE

  %% ── 3. Click tracking ────────────────────────────────────────────────────
  Customer->>Browser: Click affiliate link
  Browser->>NextJS: GET /?ref=AFFILIATECODE
  NextJS->>DB: INSERT affiliate_clicks (code, referrer, user_agent)
  NextJS->>Browser: Set cookie: affiliate_code=AFFILIATECODE (30-day)
  Note over Browser: AffiliateTracker component reads ?ref param<br/>and stores in localStorage + cookie

  %% ── 4. Customer browses + adds to cart ───────────────────────────────────
  Customer->>Browser: Browse shop, add items to cart
  Browser->>Browser: Read affiliate_code from localStorage/cookie

  %% ── 5. Checkout with attribution ─────────────────────────────────────────
  Browser->>StripeCheckout: POST stripe-checkout (items, ..., affiliate_code, attribution)
  StripeCheckout->>DB: INSERT orders (affiliate_code=AFFILIATECODE, utm_source, ...)
  StripeCheckout-->>Browser: Stripe session URL

  %% ── 6. Payment + conversion ──────────────────────────────────────────────
  Customer->>Browser: Pay on Stripe
  Browser->>StripeWebhook: (via Stripe) checkout.session.completed

  StripeWebhook->>DB: UPDATE orders SET status=paid
  StripeWebhook->>DB: SELECT affiliates WHERE code=AFFILIATECODE AND status=active
  DB-->>StripeWebhook: { id, commission_rate, email }

  StripeWebhook->>DB: INSERT affiliate_conversions (affiliate_id, order_id, commission_amount, status=pending)

  StripeWebhook->>Resend: POST /emails (affiliate commission notification)
  Resend-->>Affiliate: "You earned $X — new sale!" email

  %% ── 7. Admin reviews + approves ──────────────────────────────────────────
  Note over Admin: 14-day review window
  Admin->>DB: UPDATE affiliate_conversions SET status=approved, approved_at=now()

  %% ── 8. Payout batch ──────────────────────────────────────────────────────
  Admin->>DB: INSERT affiliate_payouts (affiliate_id, period, total_amount, payout_method, payout_handle)
  Admin->>DB: UPDATE affiliate_conversions SET status=paid, payout_id=..., paid_at=now()
  Admin->>Affiliate: Manual payout (CashApp / PayPal / Venmo / Zelle)
```

---

## Affiliate Data Model Relationships

```
affiliates
  │
  ├──► affiliate_clicks        (every link click, no auth required)
  │      code, referrer, user_agent, created_at
  │
  ├──► affiliate_conversions   (one per paid order)
  │      affiliate_id, order_id, order_subtotal, commission_amount
  │      status: pending → approved → paid | voided
  │      payout_id (FK → affiliate_payouts, set when paid)
  │
  └──► affiliate_payouts       (monthly batch)
         affiliate_id, period ("2025-01"), total_amount
         payout_method, payout_handle, stripe_memo
         status: pending → paid
```

---

## Attribution Cookie Lifecycle

```
Customer lands on /?ref=CODE
        │
        ▼
AffiliateTracker component (client-side)
        │
        ├── localStorage.setItem('affiliate_code', CODE)
        ├── document.cookie = 'affiliate_code=CODE; max-age=2592000' (30 days)
        └── INSERT affiliate_clicks (fire-and-forget)
                │
                ▼
        Customer adds to cart
                │
                ▼
        CartDrawer / checkout reads localStorage('affiliate_code')
                │
                ▼
        Passed as affiliate_code in stripe-checkout POST body
                │
                ▼
        Stored on orders.affiliate_code
                │
                ▼
        stripe-webhook reads orders.affiliate_code → creates conversion
```

---

## Commission Calculation

```
commission_amount = ROUND(order.subtotal × affiliate.commission_rate, 2)

Default commission_rate = 0.10 (10%)

Example:
  order.subtotal     = $89.97
  commission_rate    = 0.10
  commission_amount  = $8.997 → rounded to $9.00
```

---

## Conversion Status Flow

```
pending   ← INSERT by stripe-webhook on checkout.session.completed
    │
    │  Admin reviews (14-day window)
    ▼
approved  ← Admin UPDATE
    │
    │  Admin creates payout batch
    ▼
paid      ← Admin UPDATE (payout_id set, paid_at set)

OR

voided    ← Admin UPDATE (refund / fraud / dispute)
```
