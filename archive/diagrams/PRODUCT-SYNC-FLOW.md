# Product Sync Flow

Two paths exist for getting Printify products into the local DB: admin-triggered bulk sync and Printify's publish webhook.

---

## Path A — Admin Bulk Sync

```mermaid
sequenceDiagram
  autonumber
  actor Admin
  participant AdminUI as Admin Panel<br/>/admin/products
  participant NextJS as Next.js API<br/>(admin route)
  participant PrintifyProxy as printify-proxy<br/>(Edge Fn)
  participant Printify
  participant DB as Supabase DB

  Admin->>AdminUI: Click "Sync from Printify"
  AdminUI->>NextJS: POST /api/... (shop_id)
  NextJS->>PrintifyProxy: POST /sync?shop_id=

  loop Paginate all products (50/page)
    PrintifyProxy->>Printify: GET /shops/{id}/products.json?page=N
    Printify-->>PrintifyProxy: Product listing (id, title, visible)

    loop Each product
      PrintifyProxy->>Printify: GET /shops/{id}/products/{id}.json
      Printify-->>PrintifyProxy: Full product detail (variants, images, options)

      PrintifyProxy->>Printify: GET /personalization_options.json
      Printify-->>PrintifyProxy: Personalization fields (or empty)

      alt blueprint_id + provider not in cache
        PrintifyProxy->>Printify: GET /catalog/blueprints/{id}/print_providers/{id}/shipping.json
        Printify-->>PrintifyProxy: Shipping profile (cached by blueprint:provider)
      end

      PrintifyProxy->>DB: SELECT products WHERE printify_id = id (check content_locked)
      DB-->>PrintifyProxy: { content_locked: true|false }

      alt content_locked = false (default)
        PrintifyProxy->>DB: UPSERT products (ALL fields: title, description, images, variants, price, status)
      else content_locked = true
        PrintifyProxy->>DB: UPSERT products (commerce fields only: price, variants, status, shipping_info)
        Note over DB: title/description/images preserved
      end

      PrintifyProxy->>Printify: POST /publishing_succeeded.json
      Note over Printify: Clears "Publishing" state in Printify dashboard
    end
  end

  %% Stale product cleanup
  PrintifyProxy->>DB: SELECT products WHERE printify_id IS NOT NULL
  DB-->>PrintifyProxy: All DB products with printify_id
  PrintifyProxy->>DB: DELETE products WHERE printify_id NOT IN Printify listing
  Note over DB: Removes products deleted from Printify

  PrintifyProxy->>DB: UPDATE settings SET printify_connected=true, printify_shop_id=shopId
  PrintifyProxy-->>NextJS: { synced: N, deleted: M, errors: K }
  NextJS-->>AdminUI: Sync complete summary
```

---

## Path B — Printify Publish Webhook

```mermaid
sequenceDiagram
  autonumber
  actor Merchant
  participant Printify
  participant PrintifyWebhook as printify-webhook<br/>(Edge Fn)
  participant DB as Supabase DB

  Merchant->>Printify: Click "Publish" on product in Printify dashboard
  Printify->>PrintifyWebhook: POST product:publish { resource: { id } }

  PrintifyWebhook->>DB: SELECT products WHERE printify_id = id (check content_locked)
  DB-->>PrintifyWebhook: { content_locked: true|false }

  PrintifyWebhook->>Printify: GET /shops/{id}/products/{id}.json
  Printify-->>PrintifyWebhook: Full product detail

  alt content_locked = false
    PrintifyWebhook->>DB: UPSERT products (all fields, status=draft initially)
  else content_locked = true
    PrintifyWebhook->>DB: UPSERT products (commerce fields only)
  end

  PrintifyWebhook->>Printify: POST /publishing_succeeded.json
  Note over Printify: Required — without this, product stays stuck at "Publishing"

  PrintifyWebhook->>DB: UPDATE products SET status=active WHERE printify_id = id
  PrintifyWebhook->>DB: UPDATE settings SET printify_connected=true

  alt Any error during upsert
    PrintifyWebhook->>Printify: POST /publishing_failed.json { reason }
  end
```

---

## content_locked Flag Behaviour

```
                    ┌─────────────────────────────────────────────────────┐
                    │  products row                                        │
                    │                                                      │
                    │  content_locked = false (default)                   │
                    │  ─────────────────────────────────────────────────  │
                    │  Sync overwrites:                                    │
                    │    title, description, image_url, images            │
                    │    price, cost, variants, status                    │
                    │    blueprint_id, print_provider_id                  │
                    │    shipping_info, is_personalizable                 │
                    └─────────────────────────────────────────────────────┘

                    ┌─────────────────────────────────────────────────────┐
                    │  products row                                        │
                    │                                                      │
                    │  content_locked = true  (admin toggle)              │
                    │  ─────────────────────────────────────────────────  │
                    │  Sync PRESERVES (admin-curated):                    │
                    │    title, description, image_url, images            │
                    │                                                      │
                    │  Sync still updates (commerce fields):              │
                    │    price, cost, variants, status                    │
                    │    blueprint_id, print_provider_id                  │
                    │    shipping_info, is_personalizable                 │
                    └─────────────────────────────────────────────────────┘
```

---

## Variant Resolution Logic

Printify stores variants as numeric option IDs. The sync resolves them to human labels:

```
Printify product.options[]
  └── { type: "color"|"size", values: [{ id: 123, title: "Black" }] }
          │
          ▼
  optionValues Map<id → { type, title }>
          │
          ▼
  variant.options[] (array of numeric IDs)
          │
          ├── type=color → color = "Black"
          └── type=size  → size  = "XL"
          │
          ▼
  colorImage Map<color → image_src>
  (only images specific to a single color — collage images excluded)
          │
          ▼
  Stored variant: { id, label, color, size, price, image_url }
```
