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

type PrintifyOrder = {
  status?: string;
  created_at?: string;
  updated_at?: string;
  shipments?: { carrier: string; number: string; url: string; delivered_at?: string | null }[];
  line_items?: { status: string; quantity: number; metadata?: { title?: string; variant_label?: string } }[];
};

// Only what the tracking pages display. The raw Printify order also carries the
// customer's address and phone number and the store's production costs.
function pickTracking(o: PrintifyOrder) {
  return {
    status: o.status,
    created_at: o.created_at,
    updated_at: o.updated_at,
    shipments: (o.shipments ?? []).map((s) => ({ carrier: s.carrier, number: s.number, url: s.url, delivered_at: s.delivered_at ?? null })),
    line_items: (o.line_items ?? []).map((li) => ({
      status: li.status,
      quantity: li.quantity,
      metadata: { title: li.metadata?.title ?? "", variant_label: li.metadata?.variant_label ?? "" },
    })),
  };
}

export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  const orderId = searchParams.get("order")?.trim().toUpperCase();
  const email = searchParams.get("email")?.trim().toLowerCase();

  if (!orderId || !email)
    return NextResponse.json({ error: "Order ID and email are required" }, { status: 400 });

  if (!/^[A-Z0-9]{8}$/.test(orderId))
    return NextResponse.json({ error: "Invalid order ID format" }, { status: 400 });

  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email))
    return NextResponse.json({ error: "Invalid email format" }, { status: 400 });

  const { data: orders } = await sb()
    .from("orders")
    .select("id, status, fulfillment_status, tracking_number, tracking_url, shipping_name, shipping_address, subtotal, shipping_cost, total, discount_amount, discount_code, items, created_at, printify_order_id, stripe_session_id")
    // Case-insensitive: orders created before emails were normalized kept the
    // customer's capitalization. LIKE wildcards in the address are escaped.
    .ilike("email", email.replace(/[\\%_]/g, (c) => `\\${c}`))
    .order("created_at", { ascending: false })
    .limit(50);

  // Order numbers are the last 8 of the order id. Confirmation emails sent
  // before 2026-10-22 used the last 8 of the Stripe session id; accept both.
  const match = (orders ?? []).find(
    (o) => o.id.slice(-8).toUpperCase() === orderId || (o.stripe_session_id ?? "").slice(-8).toUpperCase() === orderId
  );
  const order = match ? { ...match } : undefined;
  if (order) delete (order as { stripe_session_id?: string | null }).stripe_session_id; // not returned to the client

  if (!order)
    return NextResponse.json({ error: "No order found matching that ID and email address" }, { status: 404 });

  // Fetch live Printify data if available. printify-proxy only accepts admins
  // or the service role, so this server route calls it with the service role key.
  let printify = null;
  if (order.printify_order_id) {
    try {
      const { data: settings } = await sb().from("settings").select("printify_shop_id").limit(1).maybeSingle();
      const shopId = settings?.printify_shop_id;
      if (shopId) {
        const res = await fetch(
          `${process.env.NEXT_PUBLIC_SUPABASE_URL}/functions/v1/printify-proxy/orders/${order.printify_order_id}?shop_id=${shopId}`,
          { headers: { Authorization: `Bearer ${process.env.SUPABASE_SERVICE_ROLE_KEY}` } }
        );
        if (res.ok) printify = pickTracking(await res.json());
      }
    } catch { /* non-fatal */ }
  }

  return NextResponse.json({ order, printify });
}
