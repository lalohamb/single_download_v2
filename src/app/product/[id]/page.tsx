import type { Metadata } from "next";
import { createClient } from "@supabase/supabase-js";
import { notFound } from "next/navigation";
import StorefrontLayout from "@/components/StorefrontLayout";
import ProductDetailClient from "./ProductDetailClient";
import type { Product } from "@/types";
import { PRODUCT_CARD_COLUMNS } from "@/lib/productFlags";
import { siteUrl, metaDescription, jsonLdString, INVALID_TEXT_REPRESENTATION } from "@/lib/seo";

const supabase = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!, {
  global: { fetch: (url, opts) => fetch(url, { ...opts, cache: "no-store" }) },
});

async function getSeoSettings() {
  const { data } = await supabase.from("seo_settings").select("site_url, default_og_image, jsonld_enabled, canonical_enabled, meta_title_suffix").limit(1).maybeSingle();
  return data;
}

// A missing or malformed id is a 404; any other database error is an outage and
// must surface as a 5xx rather than a "not found" page (M2 SEO-007).
function productOrNull<T>(res: { data: T | null; error: { code?: string; message: string } | null }): T | null {
  if (res.error && res.error.code !== INVALID_TEXT_REPRESENTATION) throw new Error(`Failed to load product: ${res.error.message}`);
  return res.data;
}

export async function generateMetadata({ params }: { params: Promise<{ id: string }> }): Promise<Metadata> {
  const { id } = await params;
  const [productRes, seo] = await Promise.all([
    supabase.from("products").select("title, description, image_url, status").eq("id", id).maybeSingle(),
    getSeoSettings(),
  ]);
  const row = productOrNull(productRes);
  if (!row) return { title: "Product Not Found" };
  const { image_url, status } = row;
  const title = row.title.trim();
  const description = metaDescription(row.description);
  const base = siteUrl(seo?.site_url);
  const ogImage = image_url || seo?.default_og_image || null;
  // Draft/archived products stay reachable but are kept out of the index (M2 SEO-001).
  if (status !== "active") {
    return { title: `${title} (Unavailable)`, robots: { index: false, follow: true } };
  }
  return {
    title,
    description,
    ...(seo?.canonical_enabled && { alternates: { canonical: `${base}/product/${id}` } }),
    openGraph: {
      title,
      description,
      url: `${base}/product/${id}`,
      type: "website",
      ...(ogImage && { images: [{ url: ogImage, width: 800, height: 800, alt: title }] }),
    },
  };
}

export default async function ProductPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const [productRes, relatedRes, seo, settingsRes] = await Promise.all([
    supabase.from("products").select("*").eq("id", id).maybeSingle(),
    supabase.from("products").select(PRODUCT_CARD_COLUMNS).eq("status", "active").neq("id", id).limit(4),
    getSeoSettings(),
    supabase.from("settings_public").select("shipping_free_threshold, store_name, product_badge_1_text, product_badge_1_active, product_badge_2_text, product_badge_2_active, product_badge_3_text, product_badge_3_active").limit(1).maybeSingle(),
  ]);

  const product = productOrNull(productRes) as Product | null;
  if (!product) notFound();
  const freeShippingThreshold: number = settingsRes.data?.shipping_free_threshold ?? 75;
  const productBadges = [
    { text: settingsRes.data?.product_badge_1_text ?? "Free shipping on orders over $75", active: settingsRes.data?.product_badge_1_active !== false },
    { text: settingsRes.data?.product_badge_2_text ?? "Print on demand - made fresh for you", active: settingsRes.data?.product_badge_2_active !== false },
    { text: settingsRes.data?.product_badge_3_text ?? "Premium quality guarantee", active: settingsRes.data?.product_badge_3_active !== false },
  ];
  const base = siteUrl(seo?.site_url);

  const storeName = settingsRes.data?.store_name || "Body & Sleeves";

  const isActive = product.status === "active";
  const hasVariants = Array.isArray(product.variants) && product.variants.length > 0;

  const productImages = [...new Set([product.image_url, ...(Array.isArray(product.images) ? product.images : [])].filter((u): u is string => !!u))].slice(0, 10);

  const jsonLd = seo?.jsonld_enabled && isActive ? {
    "@context": "https://schema.org",
    "@type": "Product",
    name: product.title.trim(),
    description: product.description || undefined,
    sku: product.id,
    image: productImages.length > 0 ? productImages : undefined,
    url: `${base}/product/${product.id}`,
    offers: {
      "@type": "Offer",
      price: parseFloat(product.price.toFixed(2)),
      priceCurrency: "USD",
      // Print-on-demand: purchasable whenever the product is active and has variants.
      availability: hasVariants ? "https://schema.org/InStock" : "https://schema.org/OutOfStock",
      url: `${base}/product/${product.id}`,
    },
    brand: { "@type": "Brand", name: storeName },
  } : null;

  return (
    <StorefrontLayout>
      {/* Native script so the markup is in the server HTML (M2 SEO-004). */}
      {jsonLd && <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: jsonLdString(jsonLd) }} />}
      <ProductDetailClient product={product} related={(relatedRes.data || []) as unknown as Product[]} freeShippingThreshold={freeShippingThreshold} productBadges={productBadges} />
    </StorefrontLayout>
  );
}
