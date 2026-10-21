import { createHmac, timingSafeEqual } from "crypto";

export function verifySession(cookie: string, secret: string): string | null {
  const parts = cookie.split(".");
  if (parts.length !== 3) return null;
  const [affiliateId, expiry, sig] = parts;
  if (Date.now() > Number(expiry)) return null;
  const expected = createHmac("sha256", secret).update(`${affiliateId}.${expiry}`).digest("hex");
  try {
    if (!timingSafeEqual(Buffer.from(sig, "hex"), Buffer.from(expected, "hex"))) return null;
  } catch {
    return null;
  }
  return affiliateId;
}
