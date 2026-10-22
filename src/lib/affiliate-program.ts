import { createClient } from "@supabase/supabase-js";

// Server-side check of the admin "affiliate program" switch. Reads the public
// settings view, so it is safe to call from any server component.
export async function isAffiliateProgramEnabled(): Promise<boolean> {
  const supabase = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!);
  const { data } = await supabase.from("settings_public").select("affiliate_program_enabled").limit(1).maybeSingle();
  return data?.affiliate_program_enabled !== false;
}
