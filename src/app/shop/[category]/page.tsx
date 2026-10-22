import type { Metadata } from "next";
import { Suspense } from "react";
import { notFound } from "next/navigation";
import { createClient } from "@supabase/supabase-js";
import StorefrontLayout from "@/components/StorefrontLayout";
import ShopClient from "../ShopClient";
import { categoryHref, metaDescription, normalizeCategorySlug } from "@/lib/seo";
import type { Category, Product } from "@/types";
import { PRODUCT_CARD_COLUMNS } from "@/lib/productFlags";

const supabase = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!);

export const revalidate = 60;

// Category landing pages (M2 SEO-010). Slugs are matched in normalized form so
// admin-entered slugs with spaces or capitals still get a clean URL.
async function loadCategories(): Promise<Category[]> {
  const { data, error } = await supabase.from("categories").select("*").order("name");
  if (error) throw new Error(`Categories failed to load: ${error.message}`);
  return (data || []) as Category[];
}

function findCategory(categories: Category[], param: string): Category | undefined {
  let decoded: string;
  try {
    decoded = decodeURIComponent(param);
  } catch {
    return undefined; // malformed escape sequence: treat as not found
  }
  const wanted = normalizeCategorySlug(decoded);
  return categories.find((c) => normalizeCategorySlug(c.slug) === wanted);
}

async function countActive(categoryId: string): Promise<number> {
  const { count, error } = await supabase.from("products").select("id", { count: "exact", head: true }).eq("status", "active").eq("category_id", categoryId);
  if (error) throw new Error(`Category products failed to load: ${error.message}`);
  return count ?? 0;
}

export async function generateMetadata({ params }: { params: Promise<{ category: string }> }): Promise<Metadata> {
  const { category: param } = await params;
  const category = findCategory(await loadCategories(), param);
  if (!category) return { title: "Category Not Found" };

  const name = category.name.trim();
  const description = metaDescription(category.description) ?? `Shop made-to-order ${name.toLowerCase()} from Body & Sleeves, designed for every body, every style, and every day.`;
  const canonical = categoryHref(category.slug);
  // An empty category would be a thin page; keep it reachable but out of the index.
  const hasProducts = (await countActive(category.id)) > 0;
  return {
    title: name,
    description,
    alternates: { canonical },
    openGraph: { type: "website", url: canonical, title: name, description },
    ...(!hasProducts && { robots: { index: false, follow: true } }),
  };
}

export default async function CategoryPage({ params }: { params: Promise<{ category: string }> }) {
  const { category: param } = await params;
  const categories = await loadCategories();
  const category = findCategory(categories, param);
  if (!category) notFound();

  const { data: products, error } = await supabase.from("products").select(PRODUCT_CARD_COLUMNS).eq("status", "active").eq("category_id", category.id).order("featured", { ascending: false }).limit(500);
  if (error) throw new Error(`Category products failed to load: ${error.message}`);

  return (
    <StorefrontLayout>
      <Suspense fallback={null}>
        <ShopClient products={(products || []) as unknown as Product[]} categories={categories} activeCategory={category} />
      </Suspense>
    </StorefrontLayout>
  );
}
