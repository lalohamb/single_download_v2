import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { verifySession } from "@/lib/affiliate-session";

export const runtime = "nodejs";

function sb() {
  return createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!, {
    auth: { autoRefreshToken: false, persistSession: false },
  });
}

export async function GET(req: NextRequest) {
  const secret = process.env.AFFILIATE_SESSION_SECRET;
  if (!secret) return NextResponse.json({ error: "Server misconfigured." }, { status: 500 });

  const sessionCookie = req.cookies.get("affiliate_session")?.value;
  if (!sessionCookie) return NextResponse.json({ error: "Unauthorized." }, { status: 401 });

  const affiliateId = verifySession(sessionCookie, secret);
  if (!affiliateId) return NextResponse.json({ error: "Session expired. Please log in again." }, { status: 401 });

  const { data: affiliate } = await sb()
    .from("affiliates")
    .select("id, name, email, code, status, commission_rate, payout_method, payout_handle, created_at")
    .eq("id", affiliateId)
    .maybeSingle();

  if (!affiliate) return NextResponse.json({ error: "Not found." }, { status: 404 });
  if (affiliate.status !== "active") return NextResponse.json({ error: "Account not active." }, { status: 403 });

  const [clicksRes, conversionsRes, payoutsRes] = await Promise.all([
    sb().from("affiliate_clicks").select("id, created_at").eq("code", affiliate.code).order("created_at", { ascending: false }),
    sb().from("affiliate_conversions").select("id, order_subtotal, commission_amount, status, created_at").eq("affiliate_id", affiliate.id).order("created_at", { ascending: false }),
    sb().from("affiliate_payouts").select("id, period, total_amount, payout_method, payout_handle, status, paid_at, created_at").eq("affiliate_id", affiliate.id).order("created_at", { ascending: false }),
  ]);

  const conversions = conversionsRes.data ?? [];
  const pendingEarnings = conversions.filter((c) => c.status === "pending").reduce((s, c) => s + Number(c.commission_amount), 0);
  const approvedEarnings = conversions.filter((c) => c.status === "approved").reduce((s, c) => s + Number(c.commission_amount), 0);
  const paidEarnings = conversions.filter((c) => c.status === "paid").reduce((s, c) => s + Number(c.commission_amount), 0);

  const siteUrl = (process.env.NEXT_PUBLIC_SITE_URL ?? `${req.nextUrl.protocol}//${req.nextUrl.host}`).replace(/\/$/, "");

  return NextResponse.json({
    affiliate,
    stats: {
      total_clicks: clicksRes.data?.length ?? 0,
      total_conversions: conversions.length,
      pending_earnings: Math.round(pendingEarnings * 100) / 100,
      approved_earnings: Math.round(approvedEarnings * 100) / 100,
      paid_earnings: Math.round(paidEarnings * 100) / 100,
    },
    conversions,
    payouts: payoutsRes.data ?? [],
    referral_url: `${siteUrl}?ref=${affiliate.code}`,
  });
}
