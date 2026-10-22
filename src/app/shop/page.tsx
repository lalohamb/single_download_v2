import type { Metadata } from "next";
import { Suspense } from "react";
import { permanentRedirect } from "next/navigation";
import { createClient } from "@supabase/supabase-js";
import StorefrontLayout from "@/components/StorefrontLayout";
import ShopClient from "./ShopClient";
import { categoryHref } from "@/lib/seo";
import { PRODUCT_CARD_COLUMNS } from "@/lib/productFlags";
import type { Product } from "@/types";

const supabase = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!);

export const revalidate = 60;

export async function generateMetadata(): Promise<Metadata> {
  const { data: seo } = await supabase.from("seo_settings").select("default_og_image, site_url").limit(1).maybeSingle();
  return {
    title: "Shop",
    description: "Browse made-to-order clothing — T-shirts, hoodies, hats, and more.",
    alternates: { canonical: "/shop" },
    ...(seo?.default_og_image && { openGraph: { type: "website", url: "/shop", title: "Shop", images: [{ url: seo.default_og_image }] } }),
  };
}

export default async function ShopPage({ searchParams }: { searchParams: Promise<{ category?: string | string[]; q?: string | string[] }> }) {
  // Legacy /shop?category={slug} links move permanently to /shop/{slug} (M2 SEO-010).
  const { category, q } = await searchParams;
  const legacyCategory = Array.isArray(category) ? category[0] : category;
  if (legacyCategory) {
    const query = typeof q === "string" && q ? `?q=${encodeURIComponent(q)}` : "";
    permanentRedirect(`${categoryHref(legacyCategory)}${query}`);
  }

  const [productsRes, categoriesRes] = await Promise.all([
    supabase.from("products").select(PRODUCT_CARD_COLUMNS).eq("status", "active").order("featured", { ascending: false }).limit(500),
    supabase.from("categories").select("*").order("name"),
  ]);
  // An empty 200 shop page during an outage looks like a soft 404 (M2 SEO-007).
  const failed = [productsRes, categoriesRes].find((r) => r.error);
  if (failed?.error) throw new Error(`Shop data failed to load: ${failed.error.message}`);

  return (
    <StorefrontLayout>
      <Suspense fallback={null}>
        <ShopClient products={(productsRes.data || []) as unknown as Product[]} categories={categoriesRes.data || []} />
      </Suspense>
    </StorefrontLayout>
  );
}
