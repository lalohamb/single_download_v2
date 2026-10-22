import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { clientIp } from "@/lib/client-ip";
import { createHmac, randomInt } from "crypto";

export const runtime = "nodejs";

const attempts = new Map<string, { count: number; windowStart: number }>();
const WINDOW_MS = 60 * 60 * 1000;
const MAX_PER_WINDOW = 5;
const OTP_TTL_MS = 10 * 60 * 1000;


function isRateLimited(ip: string): boolean {
  const now = Date.now();
  const entry = attempts.get(ip);
  if (!entry || now - entry.windowStart > WINDOW_MS) { attempts.set(ip, { count: 1, windowStart: now }); return false; }
  if (entry.count >= MAX_PER_WINDOW) return true;
  entry.count++;
  return false;
}

function sb() {
  return createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!, {
    auth: { autoRefreshToken: false, persistSession: false },
  });
}

// The cookie goes back to whoever requested the code, so it must never contain
// the code itself — only an HMAC of it that the confirm route can recompute.
function hashOtp(affiliateId: string, otp: string, expiry: number, secret: string): string {
  return createHmac("sha256", secret).update(`otp.${affiliateId}.${otp}.${expiry}`).digest("hex");
}

function signOtpCookie(affiliateId: string, otp: string, expiry: number, secret: string): string {
  const payload = `${affiliateId}.${hashOtp(affiliateId, otp, expiry, secret)}.${expiry}`;
  const sig = createHmac("sha256", secret).update(payload).digest("hex");
  return `${payload}.${sig}`;
}

export async function POST(req: NextRequest) {
  const secret = process.env.AFFILIATE_SESSION_SECRET;
  if (!secret) return NextResponse.json({ error: "Server misconfigured." }, { status: 500 });

  if (isRateLimited(clientIp(req))) {
    return NextResponse.json({ error: "Too many requests. Please try again later." }, { status: 429 });
  }

  const body = await req.json().catch(() => ({}));
  const code = body?.code;
  if (!code || typeof code !== "string") {
    return NextResponse.json({ error: "Affiliate code is required." }, { status: 400 });
  }

  const { data: affiliate } = await sb()
    .from("affiliates")
    .select("id, email, status")
    .eq("code", code.trim())
    .maybeSingle();

  // Always return ok to avoid code enumeration
  if (!affiliate || affiliate.status !== "active") {
    return NextResponse.json({ ok: true });
  }

  const otp = String(randomInt(100000, 999999));
  const expiry = Date.now() + OTP_TTL_MS;
  const cookieValue = signOtpCookie(affiliate.id, otp, expiry, secret);

  const resendKey = process.env.RESEND_API_KEY;
  if (resendKey) {
    const { data: settings } = await sb().from("settings").select("email_from, store_name").limit(1).maybeSingle();
    const from = settings?.email_from || process.env.EMAIL_FROM || "noreply@example.com";
    const storeName = settings?.store_name || "Our Store";

    await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: { Authorization: `Bearer ${resendKey}`, "Content-Type": "application/json" },
      body: JSON.stringify({
        from,
        to: affiliate.email,
        subject: `Your ${storeName} affiliate login code`,
        html: `<p>Your verification code is: <strong>${otp}</strong></p><p>This code expires in 10 minutes.</p>`,
      }),
    });
  }

  const res = NextResponse.json({ ok: true });
  res.cookies.set("affiliate_otp_pending", cookieValue, {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    maxAge: Math.floor(OTP_TTL_MS / 1000),
    path: "/",
  });
  return res;
}
