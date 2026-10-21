# Diagrams Index

All diagrams render in GitHub, VS Code (Mermaid extension), or any Mermaid-compatible viewer.

| File | Type | Description |
|---|---|---|
| [ERD.md](./ERD.md) | `erDiagram` | Full entity-relationship diagram — all 14 DB tables, columns, and FK relationships |
| [ORDER-FLOW.md](./ORDER-FLOW.md) | `sequenceDiagram` | Complete order lifecycle: cart → Stripe → webhook → Printify → Resend. Includes state machine and Stripe metadata reference |
| [PRODUCT-SYNC-FLOW.md](./PRODUCT-SYNC-FLOW.md) | `sequenceDiagram` | Two sync paths: admin bulk sync (printify-proxy) and Printify publish webhook. Includes content_locked logic and variant resolution |
| [AFFILIATE-FLOW.md](./AFFILIATE-FLOW.md) | `sequenceDiagram` | Affiliate signup → click tracking → checkout attribution → conversion → payout batch |
| [SYSTEM-ARCHITECTURE.md](./SYSTEM-ARCHITECTURE.md) | `graph TB` | Component diagram: VPS, Supabase, Stripe, Printify, Resend, MailerLite, Meta CAPI, GA4. All connections with protocol and auth method |
| [DEPLOYMENT-TOPOLOGY.md](./DEPLOYMENT-TOPOLOGY.md) | `flowchart` | Infrastructure layout (nginx → PM2 → Next.js standalone) and full deploy.sh flow. RAM budget table |
| [ROUTE-MAP.md](./ROUTE-MAP.md) | `graph LR` | Next.js App Router tree with access classification (PUBLIC / AUTH / ADMIN / SERVER) and DB access per route |
| [ADMIN-DATA-MODEL.md](./ADMIN-DATA-MODEL.md) | ASCII | settings table columns grouped by feature area (brand, hero, stripe, email, shipping, etc.). Admin panel → DB write map |
| [RLS-POLICY-MAP.md](./RLS-POLICY-MAP.md) | Matrix + SQL | Full RLS access matrix for all 14 tables. Policy SQL per table. GAP-012 before/after diagram. Service role bypass map |
