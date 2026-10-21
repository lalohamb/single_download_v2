// scripts/test-admin/lib/client.js
// Shared helpers for all admin tests.
// Uses service role for direct DB verification reads (bypasses RLS).
// Uses admin JWT for API route calls (same path as the browser).
// Env vars loaded via --env-file flag in run-all.js — no dotenv needed.

import { createClient } from "@supabase/supabase-js";

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL;
const ANON_KEY = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
const SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;
const BASE_URL = "http://localhost:3007";

if (!SUPABASE_URL || !ANON_KEY || !SERVICE_KEY) {
  console.error("Missing env vars. Ensure .env.local or .env.prod is present.");
  process.exit(1);
}

// Service role client — for post-write verification only
export const db = createClient(SUPABASE_URL, SERVICE_KEY, {
  auth: { autoRefreshToken: false, persistSession: false },
});

// Anon client — for signing in
const anonClient = createClient(SUPABASE_URL, ANON_KEY);

let _token = null;

export async function signInAdmin(email, password) {
  const { data, error } = await anonClient.auth.signInWithPassword({ email, password });
  if (error || !data.session) throw new Error(`Admin sign-in failed: ${error?.message}`);
  _token = data.session.access_token;
  return _token;
}

export function getToken() {
  if (!_token) throw new Error("Not signed in. Call signInAdmin() first.");
  return _token;
}

// Calls the real app API routes with the admin JWT — same as the browser
export async function api(path, options = {}) {
  const res = await fetch(`${BASE_URL}${path}`, {
    ...options,
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${getToken()}`,
      ...(options.headers ?? {}),
    },
  });
  const text = await res.text();
  let json;
  try { json = JSON.parse(text); } catch { json = { _raw: text }; }
  return { status: res.status, ok: res.ok, json };
}

// Direct service-role DB read — confirms what actually landed in the DB
export async function dbRead(table, column, id) {
  const { data, error } = await db.from(table).select(column).eq("id", id).maybeSingle();
  if (error) throw new Error(`dbRead failed: ${error.message}`);
  return data;
}

export { BASE_URL };
