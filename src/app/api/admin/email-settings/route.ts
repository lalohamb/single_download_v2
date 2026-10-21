import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { requireAdmin } from "@/lib/require-admin";

export const runtime = "nodejs";

function sb() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { autoRefreshToken: false, persistSession: false } }
  );
}

/**
 * GET /api/admin/email-settings
 * Returns resend_api_key, email_from, email_support via service role.
 * Admin-only. The resend_api_key is masked in the response — the full key
 * is never sent to the browser. The client stores the value it typed; this
 * endpoint only confirms whether a key is saved and shows a hint.
 */
export async function GET() {
  const authError = await requireAdmin();
  if (authError) return authError;

  const { data } = await sb()
    .from("settings")
    .select("resend_api_key, email_from, email_support")
    .limit(1)
    .maybeSingle();

  if (!data) return NextResponse.json({ resend_api_key_saved: false, email_from: null, email_support: null });

  return NextResponse.json({
    // Never send the full key to the browser. Send a masked hint and a boolean.
    resend_api_key_saved: Boolean(data.resend_api_key),
    resend_api_key_hint: data.resend_api_key
      ? `${data.resend_api_key.slice(0, 6)}...${data.resend_api_key.slice(-4)}`
      : null,
    email_from: data.email_from ?? null,
    email_support: data.email_support ?? null,
  });
}

/**
 * POST /api/admin/email-settings
 * Body: { resend_api_key?: string, email_from?: string, email_support?: string }
 * Writes via service role. Admin-only.
 */
export async function POST(req: NextRequest) {
  const authError = await requireAdmin();
  if (authError) return authError;

  const body = await req.json().catch(() => null);
  if (!body || typeof body !== "object") {
    return NextResponse.json({ error: "Invalid request body" }, { status: 400 });
  }

  const patch: Record<string, unknown> = {};

  if ("resend_api_key" in body) {
    const key = typeof body.resend_api_key === "string" ? body.resend_api_key.trim() : null;
    // Validate format if provided
    if (key && !key.startsWith("re_")) {
      return NextResponse.json({ error: "Invalid Resend API key — must start with re_" }, { status: 400 });
    }
    patch.resend_api_key = key || null;
  }

  if ("email_from" in body) {
    const val = typeof body.email_from === "string" ? body.email_from.trim() : null;
    patch.email_from = val || null;
  }

  if ("email_support" in body) {
    const val = typeof body.email_support === "string" ? body.email_support.trim() : null;
    patch.email_support = val || null;
  }

  if (Object.keys(patch).length === 0) {
    return NextResponse.json({ error: "No valid fields provided" }, { status: 400 });
  }

  patch.updated_at = new Date().toISOString();

  const { data: row } = await sb().from("settings").select("id").limit(1).maybeSingle();
  if (!row?.id) return NextResponse.json({ error: "Settings row not found" }, { status: 500 });

  const { error } = await sb().from("settings").update(patch).eq("id", row.id);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  return NextResponse.json({ ok: true });
}
