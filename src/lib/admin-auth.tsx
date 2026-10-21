"use client";
import { createContext, useContext, useEffect, useState, type ReactNode } from "react";
import { supabase } from "@/lib/supabase";
import type { Session } from "@supabase/supabase-js";
import type { AdminUser } from "@/types";

interface AdminAuthContextValue {
  session: Session | null;
  admin: AdminUser | null;
  loading: boolean;
  sessionExpired: boolean;
  signIn: (email: string, password: string) => Promise<{ error: string | null }>;
  signOut: () => Promise<void>;
}

const AdminAuthContext = createContext<AdminAuthContextValue | undefined>(undefined);

export function AdminAuthProvider({ children }: { children: ReactNode }) {
  const [session, setSession] = useState<Session | null>(null);
  const [admin, setAdmin] = useState<AdminUser | null>(null);
  const [loading, setLoading] = useState(true);
  const [sessionExpired, setSessionExpired] = useState(false);

  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => {
      setSession(data.session);
      if (data.session) { syncTokenCookie(data.session.access_token); checkAdmin(data.session); }
      else setLoading(false);
    });
    const { data: authListener } = supabase.auth.onAuthStateChange((event, sess) => {
      setSession(sess);
      if (sess) { syncTokenCookie(sess.access_token); (async () => { await checkAdmin(sess); })(); }
      else {
        clearTokenCookie();
        // Only flag as expired if we had an active admin session — not on explicit sign-out
        if (event === "TOKEN_REFRESHED" || event === "SIGNED_OUT") setSessionExpired(false);
        else if (admin) setSessionExpired(true);
        setAdmin(null);
        setLoading(false);
      }
    });
    return () => { authListener.subscription.unsubscribe(); };
  }, []);

  function syncTokenCookie(token: string) {
    const projectRef = process.env.NEXT_PUBLIC_SUPABASE_URL?.split("//")[1]?.split(".")[0];
    const key = `sb-${projectRef}-auth-token`;
    const secure = location.protocol === "https:" ? ";Secure" : "";
    document.cookie = `${key}=${encodeURIComponent(JSON.stringify({ access_token: token }))};path=/;max-age=604800;SameSite=Lax${secure}`;
  }

  function clearTokenCookie() {
    const projectRef = process.env.NEXT_PUBLIC_SUPABASE_URL?.split("//")[1]?.split(".")[0];
    document.cookie = `sb-${projectRef}-auth-token=;path=/;max-age=0`;
  }

  async function checkAdmin(sess: Session) {
    try {
      const { data, error } = await supabase.from("admins").select("*").eq("auth_user_id", sess.user.id).maybeSingle();
      setAdmin(error || !data ? null : (data as AdminUser));
    } catch { setAdmin(null); }
    finally { setLoading(false); }
  }

  const signIn = async (email: string, password: string) => {
    const { error } = await supabase.auth.signInWithPassword({ email, password });
    return { error: error?.message || null };
  };

  const signOut = async () => { setSessionExpired(false); await supabase.auth.signOut(); setAdmin(null); };

  return (
    <AdminAuthContext.Provider value={{ session, admin, loading, sessionExpired, signIn, signOut }}>
      {children}
    </AdminAuthContext.Provider>
  );
}

export function useAdminAuth() {
  const ctx = useContext(AdminAuthContext);
  if (!ctx) throw new Error("useAdminAuth must be used within AdminAuthProvider");
  return ctx;
}
