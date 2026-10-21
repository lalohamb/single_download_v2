"use client";

import type { User } from "@supabase/supabase-js";
import { getCustomerProfile } from "@/lib/account-data";
import { supabase } from "@/lib/supabase";

export async function upsertCustomerProfile(user: User | null) {
  if (!user?.id || !user.email) return;

  const profile = getCustomerProfile(user);
  const session = await supabase.auth.getSession();
  const token = session.data.session?.access_token;
  if (!token) return;

  await fetch("/api/account/profile", {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
    body: JSON.stringify({
      email: profile.email,
      username: profile.username,
      full_name: profile.fullName,
      phone: profile.phone,
      newsletter_opt_in: profile.newsletterOptIn,
      address: profile.address,
      preferences: profile.preferences,
    }),
  }).catch((e: Error) => console.warn("Customer profile sync skipped:", e.message));
}
