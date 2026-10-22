import { NextRequest, NextResponse } from "next/server";
import { requireAdmin } from "@/lib/require-admin";
import { getStripeSettings, setStripeMode, pushStripeSecretsToEdge } from "@/lib/stripe-config";
import { getErrorMessage } from "@/lib/errors";

export const runtime = "nodejs";

export async function POST(req: NextRequest) {
  const authError = await requireAdmin();
  if (authError) return authError;

  const { mode } = await req.json();
  if (mode !== "live" && mode !== "test")
    return NextResponse.json({ error: "Invalid mode" }, { status: 400 });

  // Ensure keys exist for the target mode before switching
  const settings = await getStripeSettings();
  const secretKey = mode === "live" ? settings?.stripe_live_secret_key : settings?.stripe_test_secret_key;
  const webhookSecret = mode === "live" ? settings?.stripe_live_webhook_secret : settings?.stripe_test_webhook_secret;

  if (!secretKey)
    return NextResponse.json({ error: `No ${mode} keys saved. Save keys first.` }, { status: 400 });

  // Always update the active mode in DB first — critical step
  try {
    await setStripeMode(mode);
  } catch (e: unknown) {
    return NextResponse.json({ error: getErrorMessage(e) }, { status: 500 });
  }

  // Best-effort: push secrets to Supabase Edge Functions (non-fatal if 403/missing token)
  let secretsWarning: string | null = null;
  try {
    await pushStripeSecretsToEdge(secretKey, webhookSecret ?? "");
  } catch (e: unknown) {
    secretsWarning = getErrorMessage(e);
    console.warn("Supabase secrets push failed (non-fatal):", secretsWarning);
  }

  return NextResponse.json({ ok: true, mode, ...(secretsWarning ? { warning: secretsWarning } : {}) });
}
