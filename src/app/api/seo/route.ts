import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { requireAdmin } from "@/lib/require-admin";

export const runtime = "nodejs";

// Public read client — used for GET (sitemap + admin reads)
const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
);

// Service role client — used for POST writes
const serviceSupabase = () =>
  createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { autoRefreshToken: false, persistSession: false } }
  );

export async function GET(req: NextRequest) {
  const action = req.nextUrl.searchParams.get("action");

  if (action === "sitemap_products") {
    const { data } = await supabase
      .from("products")
      .select("id, updated_at")
      .eq("status", "active");
    return NextResponse.json(data || []);
  }

  const { data, error } = await supabase
    .from("seo_settings")
    .select("*")
    .limit(1)
    .maybeSingle();
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json(data);
}

const SEO_ALLOWED_FIELDS = new Set([
  "site_url", "default_og_image", "sitemap_enabled", "robots_noindex_admin",
  "jsonld_enabled", "canonical_enabled", "meta_title_suffix", "twitter_handle",
  "google_site_verification", "facebook_pixel_id", "ga_measurement_id", "facebook_domain_verification",
]);

export async function POST(req: NextRequest) {
  const authError = await requireAdmin();
  if (authError) return authError;

  const sb = serviceSupabase();
  const raw = await req.json();
  const patch: Record<string, unknown> = {};
  for (const key of SEO_ALLOWED_FIELDS) {
    if (key in raw) patch[key] = raw[key];
  }
  if (Object.keys(patch).length === 0)
    return NextResponse.json({ error: "No valid fields provided" }, { status: 400 });
  // Fetch the existing row id (whatever it is) and update it, or insert if none exists
  const { data: existing } = await sb.from("seo_settings").select("id").limit(1).maybeSingle();
  const { error } = existing
    ? await sb.from("seo_settings").update({ ...patch, updated_at: new Date().toISOString() }).eq("id", existing.id)
    : await sb.from("seo_settings").insert({ ...patch, updated_at: new Date().toISOString() });
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ ok: true });
}
