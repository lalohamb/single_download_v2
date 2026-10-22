import { createClient } from "@supabase/supabase-js";

export interface StripeConfig {
  secretKey: string;
  webhookSecret: string;
  mode: "live" | "test";
}

function sb() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { autoRefreshToken: false, persistSession: false } }
  );
}

export async function getStripeConfig(): Promise<StripeConfig | null> {
  const { data, error } = await sb()
    .from("settings")
    .select("stripe_mode, stripe_live_secret_key, stripe_live_webhook_secret, stripe_test_secret_key, stripe_test_webhook_secret")
    .limit(1)
    .maybeSingle();

  if (error || !data) return null;

  const mode: "live" | "test" = data.stripe_mode === "live" ? "live" : "test";
  const secretKey = mode === "live" ? data.stripe_live_secret_key : data.stripe_test_secret_key;
  const webhookSecret = mode === "live" ? data.stripe_live_webhook_secret : data.stripe_test_webhook_secret;

  if (!secretKey) return null;
  return { secretKey, webhookSecret: webhookSecret ?? "", mode };
}

export async function getStripeSettings() {
  const { data } = await sb()
    .from("settings")
    .select("id, stripe_mode, stripe_live_secret_key, stripe_live_webhook_secret, stripe_test_secret_key, stripe_test_webhook_secret")
    .limit(1)
    .maybeSingle();
  return data;
}

export async function saveStripeKeys(mode: "live" | "test", secretKey: string, webhookSecret: string) {
  const { data: row } = await sb().from("settings").select("id").limit(1).maybeSingle();
  if (!row) throw new Error("Settings row not found");
  const update = mode === "live"
    ? { stripe_live_secret_key: secretKey, stripe_live_webhook_secret: webhookSecret }
    : { stripe_test_secret_key: secretKey, stripe_test_webhook_secret: webhookSecret };
  const { error } = await sb().from("settings").update(update).eq("id", row.id);
  if (error) throw new Error(error.message);
}

export async function setStripeMode(mode: "live" | "test") {
  const { data: row } = await sb().from("settings").select("id").limit(1).maybeSingle();
  if (!row) throw new Error("Settings row not found");
  const { error } = await sb().from("settings").update({ stripe_mode: mode }).eq("id", row.id);
  if (error) throw new Error(error.message);
}

// Events the stripe-webhook edge function handles. Endpoints are created (and
// existing ones updated) with exactly this list.
export const STRIPE_WEBHOOK_EVENTS = [
  "checkout.session.completed",
  "payment_intent.payment_failed",
  "charge.refunded",
] as const;

// The edge functions read STRIPE_SECRET_KEY / STRIPE_WEBHOOK_SECRET from their
// own secrets, not from the database, so every key or webhook change for the
// active mode must be pushed there too.
export async function pushStripeSecretsToEdge(secretKey: string, webhookSecret: string) {
  const projectRef = process.env.SUPABASE_PROJECT_REF;
  const accessToken = process.env.SUPABASE_ACCESS_TOKEN;
  if (!projectRef || !accessToken) throw new Error("SUPABASE_PROJECT_REF or SUPABASE_ACCESS_TOKEN not set");
  if (!/^[a-z0-9]{20}$/.test(projectRef)) throw new Error("Invalid SUPABASE_PROJECT_REF format");

  // Push secrets
  const res = await fetch(
    `https://api.supabase.com/v1/projects/${projectRef}/secrets`,
    {
      method: "POST",
      headers: {
        Authorization: `Bearer ${accessToken}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify([
        { name: "STRIPE_SECRET_KEY", value: secretKey },
        { name: "STRIPE_WEBHOOK_SECRET", value: webhookSecret },
      ]),
    }
  );
  if (!res.ok) {
    const text = await res.text();
    throw new Error(`Supabase secrets update failed: ${res.status} ${text}`);
  }

  // Redeploy edge function so it picks up the new secret immediately
  const deployRes = await fetch(
    `https://api.supabase.com/v1/projects/${projectRef}/functions/stripe-checkout/deploy`,
    {
      method: "POST",
      headers: {
        Authorization: `Bearer ${accessToken}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ verify_jwt: false }),
    }
  );
  // Non-fatal — secret is updated even if redeploy fails
  if (!deployRes.ok) {
    console.warn("stripe-checkout redeploy after key switch failed:", deployRes.status);
  }
}
