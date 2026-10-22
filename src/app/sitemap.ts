import { MetadataRoute } from "next";
import { createClient } from "@supabase/supabase-js";
import { siteUrl, categoryHref } from "@/lib/seo";

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
);

export const revalidate = 3600;

function latest(dates: string[]): Date | undefined {
  const max = Math.max(...dates.map((d) => new Date(d).getTime()).filter((t) => !Number.isNaN(t)));
  return Number.isFinite(max) ? new Date(max) : undefined;
}

export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const [seoRes, productsRes, categoriesRes, settingsRes] = await Promise.all([
    supabase.from("seo_settings").select("site_url, sitemap_enabled").limit(1).maybeSingle(),
    supabase.from("products").select("id, updated_at, category_id").eq("status", "active"),
    supabase.from("categories").select("id, slug"),
    supabase.from("settings_public").select("affiliate_program_enabled").limit(1).maybeSingle(),
  ]);

  // Fail rather than publish an empty or partial sitemap; on revalidation Next
  // keeps serving the last good copy (M2 SEO-007).
  const failed = [seoRes, productsRes, categoriesRes, settingsRes].find((r) => r.error);
  if (failed?.error) throw new Error(`sitemap: ${failed.error.message}`);

  const base = siteUrl(seoRes.data?.site_url);
  if (!seoRes.data?.sitemap_enabled) return [];

  const products = productsRes.data || [];
  const catalogUpdated = latest(products.map((p) => p.updated_at));

  // Only lastmod values derived from real data are emitted (M2 SEO-008).
  const staticRoutes: MetadataRoute.Sitemap = [
    { url: base, ...(catalogUpdated && { lastModified: catalogUpdated }) },
    { url: `${base}/shop`, ...(catalogUpdated && { lastModified: catalogUpdated }) },
    { url: `${base}/about` },
    { url: `${base}/services` },
    { url: `${base}/refund-policy` },
    { url: `${base}/terms-of-service` },
    { url: `${base}/privacy-policy` },
    ...(settingsRes.data?.affiliate_program_enabled !== false ? [{ url: `${base}/affiliates` }] : []),
  ];

  // Category landing pages with at least one active product (empty ones are noindexed).
  const categoryRoutes: MetadataRoute.Sitemap = (categoriesRes.data || []).flatMap((c) => {
    const dates = products.filter((p) => p.category_id === c.id).map((p) => p.updated_at);
    if (dates.length === 0) return [];
    const lastModified = latest(dates);
    return [{ url: `${base}${categoryHref(c.slug)}`, ...(lastModified && { lastModified }) }];
  });

  const productRoutes: MetadataRoute.Sitemap = products.map((p) => ({
    url: `${base}/product/${p.id}`,
    lastModified: new Date(p.updated_at),
  }));

  return [...staticRoutes, ...categoryRoutes, ...productRoutes];
}
