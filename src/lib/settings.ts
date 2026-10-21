import { createClient } from "@supabase/supabase-js";
import type { StoreSettings } from "@/types";

/**
 * Read storefront-safe settings from the settings_public security-definer view.
 *
 * This view excludes secret columns (Stripe keys, resend_api_key, email_from,
 * email_support). Use this for all anon/authenticated reads of settings.
 *
 * Admin writes still go directly to the settings table via the browser client
 * (admin JWT satisfies the admin_update_settings RLS policy).
 *
 * Server components: call getPublicSettings() directly.
 * Client components: call supabase.from("settings_public").select(...) or use
 * this helper via a server action / API route.
 */
export async function getPublicSettings(): Promise<Partial<StoreSettings> & { id?: string } | null> {
  const sb = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
  );
  const { data } = await sb
    .from("settings_public")
    .select("*")
    .limit(1)
    .maybeSingle();
  return data ?? null;
}
