import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

export const runtime = "nodejs";

const attempts = new Map<string, { count: number; windowStart: number }>();
const WINDOW_MS = 60 * 60 * 1000;
const MAX_PER_WINDOW = 20;

function getIp(req: NextRequest) {
  return req.headers.get("x-forwarded-for")?.split(",")[0].trim() || req.headers.get("x-real-ip") || "unknown";
}

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

export async function POST(req: NextRequest) {
  if (isRateLimited(getIp(req))) return NextResponse.json({ ok: false }, { status: 429 });

  const { code, referrer, user_agent } = await req.json();
  if (!code || typeof code !== "string") return NextResponse.json({ ok: false });

  const { data } = await sb().from("affiliates").select("id").eq("code", code.trim()).eq("status", "active").maybeSingle();
  if (!data) return NextResponse.json({ ok: false });

  await sb().from("affiliate_clicks").insert({
    code: code.trim(),
    referrer: typeof referrer === "string" ? referrer.slice(0, 500) : null,
    user_agent: typeof user_agent === "string" ? user_agent.slice(0, 300) : null,
  });

  return NextResponse.json({ ok: true });
}
