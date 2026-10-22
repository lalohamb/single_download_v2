// Shared SEO helpers. Kept free of server-only imports so client components
// (Header, ShopClient, HomeClient) can build category URLs too.

// Absolute site origin without a trailing slash. Prefers the admin-configured
// seo_settings.site_url, then the deployment's NEXT_PUBLIC_SITE_URL (M2 SEO-007).
export function siteUrl(configured?: string | null): string {
  const url = configured || process.env.NEXT_PUBLIC_SITE_URL || "http://localhost:3000";
  return url.replace(/\/$/, "");
}

// URL-safe form of a category slug. Admin-entered slugs may contain spaces or
// capitals ("Breast Cancer", "Tank-Tops"); the path always uses the normalized
// form and lookups compare normalized values.
export function normalizeCategorySlug(slug: string): string {
  const normalized = slug
    .trim()
    .toLowerCase()
    .replace(/[\s_]+/g, "-")
    .replace(/[^a-z0-9-]/g, "")
    .replace(/-+/g, "-")
    .replace(/^-|-$/g, "");
  return normalized || encodeURIComponent(slug.trim());
}

export function categoryHref(slug: string): string {
  return `/shop/${normalizeCategorySlug(slug)}`;
}

// Plain-text meta description capped at a word boundary (M2 SEO-011).
export function metaDescription(text: string | null | undefined, max = 160): string | undefined {
  if (!text) return undefined;
  const clean = text.replace(/\s+/g, " ").trim();
  if (clean.length <= max) return clean || undefined;
  const cut = clean.slice(0, max - 1);
  const lastSpace = cut.lastIndexOf(" ");
  return `${(lastSpace > max * 0.6 ? cut.slice(0, lastSpace) : cut).replace(/[\s,.;:–—-]+$/, "")}…`;
}

// JSON-LD payload safe to inline in a <script> tag.
export function jsonLdString(data: unknown): string {
  return JSON.stringify(data).replace(/</g, "\\u003c");
}

// PostgREST error code for a malformed uuid (e.g. /product/not-a-uuid): a
// missing record, not an outage.
export const INVALID_TEXT_REPRESENTATION = "22P02";
