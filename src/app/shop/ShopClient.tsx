"use client";
import { useMemo, useState } from "react";
import Link from "next/link";
import { useSearchParams, useRouter } from "next/navigation";
import { SlidersHorizontal, X } from "lucide-react";
import type { Product, Category } from "@/types";
import ProductCard from "@/components/ProductCard";
import { trackSearch } from "@/lib/analytics";
import { categoryHref } from "@/lib/seo";

// Category is part of the path (/shop/{slug}) so each category is its own
// indexable landing page (M2 SEO-010). The server passes the active category.
export default function ShopClient({ products, categories, activeCategory = null }: { products: Product[]; categories: Category[]; activeCategory?: Category | null }) {
  const searchParams = useSearchParams();
  const router = useRouter();
  const [showFilters, setShowFilters] = useState(false);
  const [sortBy, setSortBy] = useState("featured");
  const [flagFilter, setFlagFilter] = useState<"" | "is_new_arrival" | "is_trending">("");
  const searchQuery = searchParams.get("q") || "";
  const basePath = activeCategory ? categoryHref(activeCategory.slug) : "/shop";

  const filtered = useMemo(() => {
    if (searchQuery) trackSearch(searchQuery);
    let list = [...products];
    if (activeCategory) list = list.filter((p) => p.category_id === activeCategory.id);
    if (searchQuery) {
      const q = searchQuery.toLowerCase();
      list = list.filter((p) => p.title.toLowerCase().includes(q) || (p.description || "").toLowerCase().includes(q));
    }
    if (flagFilter) list = list.filter((p) => (p as unknown as Record<string, boolean>)[flagFilter]);
    if (sortBy === "price-low") list.sort((a, b) => a.price - b.price);
    else if (sortBy === "price-high") list.sort((a, b) => b.price - a.price);
    else if (sortBy === "newest") list.sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime());
    else if (sortBy === "new") list.sort((a, b) => (b.is_new_arrival ? 1 : 0) - (a.is_new_arrival ? 1 : 0));
    else if (sortBy === "trending") list.sort((a, b) => (b.is_trending ? 1 : 0) - (a.is_trending ? 1 : 0));
    else list.sort((a, b) => (b.featured ? 1 : 0) - (a.featured ? 1 : 0));
    return list;
  }, [products, activeCategory, sortBy, flagFilter, searchQuery]);

  return (
    <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8 lg:py-12">
      <div className="mb-8">
        <h1 className="text-3xl lg:text-4xl font-bold text-secondary-900">{activeCategory ? activeCategory.name.trim() : "All Products"}</h1>
        {activeCategory?.description && <p className="text-secondary-500 mt-2">{activeCategory.description}</p>}
      </div>
      <div className="flex flex-col lg:flex-row gap-8">
        <aside className="lg:w-64 flex-shrink-0">
          <button onClick={() => setShowFilters(!showFilters)} className="lg:hidden flex items-center gap-2 mb-4 px-4 py-2 border border-secondary-200 rounded-lg w-full justify-center">
            <SlidersHorizontal size={18} /> Filters
          </button>
          <div className={`${showFilters ? "block" : "hidden"} lg:block`}>
            <div className="flex items-center justify-between mb-4">
              <h2 className="font-semibold text-secondary-900">Categories</h2>
              <button onClick={() => setShowFilters(false)} className="lg:hidden p-1"><X size={18} /></button>
            </div>
            <div className="space-y-1">
              <Link href="/shop" onClick={() => setShowFilters(false)} className={`block w-full text-left px-3 py-2 rounded-lg transition-colors ${!activeCategory ? "bg-secondary-900 text-white font-medium" : "text-secondary-700 hover:bg-secondary-50"}`}>All Products</Link>
              {categories.map((cat) => (
                <Link key={cat.id} href={categoryHref(cat.slug)} onClick={() => setShowFilters(false)} className={`block w-full text-left px-3 py-2 rounded-lg transition-colors ${activeCategory?.id === cat.id ? "bg-secondary-900 text-white font-medium" : "text-secondary-700 hover:bg-secondary-50"}`}>{cat.name}</Link>
              ))}
            </div>
            <h2 className="font-semibold text-secondary-900 mt-6 mb-4">Collections</h2>
            <div className="space-y-1">
              {([["is_new_arrival", "New Arrivals"], ["is_trending", "Trending"]] as const).map(([key, label]) => (
                <button key={key} onClick={() => setFlagFilter((f) => f === key ? "" : key)} className={`block w-full text-left px-3 py-2 rounded-lg transition-colors ${flagFilter === key ? "bg-secondary-900 text-white font-medium" : "text-secondary-700 hover:bg-secondary-50"}`}>{label}</button>
              ))}
            </div>
          </div>
        </aside>
        <div className="flex-1">
          <div className="flex items-center justify-between mb-6">
            <div className="flex items-center gap-3 flex-wrap">
              {searchQuery && (
                <div className="flex items-center gap-1.5 bg-secondary-100 text-secondary-700 text-sm px-3 py-1 rounded-full">
                  <span>Search: <strong>{searchQuery}</strong></span>
                  <button onClick={() => router.push(basePath)} className="ml-1 hover:text-secondary-900"><X size={14} /></button>
                </div>
              )}
              <label className="text-sm text-secondary-600">Sort by:</label>
              <select value={sortBy} onChange={(e) => setSortBy(e.target.value)} className="text-sm border border-secondary-200 rounded-lg px-3 py-1.5 focus:outline-none focus:ring-2 focus:ring-primary-500">
                <option value="featured">Featured</option>
                <option value="new">New Arrivals</option>
                <option value="trending">Trending</option>
                <option value="newest">Newest</option>
                <option value="price-low">Price: Low to High</option>
                <option value="price-high">Price: High to Low</option>
              </select>
            </div>
          </div>
          {filtered.length === 0 ? (
            <div className="text-center py-20"><p className="text-secondary-500 text-lg">No products found in this category.</p></div>
          ) : (
            <div className="grid grid-cols-2 lg:grid-cols-3 gap-4 lg:gap-6">
              {filtered.map((p) => <ProductCard key={p.id} product={p} />)}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
