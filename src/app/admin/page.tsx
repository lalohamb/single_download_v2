"use client";
import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { Lock, Mail, Loader2, ShieldCheck, LogOut, AlertTriangle } from "lucide-react";
import { useAdminAuth } from "@/lib/admin-auth";

const STORAGE_KEY = "admin_lockout";
const MAX_ATTEMPTS = 5;
const LOCKOUT_MS = 15 * 60 * 1000;

function readLockout(): { attempts: number; lockedUntil: number | null } {
  try {
    const raw = sessionStorage.getItem(STORAGE_KEY);
    return raw ? JSON.parse(raw) : { attempts: 0, lockedUntil: null };
  } catch { return { attempts: 0, lockedUntil: null }; }
}

function writeLockout(attempts: number, lockedUntil: number | null) {
  sessionStorage.setItem(STORAGE_KEY, JSON.stringify({ attempts, lockedUntil }));
}

export default function AdminLoginPage() {
  const { signIn, signOut, admin, loading, sessionExpired } = useAdminAuth();
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [attempts, setAttempts] = useState(0);
  const [lockedUntil, setLockedUntil] = useState<number | null>(null);
  const [signingOut, setSigningOut] = useState(false);

  // Restore lockout state from sessionStorage on mount
  useEffect(() => {
    const saved = readLockout();
    setAttempts(saved.attempts);
    setLockedUntil(saved.lockedUntil);
  }, []);

  // Redirect once admin is confirmed — avoids race with checkAdmin()
  useEffect(() => {
    if (!loading && admin) router.replace("/admin/dashboard");
  }, [admin, loading, router]);

  const isLocked = lockedUntil !== null && Date.now() < lockedUntil;
  const lockMinsLeft = lockedUntil ? Math.ceil((lockedUntil - Date.now()) / 60000) : 0;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (isLocked) return;
    setSubmitting(true); setError(null);
    const { error } = await signIn(email, password);
    if (error) {
      const newAttempts = attempts + 1;
      const newLockedUntil = newAttempts >= MAX_ATTEMPTS ? Date.now() + LOCKOUT_MS : null;
      setAttempts(newAttempts);
      setLockedUntil(newLockedUntil);
      writeLockout(newAttempts, newLockedUntil);
      setError(newLockedUntil
        ? `Too many failed attempts. Try again in ${LOCKOUT_MS / 60000} minutes.`
        : `${error} (${MAX_ATTEMPTS - newAttempts} attempt${MAX_ATTEMPTS - newAttempts === 1 ? "" : "s"} remaining)`);
      setSubmitting(false);
    } else {
      writeLockout(0, null);
    }
  };

  const handleSignOut = async () => {
    setSigningOut(true);
    await signOut();
    setSigningOut(false);
  };

  // Already logged in — show switch-account option
  if (!loading && admin) return null;

  return (
    <div className="min-h-screen flex items-center justify-center bg-secondary-900 px-4">
      <div className="w-full max-w-md">
        <div className="text-center mb-8">
          <div className="w-16 h-16 rounded-2xl bg-gold-500 flex items-center justify-center mx-auto mb-4"><ShieldCheck size={32} className="text-secondary-900" /></div>
          <h1 className="text-2xl font-bold text-white">Admin Portal</h1>
          <p className="text-secondary-400 mt-2">Store Management</p>
        </div>

        {sessionExpired && (
          <div className="flex items-center gap-2 bg-amber-500/10 border border-amber-500/30 text-amber-300 rounded-xl px-4 py-3 mb-4 text-sm">
            <AlertTriangle size={16} className="flex-shrink-0" />
            Your session expired. Please sign in again.
          </div>
        )}

        <div className="bg-white rounded-2xl p-8 shadow-xl">
          {admin ? (
            <div className="space-y-4 text-center">
              <p className="text-secondary-700 text-sm">Signed in as <span className="font-semibold">{(admin as { email?: string }).email}</span></p>
              <button onClick={handleSignOut} disabled={signingOut} className="btn-outline w-full flex items-center justify-center gap-2">
                {signingOut ? <Loader2 size={18} className="animate-spin" /> : <LogOut size={18} />}
                {signingOut ? "Signing out..." : "Sign out"}
              </button>
            </div>
          ) : (
            <form onSubmit={handleSubmit} className="space-y-4">
              <div>
                <label className="label-text">Email</label>
                <div className="relative">
                  <Mail size={18} className="absolute left-3 top-3 text-secondary-400" />
                  <input type="email" required value={email} onChange={(e) => setEmail(e.target.value)} className="input-field pl-10" placeholder="admin@your-store.example" />
                </div>
              </div>
              <div>
                <label className="label-text">Password</label>
                <div className="relative">
                  <Lock size={18} className="absolute left-3 top-3 text-secondary-400" />
                  <input type="password" required minLength={6} value={password} onChange={(e) => setPassword(e.target.value)} className="input-field pl-10" placeholder="••••••••" />
                </div>
              </div>
              {error && <div className="bg-error-50 border border-error-100 text-error-700 rounded-lg p-3 text-sm">{error}</div>}
              {isLocked && !error && <div className="bg-error-50 border border-error-100 text-error-700 rounded-lg p-3 text-sm">Account locked. Try again in {lockMinsLeft} minute{lockMinsLeft !== 1 ? "s" : ""}.</div>}
              <button type="submit" disabled={submitting || isLocked} className="btn-primary w-full">
                {submitting ? <><Loader2 size={20} className="mr-2 animate-spin" />Verifying...</> : "Sign In"}
              </button>
            </form>
          )}
        </div>
        <p className="text-center text-secondary-500 text-sm mt-6">Admin access required. Authorized personnel only.</p>
      </div>
    </div>
  );
}
