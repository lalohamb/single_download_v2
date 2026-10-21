# SEO Transfer — Exact Implementation Guide

This document transfers SEO, analytics, Facebook Pixel, GA4, and checkout UX features
into a new repository that is a copy of this codebase.

**Do NOT modify any product, store settings, Printify, or fulfillment logic.**

---

## STEP 1 — Run Database Migrations

Run these in order in your Supabase SQL editor.

```sql
-- 1a. seo_settings table
create table if not exists seo_settings (
  id uuid primary key default gen_random_uuid(),
  site_url text not null default 'https://your-store.example',
  default_og_image text,
  sitemap_enabled boolean not null default true,
  robots_noindex_admin boolean not null default true,
  jsonld_enabled boolean not null default true,
  canonical_enabled boolean not null default true,
  meta_title_suffix text not null default '| Your Store',
  twitter_handle text default '@yourstore',
  google_site_verification text,
  updated_at timestamptz not null default now()
);
insert into seo_settings (id) values ('00000000-0000-0000-0000-000000000001')
  on conflict (id) do nothing;
alter table seo_settings enable row level security;
create policy "admins_all" on seo_settings for all using (true) with check (true);

-- 1b. Facebook Pixel ID
alter table seo_settings add column if not exists facebook_pixel_id text default '';

-- 1c. GA4 Measurement ID
alter table seo_settings add column if not exists ga_measurement_id text default '';

-- 1d. Facebook Domain Verification
alter table seo_settings add column if not exists facebook_domain_verification text default '';

-- 1e. Discount fields on orders
alter table orders
  add column if not exists discount_code text,
  add column if not exists discount_amount numeric(10,2) default 0;

-- 1f. UTM attribution + marketing consent on orders
alter table orders
  add column if not exists marketing_opt_in boolean not null default false,
  add column if not exists utm_source       text,
  add column if not exists utm_medium       text,
  add column if not exists utm_campaign     text,
  add column if not exists utm_content      text,
  add column if not exists utm_term         text,
  add column if not exists referrer         text,
  add column if not exists landing_page     text,
  add column if not exists first_touch      jsonb,
  add column if not exists last_touch       jsonb;
create index if not exists idx_orders_utm_source      on orders(utm_source);
create index if not exists idx_orders_utm_campaign    on orders(utm_campaign);
create index if not exists idx_orders_marketing_optin on orders(marketing_opt_in);

-- 1g. Shipments column on orders
alter table orders add column if not exists shipments jsonb default '[]'::jsonb;
```

---

## STEP 2 — Copy These Files Verbatim

Copy each file from the source repository to the **identical path** in the new repository.
No renaming, no moving — same folder structure, same filename.

| Source (copy from) | Destination (paste to) |
|---|---|
| `src/lib/analytics.ts` | `src/lib/analytics.ts` |
| `src/components/FacebookPixel.tsx` | `src/components/FacebookPixel.tsx` |
| `src/components/GoogleAnalytics.tsx` | `src/components/GoogleAnalytics.tsx` |
| `src/app/sitemap.ts` | `src/app/sitemap.ts` |
| `src/app/robots.ts` | `src/app/robots.ts` |
| `src/app/api/seo/route.ts` | `src/app/api/seo/route.ts` |
| `src/app/admin/seo/page.tsx` | `src/app/admin/seo/page.tsx` |

If the destination folder does not exist, create it first.
The file contents are listed below for reference — but copying the actual files directly is preferred over recreating them from the code blocks.

---

### `src/lib/analytics.ts`

```ts
declare global {
  interface Window {
    gtag: (...args: unknown[]) => void;
    dataLayer: unknown[];
  }
}

export function gtag(...args: unknown[]) {
  if (typeof window !== "undefined" && typeof window.gtag === "function") {
    window.gtag(...args);
  }
}

export function trackPageView(url: string, measurementId: string) {
  gtag("config", measurementId, { page_path: url });
}

export function trackViewItem(product: { id: string; title: string; price: number; category?: string }) {
  gtag("event", "view_item", {
    currency: "USD",
    value: product.price,
    items: [{ item_id: product.id, item_name: product.title, price: product.price, item_category: product.category }],
  });
}

export function trackAddToCart(product: { id: string; title: string; price: number; variantId: string; variantLabel: string; quantity: number }) {
  gtag("event", "add_to_cart", {
    currency: "USD",
    value: product.price * product.quantity,
    items: [{ item_id: product.id, item_name: product.title, item_variant: product.variantLabel, price: product.price, quantity: product.quantity }],
  });
}

export function trackBeginCheckout(items: Array<{ id: string; title: string; price: number; variantLabel: string; quantity: number }>, value: number) {
  gtag("event", "begin_checkout", {
    currency: "USD",
    value,
    items: items.map((i) => ({ item_id: i.id, item_name: i.title, item_variant: i.variantLabel, price: i.price, quantity: i.quantity })),
  });
}

export function trackPurchase(orderId: string, value: number, items: Array<{ id: string; title: string; price: number; variantLabel: string; quantity: number }>) {
  gtag("event", "purchase", {
    transaction_id: orderId,
    currency: "USD",
    value,
    items: items.map((i) => ({ item_id: i.id, item_name: i.title, item_variant: i.variantLabel, price: i.price, quantity: i.quantity })),
  });
}

export function trackSearch(searchTerm: string) {
  gtag("event", "search", { search_term: searchTerm });
}

export function trackSignUp(method = "email") {
  gtag("event", "sign_up", { method });
}

export function trackGenerateLead() {
  gtag("event", "generate_lead");
}
```

---

### `src/components/FacebookPixel.tsx`

```tsx
"use client";
import { useEffect, useRef } from "react";
import { usePathname } from "next/navigation";
import Script from "next/script";

declare global {
  interface Window {
    fbq: ((...args: unknown[]) => void) & { loaded?: boolean };
    _fbq: unknown;
  }
}

export function fbq(...args: unknown[]) {
  if (typeof window !== "undefined" && typeof window.fbq === "function") {
    window.fbq(...args);
  }
}

export default function FacebookPixel({ pixelId }: { pixelId: string }) {
  const pathname = usePathname();
  const isFirst = useRef(true);
  const lastPathname = useRef("");

  useEffect(() => {
    if (isFirst.current) { isFirst.current = false; return; }
    if (lastPathname.current === pathname) return;
    lastPathname.current = pathname;
    fbq("track", "PageView");
  }, [pathname]);

  if (!pixelId) return null;

  return (
    <>
      <Script id="fb-pixel" strategy="afterInteractive" dangerouslySetInnerHTML={{
        __html: `
          !function(f,b,e,v,n,t,s)
          {if(f.fbq)return;n=f.fbq=function(){n.callMethod?
          n.callMethod.apply(n,arguments):n.queue.push(arguments)};
          if(!f._fbq)f._fbq=n;n.push=n;n.loaded=!0;n.version='2.0';
          n.queue=[];t=b.createElement(e);t.async=!0;
          t.src=v;s=b.getElementsByTagName(e)[0];
          s.parentNode.insertBefore(t,s)}(window, document,'script',
          'https://connect.facebook.net/en_US/fbevents.js');
          fbq('init', '${pixelId}');
          fbq('track', 'PageView');
        `,
      }} />
      <noscript>
        <img height="1" width="1" style={{ display: "none" }}
          src={`https://www.facebook.com/tr?id=${pixelId}&ev=PageView&noscript=1`} alt="" />
      </noscript>
    </>
  );
}
```

---

### `src/components/GoogleAnalytics.tsx`

```tsx
"use client";
import { useEffect } from "react";
import { usePathname } from "next/navigation";
import Script from "next/script";
import { trackPageView } from "@/lib/analytics";

export default function GoogleAnalytics({ measurementId }: { measurementId: string }) {
  const pathname = usePathname();

  useEffect(() => {
    if (!measurementId) return;
    trackPageView(pathname, measurementId);
  }, [pathname, measurementId]);

  if (!measurementId) return null;

  return (
    <>
      <Script
        src={`https://www.googletagmanager.com/gtag/js?id=${measurementId}`}
        strategy="afterInteractive"
      />
      <Script id="ga4-init" strategy="afterInteractive">
        {`window.dataLayer=window.dataLayer||[];function gtag(){dataLayer.push(arguments);}gtag('js',new Date());gtag('config','${measurementId}',{send_page_view:false});`}
      </Script>
    </>
  );
}
```

---

### `src/app/sitemap.ts`

```ts
import { MetadataRoute } from "next";
import { createClient } from "@supabase/supabase-js";

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
);

export const revalidate = 3600;

export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const [seoRes, productsRes] = await Promise.all([
    supabase.from("seo_settings").select("site_url, sitemap_enabled").limit(1).maybeSingle(),
    supabase.from("products").select("id, updated_at").eq("status", "active"),
  ]);

  const base = (seoRes.data?.site_url || "https://your-store.example").replace(/\/$/, "");
  if (!seoRes.data?.sitemap_enabled) return [];

  const staticRoutes: MetadataRoute.Sitemap = [
    { url: base, lastModified: new Date(), changeFrequency: "daily", priority: 1 },
    { url: `${base}/shop`, lastModified: new Date(), changeFrequency: "daily", priority: 0.9 },
    { url: `${base}/about`, lastModified: new Date(), changeFrequency: "monthly", priority: 0.6 },
    { url: `${base}/refund-policy`, lastModified: new Date(), changeFrequency: "yearly", priority: 0.3 },
    { url: `${base}/terms-of-service`, lastModified: new Date(), changeFrequency: "yearly", priority: 0.3 },
  ];

  const productRoutes: MetadataRoute.Sitemap = (productsRes.data || []).map((p) => ({
    url: `${base}/product/${p.id}`,
    lastModified: new Date(p.updated_at),
    changeFrequency: "weekly",
    priority: 0.8,
  }));

  return [...staticRoutes, ...productRoutes];
}
```

---

### `src/app/robots.ts`

```ts
import { MetadataRoute } from "next";
import { createClient } from "@supabase/supabase-js";

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
);

export const revalidate = 3600;

export default async function robots(): Promise<MetadataRoute.Robots> {
  const { data } = await supabase
    .from("seo_settings")
    .select("site_url, robots_noindex_admin")
    .limit(1)
    .maybeSingle();

  const base = (data?.site_url || "https://your-store.example").replace(/\/$/, "");
  const disallow = data?.robots_noindex_admin !== false
    ? ["/admin/", "/checkout/", "/api/"]
    : ["/checkout/", "/api/"];

  return {
    rules: [{ userAgent: "*", allow: "/", disallow }],
    sitemap: `${base}/sitemap.xml`,
  };
}
```

---

### `src/app/api/seo/route.ts`

```ts
import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { requireAdmin } from "@/lib/require-admin";

export const runtime = "nodejs";

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
);

const serviceSupabase = () =>
  createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { autoRefreshToken: false, persistSession: false } }
  );

export async function GET(req: NextRequest) {
  const action = req.nextUrl.searchParams.get("action");

  if (action === "sitemap_products") {
    const { data } = await supabase
      .from("products")
      .select("id, updated_at")
      .eq("status", "active");
    return NextResponse.json(data || []);
  }

  const { data, error } = await supabase
    .from("seo_settings")
    .select("*")
    .limit(1)
    .maybeSingle();
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json(data);
}

const SEO_ALLOWED_FIELDS = new Set([
  "site_url", "default_og_image", "sitemap_enabled", "robots_noindex_admin",
  "jsonld_enabled", "canonical_enabled", "meta_title_suffix", "twitter_handle",
  "google_site_verification", "facebook_pixel_id", "ga_measurement_id", "facebook_domain_verification",
]);

export async function POST(req: NextRequest) {
  const authError = await requireAdmin();
  if (authError) return authError;

  const sb = serviceSupabase();
  const raw = await req.json();
  const patch: Record<string, unknown> = {};
  for (const key of SEO_ALLOWED_FIELDS) {
    if (key in raw) patch[key] = raw[key];
  }
  if (Object.keys(patch).length === 0)
    return NextResponse.json({ error: "No valid fields provided" }, { status: 400 });
  const { data: existing } = await sb.from("seo_settings").select("id").limit(1).maybeSingle();
  const { error } = existing
    ? await sb.from("seo_settings").update({ ...patch, updated_at: new Date().toISOString() }).eq("id", existing.id)
    : await sb.from("seo_settings").insert({ ...patch, updated_at: new Date().toISOString() });
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ ok: true });
}
```

---

### `src/app/admin/seo/page.tsx`

Copy this file verbatim from the source repository at:
`src/app/admin/seo/page.tsx`

It is too large to inline here but must be copied exactly — it contains the full admin SEO panel UI with Facebook Pixel, GA4, Open Graph, sitemap inspector, and Google Search Console sections.

---

## STEP 3 — Integration Points in Existing Files

These are the only changes needed to existing files. Make surgical edits only.

---

### `src/app/layout.tsx`

Add these two imports at the top:
```ts
import FacebookPixel from "@/components/FacebookPixel";
import GoogleAnalytics from "@/components/GoogleAnalytics";
```

Add `generateMetadata()` as an exported async function that fetches from `seo_settings` and `settings` tables and returns a Next.js `Metadata` object with:
- `title.default` = store name, `title.template` = `%s ${meta_title_suffix}`
- `openGraph.siteName`, `openGraph.type = "website"`
- `twitter.card = "summary_large_image"` if `twitter_handle` is set
- `verification.google` if `google_site_verification` is set
- `other["facebook-domain-verification"]` if `facebook_domain_verification` is set

In `RootLayout`, fetch `facebook_pixel_id` and `ga_measurement_id` from `seo_settings` and render inside `<body>`:
```tsx
{pixelId && <FacebookPixel pixelId={pixelId} />}
{gaMeasurementId && <GoogleAnalytics measurementId={gaMeasurementId} />}
```

---

### `src/app/product/[id]/ProductDetailClient.tsx`

Add these imports:
```ts
import { fbq } from "@/components/FacebookPixel";
import { trackViewItem, trackAddToCart } from "@/lib/analytics";
```

In the `useEffect` that runs on product load, add:
```ts
fbq("track", "ViewContent", {
  content_ids: [product.id],
  content_name: product.title,
  content_type: "product",
  value: product.price,
  currency: "USD",
});
trackViewItem({ id: product.id, title: product.title, price: product.price });
```

In the add-to-cart handler, after the cart is updated, add:
```ts
fbq("track", "AddToCart", {
  content_ids: [product.id],
  content_name: product.title,
  value: selectedVariant.price * quantity,
  currency: "USD",
  content_type: "product",
});
trackAddToCart({
  id: product.id,
  title: product.title,
  price: selectedVariant.price,
  variantId: selectedVariant.id,
  variantLabel: selectedVariant.label,
  quantity,
});
```

---

### `src/app/shop/ShopClient.tsx`

Add this import:
```ts
import { trackSearch } from "@/lib/analytics";
```

In the search input `useEffect` or `onChange` handler, when `searchQuery` is non-empty:
```ts
if (searchQuery) trackSearch(searchQuery);
```

---

### `src/app/checkout/page.tsx`

Add this import:
```ts
import { trackBeginCheckout } from "@/lib/analytics";
```

In `handleSubmit`, before calling `createStripeCheckout`, add:
```ts
trackBeginCheckout(
  items.map((i) => ({
    id: i.product_id,
    title: i.title,
    price: i.price,
    variantLabel: i.variant_label ?? "",
    quantity: i.quantity,
  })),
  total
);
```

Also move the pay button inside the order summary panel (right column, below totals) and wrap the full two-column grid in a single `<form onSubmit={handleSubmit}>`. Style the button with a gold gradient:
```tsx
<button
  type="submit"
  disabled={loading || shippingLoading}
  className="w-full mt-4 rounded-xl py-4 px-6 font-bold text-base tracking-wide transition-all active:scale-[0.98] disabled:opacity-50 disabled:cursor-not-allowed text-white"
  style={{
    background: "linear-gradient(135deg, #d4af37 0%, #f5d76e 40%, #c49b2c 100%)",
    boxShadow: "0 4px 20px rgba(212,175,55,0.5)",
  }}
>
  <span className="flex items-center justify-center gap-2">
    {loading
      ? <><Loader2 size={20} className="animate-spin" />Processing...</>
      : <><Lock size={18} />Complete My Order — {formatPrice(total)}</>}
  </span>
</button>
<div className="mt-3 flex items-center justify-center gap-3 text-[11px] text-secondary-400 font-medium">
  <span>🔒 SSL Encrypted</span>
  <span>·</span>
  <span>⚡ Powered by Stripe</span>
  <span>·</span>
  <span>✅ Safe Checkout</span>
</div>
```

---

### `src/app/checkout/success/page.tsx`

Add these imports:
```ts
import { fbq } from "@/components/FacebookPixel";
import { trackPurchase } from "@/lib/analytics";
```

After the order is fetched and confirmed (inside the polling `useEffect`, when `data` is returned), add:
```ts
fbq("track", "Purchase", { value: data.total, currency: "USD" });
trackPurchase(
  data.id,
  data.total,
  (data.items ?? []).map((i: any) => ({
    id: i.product_id,
    title: i.title,
    price: i.price,
    variantLabel: i.variant_label ?? "",
    quantity: i.quantity,
  }))
);
```

These fire inside the polling function which only resolves once, so no double-fire guard is needed.

---

## STEP 4 — Add Admin SEO Link

In your admin navigation/sidebar, add a link to `/admin/seo` labelled "SEO & Analytics".
