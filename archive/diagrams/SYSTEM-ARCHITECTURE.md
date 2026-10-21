# System Architecture

```mermaid
graph TB
  subgraph Customer["👤 Customer / Browser"]
    Browser["Browser\n(React 19 / Next.js RSC)"]
  end

  subgraph Admin["🔐 Admin / Browser"]
    AdminBrowser["Browser\n(/admin/* routes)"]
  end

  subgraph VPS["🖥️  VPS — DigitalOcean Droplet (1 vCPU / 2 GB)\nbodyandsleeves.com"]
    Nginx["nginx 1.18.0\n(reverse proxy + TLS termination)"]
    PM2["PM2\n(process manager)"]
    NextJS["Next.js 15 Standalone\nserver.js (port 3000)"]
    EnvLocal[".env.local\n(bootstrap secrets)"]

    Nginx -->|"proxy_pass :3000"| PM2
    PM2 --> NextJS
    NextJS -.->|"read at startup"| EnvLocal
  end

  subgraph Supabase["☁️  Supabase Cloud"]
    SupabaseAuth["Auth\n(JWT, magic link, OAuth)"]
    SupabaseDB["PostgreSQL DB\n(14 tables + RLS)"]
    SupabaseStorage["Storage\n(image uploads)"]

    subgraph EdgeFunctions["Edge Functions (Deno)"]
      FnStripeCheckout["stripe-checkout\n(create session + pending order)"]
      FnStripeWebhook["stripe-webhook\n(paid → fulfill → email)"]
      FnPrintifyProxy["printify-proxy\n(admin product sync, JWT required)"]
      FnPrintifyWebhook["printify-webhook\n(product publish + shipment events)"]
    end

    EdgeFunctions -->|"service_role"| SupabaseDB
  end

  subgraph ExternalServices["☁️  External Services"]
    Stripe["Stripe\n(Checkout, Webhooks)"]
    Printify["Printify\n(POD fulfillment)"]
    Resend["Resend\n(transactional email)"]
    MailerLite["MailerLite\n(newsletter)"]
    MetaCAPI["Meta CAPI\n(Purchase events)"]
    GA4["Google Analytics 4\n(gtag.js)"]
    FacebookPixel["Facebook Pixel\n(browser events)"]
  end

  %% ── Browser → VPS ────────────────────────────────────────────────────────
  Browser -->|"HTTPS"| Nginx
  AdminBrowser -->|"HTTPS"| Nginx

  %% ── Next.js → Supabase ───────────────────────────────────────────────────
  NextJS -->|"supabase-js\nanon_key (public reads)"| SupabaseDB
  NextJS -->|"supabase-js\nservice_role (admin routes)"| SupabaseDB
  NextJS -->|"supabase-js"| SupabaseAuth
  NextJS -->|"supabase-js"| SupabaseStorage

  %% ── Next.js → Edge Functions ─────────────────────────────────────────────
  NextJS -->|"POST (CORS restricted\nto SITE_URL)"| FnStripeCheckout
  NextJS -->|"POST (JWT required)"| FnPrintifyProxy

  %% ── Stripe → Edge Functions ──────────────────────────────────────────────
  Stripe -->|"POST webhook\n(stripe-signature)"| FnStripeWebhook

  %% ── Printify → Edge Functions ────────────────────────────────────────────
  Printify -->|"POST webhook\n(product:publish\norder:shipment:*)"| FnPrintifyWebhook

  %% ── Edge Functions → External ────────────────────────────────────────────
  FnStripeCheckout -->|"REST API"| Stripe
  FnStripeCheckout -->|"shipping quote"| Printify
  FnStripeWebhook -->|"REST API"| Printify
  FnStripeWebhook -->|"POST /emails"| Resend
  FnStripeWebhook -->|"POST /subscribers"| MailerLite
  FnStripeWebhook -->|"POST /events"| MetaCAPI
  FnPrintifyProxy -->|"REST API"| Printify
  FnPrintifyWebhook -->|"REST API"| Printify
  FnPrintifyWebhook -->|"POST /emails"| Resend

  %% ── Browser → External ───────────────────────────────────────────────────
  Browser -->|"gtag.js"| GA4
  Browser -->|"fbq()"| FacebookPixel
  Browser -->|"Stripe.js"| Stripe

  %% ── Deploy path ──────────────────────────────────────────────────────────
  GitHub["GitHub\ngithub.com/lalohamb/\nsingleuse-download-v1"]
  GitHub -->|"git pull\n(deploy.sh)"| VPS
```

---

## Connection Summary

| From | To | Protocol | Auth | Notes |
|---|---|---|---|---|
| Browser | nginx | HTTPS | — | TLS terminated at nginx |
| nginx | Next.js | HTTP | — | Internal proxy_pass :3000 |
| Next.js | Supabase DB | HTTPS (supabase-js) | anon_key | Public reads (storefront) |
| Next.js | Supabase DB | HTTPS (supabase-js) | service_role | Admin routes, bypasses RLS |
| Next.js | stripe-checkout | HTTPS | CORS (SITE_URL) | Cart → checkout |
| Next.js | printify-proxy | HTTPS | JWT (admin only) | Product sync |
| Stripe | stripe-webhook | HTTPS | stripe-signature | Payment events |
| Printify | printify-webhook | HTTPS | none | Product + order events |
| stripe-webhook | Printify | HTTPS | Bearer token | Order submission |
| stripe-webhook | Resend | HTTPS | Bearer API key | Order confirmation email |
| stripe-webhook | MailerLite | HTTPS | Bearer API key | Newsletter opt-in |
| stripe-webhook | Meta CAPI | HTTPS | Bearer access token | Purchase event |
| printify-webhook | Resend | HTTPS | Bearer API key | Shipping notification |
| Browser | Stripe.js | HTTPS | publishable key | Card collection |
| Browser | GA4 | HTTPS | measurement_id | Analytics |
| Browser | Facebook Pixel | HTTPS | pixel_id | Ad tracking |

---

## Secret Storage Locations

| Secret | Stored In | Used By |
|---|---|---|
| `SUPABASE_SERVICE_ROLE_KEY` | `.env.local` + PM2 env | Next.js admin routes |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | `.env.local` + PM2 env | Next.js public reads |
| `STRIPE_SECRET_KEY` | Supabase edge fn secrets (synced from DB on deploy) | stripe-checkout, stripe-webhook |
| `STRIPE_WEBHOOK_SECRET` | Supabase edge fn secrets | stripe-webhook |
| `PRINTIFY_API_TOKEN` | Supabase edge fn secrets | printify-proxy, printify-webhook |
| `RESEND_API_KEY` | Supabase edge fn secrets + DB settings ⚠️ | stripe-webhook, printify-webhook |
| `MAILER_LITE_API_KEY` | Supabase edge fn secrets | stripe-webhook |
| `FACEBOOK_ACCESS_TOKEN` | Supabase edge fn secrets | stripe-webhook |
| `SUPABASE_ACCESS_TOKEN` | `.env.local` | deploy.sh (edge fn deploy) |

> ⚠️ `RESEND_API_KEY` is also stored in `settings.resend_api_key` (DB). Currently included in `settings_public` view — should be excluded in a follow-up migration.
