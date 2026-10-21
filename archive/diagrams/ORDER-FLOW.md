# Order Flow — Full Lifecycle Sequence

```mermaid
sequenceDiagram
  autonumber
  actor Customer
  participant Browser
  participant NextJS as Next.js App (VPS)
  participant StripeCheckout as stripe-checkout<br/>(Edge Fn)
  participant Stripe
  participant StripeWebhook as stripe-webhook<br/>(Edge Fn)
  participant DB as Supabase DB
  participant Printify
  participant PrintifyWebhook as printify-webhook<br/>(Edge Fn)
  participant Resend
  participant MetaCAPI as Meta CAPI
  participant MailerLite

  %% ── 1. Cart → Checkout ───────────────────────────────────────────────────
  Customer->>Browser: Add items to cart
  Browser->>NextJS: POST /checkout (cart items, email, address)
  NextJS->>StripeCheckout: POST stripe-checkout (items, shipping_address, email, affiliate_code, attribution)

  %% ── 2. Server-side price verification ───────────────────────────────────
  StripeCheckout->>DB: SELECT products WHERE id IN (cart ids) AND status='active'
  DB-->>StripeCheckout: Authoritative prices + printify_ids
  StripeCheckout->>Printify: POST /orders/shipping.json (live quote)
  Printify-->>StripeCheckout: Shipping cost (cents)

  %% ── 3. Stripe session creation ───────────────────────────────────────────
  StripeCheckout->>Stripe: Create checkout session (verified prices, shipping)
  Stripe-->>StripeCheckout: session.id + session.url
  StripeCheckout->>DB: INSERT orders (status=pending, stripe_session_id)
  StripeCheckout-->>Browser: { url, session_id }
  Browser->>Stripe: Redirect to Stripe Checkout

  %% ── 4. Customer pays ─────────────────────────────────────────────────────
  Customer->>Stripe: Enter card + pay
  Stripe-->>Browser: Redirect to /checkout/success?session_id=...
  Browser->>NextJS: GET /checkout/success

  %% ── 5. Stripe webhook: checkout.session.completed ────────────────────────
  Stripe->>StripeWebhook: POST checkout.session.completed (signed)
  StripeWebhook->>StripeWebhook: Verify stripe-signature
  StripeWebhook->>Stripe: Retrieve session (expand discounts)
  Stripe-->>StripeWebhook: Expanded session (discount_amount, discount_code)
  StripeWebhook->>DB: UPDATE orders SET status=paid, payment_intent_id, discount_*

  %% ── 6. Affiliate conversion ──────────────────────────────────────────────
  alt affiliate_code present
    StripeWebhook->>DB: SELECT affiliates WHERE code=affiliate_code AND status=active
    DB-->>StripeWebhook: affiliate (id, commission_rate, email)
    StripeWebhook->>DB: INSERT affiliate_conversions (pending)
    StripeWebhook->>Resend: POST /emails (affiliate commission notification)
  end

  %% ── 7. Meta CAPI Purchase event ──────────────────────────────────────────
  alt FACEBOOK_ACCESS_TOKEN set
    StripeWebhook->>MetaCAPI: POST Purchase event (hashed email, value, order_id)
  end

  %% ── 8. MailerLite newsletter opt-in ─────────────────────────────────────
  alt marketing_opt_in=true
    StripeWebhook->>MailerLite: POST /subscribers (email, first_name, group_id)
  end

  %% ── 9. Order confirmation email ──────────────────────────────────────────
  StripeWebhook->>DB: SELECT orders.items (for image_url)
  DB-->>StripeWebhook: Full order items
  StripeWebhook->>Resend: POST /emails (order confirmation HTML)
  Resend-->>Customer: Order confirmed email

  %% ── 10. Printify fulfillment ─────────────────────────────────────────────
  alt PRINTIFY_API_TOKEN set
    StripeWebhook->>Printify: POST /shops/{id}/orders.json (line_items, address_to)
    Printify-->>StripeWebhook: { id: printify_order_id }
    StripeWebhook->>DB: UPDATE orders SET printify_order_id, fulfillment_status=pending
  end

  %% ── 11. Printify ships ───────────────────────────────────────────────────
  Printify->>PrintifyWebhook: POST order:shipment:created (tracking_number, tracking_url)
  PrintifyWebhook->>DB: UPDATE orders SET fulfillment_status=shipped, tracking_*
  PrintifyWebhook->>DB: SELECT settings (store_name, email_from, email_support)
  PrintifyWebhook->>Resend: POST /emails (shipping notification + tracking link)
  Resend-->>Customer: Your order has shipped email

  %% ── 12. Printify delivers ────────────────────────────────────────────────
  Printify->>PrintifyWebhook: POST order:fulfilled
  PrintifyWebhook->>DB: UPDATE orders SET status=fulfilled, fulfillment_status=fulfilled

  %% ── 13. Payment failure path ─────────────────────────────────────────────
  alt payment_intent.payment_failed
    Stripe->>StripeWebhook: POST payment_intent.payment_failed
    StripeWebhook->>DB: UPDATE orders SET status=cancelled
  end
```

---

## Order Status State Machine

```
                    ┌─────────┐
                    │ pending │  ← INSERT by stripe-checkout
                    └────┬────┘
                         │ checkout.session.completed
                         ▼
                    ┌─────────┐
                    │  paid   │  ← UPDATE by stripe-webhook
                    └────┬────┘
                         │ POST to Printify
                         ▼
               ┌──────────────────┐
               │ fulfillment:     │
               │  in-production   │  ← order:created webhook
               └────────┬─────────┘
                        │ order:shipment:created
                        ▼
               ┌──────────────────┐
               │ fulfillment:     │
               │  shipped         │  ← tracking_number set
               └────────┬─────────┘
                        │ order:fulfilled
                        ▼
               ┌──────────────────┐
               │   fulfilled      │  ← terminal success state
               └──────────────────┘

  payment_intent.payment_failed → cancelled  (terminal failure state)
  order:cancelled               → cancelled  (terminal failure state)
```

---

## Key Data Passed Through Stripe Metadata

Stripe session metadata is the handoff between `stripe-checkout` and `stripe-webhook`. Fields are limited to 500 chars each.

| Field | Source | Used by |
|---|---|---|
| `email` | Customer input | Confirmation email, Printify address |
| `shipping_name` | Customer input | Printify address, email greeting |
| `shipping_address` | Customer input (JSON) | Printify address_to |
| `items` | Verified DB items (JSON) | Printify line_items, email HTML |
| `shipping_cost` | Live Printify quote | Order record |
| `subtotal` / `total` | Server-computed | Order record |
| `affiliate_code` | Cookie attribution | Conversion record |
| `marketing_opt_in` | Checkout checkbox | MailerLite subscribe |
| `phone` | Stripe phone collection | Printify address |
