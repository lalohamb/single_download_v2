import { NextRequest, NextResponse } from "next/server";
import { createHmac, timingSafeEqual } from "crypto";

export const runtime = "nodejs";

const SESSION_TTL_MS = 24 * 60 * 60 * 1000;

function signSession(affiliateId: string, expiry: number, secret: string): string {
  const payload = `${affiliateId}.${expiry}`;
  const sig = createHmac("sha256", secret).update(payload).digest("hex");
  return `${payload}.${sig}`;
}

export async function POST(req: NextRequest) {
  const secret = process.env.AFFILIATE_SESSION_SECRET;
  if (!secret) return NextResponse.json({ error: "Server misconfigured." }, { status: 500 });

  const body = await req.json().catch(() => ({}));
  const otp = body?.otp;
  if (!otp || typeof otp !== "string" || !/^\d{6}$/.test(otp)) {
    return NextResponse.json({ error: "Invalid code." }, { status: 400 });
  }

  const pending = req.cookies.get("affiliate_otp_pending")?.value;
  if (!pending) return NextResponse.json({ error: "Session expired. Please request a new code." }, { status: 401 });

  const parts = pending.split(".");
  if (parts.length !== 4) return NextResponse.json({ error: "Invalid session." }, { status: 401 });

  const [affiliateId, storedOtp, expiry, sig] = parts;

  // Verify HMAC
  const expected = createHmac("sha256", secret).update(`${affiliateId}.${storedOtp}.${expiry}`).digest("hex");
  let sigValid = false;
  try { sigValid = timingSafeEqual(Buffer.from(sig, "hex"), Buffer.from(expected, "hex")); } catch { /* invalid hex */ }
  if (!sigValid) return NextResponse.json({ error: "Invalid session." }, { status: 401 });

  // Check expiry
  if (Date.now() > Number(expiry)) {
    return NextResponse.json({ error: "Code expired. Please request a new one." }, { status: 401 });
  }

  // Verify OTP (timing-safe)
  let otpValid = false;
  try { otpValid = timingSafeEqual(Buffer.from(otp), Buffer.from(storedOtp)); } catch { /* length mismatch */ }
  if (!otpValid) return NextResponse.json({ error: "Incorrect code." }, { status: 401 });

  const sessionExpiry = Date.now() + SESSION_TTL_MS;
  const sessionCookie = signSession(affiliateId, sessionExpiry, secret);

  const res = NextResponse.json({ ok: true });
  res.cookies.set("affiliate_session", sessionCookie, {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    maxAge: Math.floor(SESSION_TTL_MS / 1000),
    path: "/",
  });
  res.cookies.set("affiliate_otp_pending", "", { maxAge: 0, path: "/" });
  return res;
}
