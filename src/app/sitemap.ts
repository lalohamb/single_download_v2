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
    { url: base, lastModified: new Date("2025-06-01"), changeFrequency: "daily", priority: 1 },
    { url: `${base}/shop`, lastModified: new Date("2025-06-01"), changeFrequency: "daily", priority: 0.9 },
    { url: `${base}/about`, lastModified: new Date("2025-06-01"), changeFrequency: "monthly", priority: 0.6 },
    { url: `${base}/services`, lastModified: new Date("2025-06-01"), changeFrequency: "monthly", priority: 0.5 },
    { url: `${base}/refund-policy`, lastModified: new Date("2025-01-01"), changeFrequency: "yearly", priority: 0.3 },
    { url: `${base}/terms-of-service`, lastModified: new Date("2025-01-01"), changeFrequency: "yearly", priority: 0.3 },
    { url: `${base}/privacy-policy`, lastModified: new Date("2025-01-01"), changeFrequency: "yearly", priority: 0.3 },
  ];

  const productRoutes: MetadataRoute.Sitemap = (productsRes.data || []).map((p) => ({
    url: `${base}/product/${p.id}`,
    lastModified: new Date(p.updated_at),
    changeFrequency: "weekly",
    priority: 0.8,
  }));

  return [...staticRoutes, ...productRoutes];
}
