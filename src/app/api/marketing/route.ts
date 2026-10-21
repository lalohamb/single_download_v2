import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

export const runtime = "nodejs";

function sb() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { autoRefreshToken: false, persistSession: false } }
  );
}

function unauthorized() {
  return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
}

function authenticate(req: NextRequest): boolean {
  const key = process.env.MARKETING_API_KEY;
  if (!key) return false;
  const auth = req.headers.get("authorization") ?? "";
  return auth === `Bearer ${key}`;
}

export async function GET(req: NextRequest) {
  if (!authenticate(req)) return unauthorized();

  const resource = req.nextUrl.searchParams.get("resource");
  const since = req.nextUrl.searchParams.get("since");
  const client = sb();

  // --- orders summary ---
  if (resource === "orders") {
    let query = client
      .from("orders")
      .select("id, total, subtotal, status, utm_source, utm_medium, utm_campaign, created_at")
      .eq("status", "paid")
      .eq("livemode", true);
    if (since) query = query.gte("created_at", since);
    const { data, error } = await query;
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });

    const orders = data ?? [];
    const revenue = orders.reduce((s, o) => s + Number(o.total), 0);
    const bySource: Record<string, number> = {};
    for (const o of orders) {
      const src = o.utm_source ?? "direct";
      bySource[src] = (bySource[src] ?? 0) + 1;
    }
    return NextResponse.json({ count: orders.length, revenue: Math.round(revenue * 100) / 100, by_source: bySource });
  }

  // --- leads summary ---
  if (resource === "leads") {
    const key = process.env.MAILER_LITE_API_KEY;
    if (!key) return NextResponse.json({ error: "MAILER_LITE_API_KEY not set" }, { status: 500 });
    const res = await fetch("https://connect.mailerlite.com/api/subscribers?limit=1", {
      headers: { Authorization: `Bearer ${key}`, Accept: "application/json" },
    });
    const json = await res.json();
    return NextResponse.json({ total_subscribers: json.meta?.total ?? null });
  }

  // --- attribution breakdown ---
  if (resource === "attribution") {
    let query = client
      .from("orders")
      .select("utm_source, utm_medium, utm_campaign, total")
      .eq("status", "paid")
      .eq("livemode", true);
    if (since) query = query.gte("created_at", since);
    const { data, error } = await query;
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });

    const breakdown: Record<string, { orders: number; revenue: number }> = {};
    for (const o of data ?? []) {
      const key = [o.utm_source ?? "direct", o.utm_medium ?? "none", o.utm_campaign ?? "none"].join(" / ");
      if (!breakdown[key]) breakdown[key] = { orders: 0, revenue: 0 };
      breakdown[key].orders++;
      breakdown[key].revenue = Math.round((breakdown[key].revenue + Number(o.total)) * 100) / 100;
    }
    return NextResponse.json(breakdown);
  }

  // --- products list (no PII) ---
  if (resource === "products") {
    const { data, error } = await client
      .from("products")
      .select("id, title, price, status, featured, is_new_arrival, is_trending, is_bestseller, category_id, created_at, updated_at")
      .eq("status", "active");
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    return NextResponse.json(data ?? []);
  }

  return NextResponse.json({ error: "Unknown resource. Use: orders, leads, attribution, products" }, { status: 400 });
}
