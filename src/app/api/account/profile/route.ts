import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

export const runtime = "nodejs";

const ALLOWED_FIELDS = new Set([
  "email", "username", "full_name", "phone",
  "newsletter_opt_in", "address", "preferences",
]);

function sbService() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { autoRefreshToken: false, persistSession: false } }
  );
}

export async function POST(req: NextRequest) {
  // Verify caller identity from JWT — never trust client-supplied user_id
  const token = req.headers.get("authorization")?.replace("Bearer ", "") ?? "";
  if (!token) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const sb = sbService();
  const { data: { user }, error: authError } = await sb.auth.getUser(token);
  if (authError || !user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const raw = await req.json();

  // Allowlist and validate fields
  const patch: Record<string, unknown> = {};
  for (const key of ALLOWED_FIELDS) {
    if (!(key in raw)) continue;
    const val = raw[key];
    if (key === "email") {
      if (typeof val !== "string" || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(val)) continue;
      patch[key] = val.trim().toLowerCase().slice(0, 254);
    } else if (key === "username" || key === "full_name" || key === "phone") {
      if (typeof val !== "string") continue;
      patch[key] = val.trim().slice(0, 100);
    } else if (key === "newsletter_opt_in") {
      if (typeof val !== "boolean") continue;
      patch[key] = val;
    } else if (key === "address" || key === "preferences") {
      if (typeof val !== "object" || val === null || Array.isArray(val)) continue;
      patch[key] = val;
    }
  }

  const now = new Date().toISOString();
  const { error } = await sb.from("customer_profiles").upsert(
    { id: user.id, ...patch, last_seen_at: now, updated_at: now },
    { onConflict: "id" }
  );

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ ok: true });
}
