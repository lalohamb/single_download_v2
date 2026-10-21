import type { Metadata } from "next";
import "./globals.css";
import { CartProvider } from "@/lib/cart";
import { createClient } from "@supabase/supabase-js";
import PersistentMusicPlayer from "@/components/PersistentMusicPlayer";
import FacebookPixel from "@/components/FacebookPixel";
import GoogleAnalytics from "@/components/GoogleAnalytics";

const SUPABASE_ORIGIN = new URL(process.env.NEXT_PUBLIC_SUPABASE_URL!).origin;

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
  {
    global: {
      fetch: (url, opts) => {
        const target = new URL(url.toString());
        if (target.origin !== SUPABASE_ORIGIN)
          throw new Error(`Blocked SSRF attempt to ${target.origin}`);
        return fetch(url, { ...opts, cache: "no-store" });
      },
    },
  }
);

export async function generateMetadata(): Promise<Metadata> {
  const [{ data: seo }, { data: settings }] = await Promise.all([
    supabase.from("seo_settings").select("google_site_verification, twitter_handle, meta_title_suffix, facebook_pixel_id, facebook_domain_verification, site_url").limit(1).maybeSingle(),
    supabase.from("settings_public").select("store_name, favicon_url").limit(1).maybeSingle(),
  ]);
  const storeName = settings?.store_name || "Body & Sleeves";
  const suffix = seo?.meta_title_suffix || `| ${storeName}`;
  const siteUrl = seo?.site_url || "https://bodyandsleeves.com";
  return {
    metadataBase: new URL(siteUrl),
    title: { default: storeName, template: `%s ${suffix}` },
    description: "Made-to-order apparel designed for every body, every style, and every day.",
    openGraph: { siteName: storeName, type: "website" },
    ...(seo?.twitter_handle && { twitter: { card: "summary_large_image", site: seo.twitter_handle } }),
    ...(seo?.google_site_verification && { verification: { google: seo.google_site_verification } }),
    ...(seo?.facebook_domain_verification && { other: { "facebook-domain-verification": seo.facebook_domain_verification } }),
    ...(settings?.favicon_url && { icons: { icon: "/api/favicon", shortcut: "/api/favicon" } }),
  };
}

export default async function RootLayout({ children }: { children: React.ReactNode }) {
  const { data: seoData } = await supabase.from("seo_settings").select("facebook_pixel_id, ga_measurement_id").limit(1).maybeSingle();
  const pixelId = seoData?.facebook_pixel_id || "";
  const gaMeasurementId = seoData?.ga_measurement_id || "";
  return (
    <html lang="en">
      <body>
        <CartProvider>
          {children}
          <PersistentMusicPlayer />
          {pixelId && <FacebookPixel pixelId={pixelId} />}
          {gaMeasurementId && <GoogleAnalytics measurementId={gaMeasurementId} />}
        </CartProvider>
      </body>
    </html>
  );
}
