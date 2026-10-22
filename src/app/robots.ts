import { MetadataRoute } from "next";
import { createClient } from "@supabase/supabase-js";
import { siteUrl } from "@/lib/seo";

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

  // Never fail here: Google treats a 5xx robots.txt as "disallow everything".
  // On a database error, fall back to the deployment URL and default rules.
  const base = siteUrl(data?.site_url);
  const disallow = data?.robots_noindex_admin !== false
    ? ["/admin/", "/checkout/", "/api/"]
    : ["/checkout/", "/api/"];

  return {
    // /api/favicon is the site icon; Googlebot-Image must be able to fetch it (M2 SEO-003).
    rules: [{ userAgent: "*", allow: ["/", "/api/favicon"], disallow }],
    sitemap: `${base}/sitemap.xml`,
  };
}
