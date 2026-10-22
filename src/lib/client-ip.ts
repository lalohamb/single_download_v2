// Client IP for rate limiting.
//
// The first X-Forwarded-For entry is whatever the client sent, so keying on it
// let anyone bypass rate limits by rotating a fake header. In production nginx
// overwrites X-Real-IP with $remote_addr and appends $remote_addr as the LAST
// X-Forwarded-For entry; the Next server is only reachable through nginx.
export function clientIp(req: Request): string {
  const realIp = req.headers.get("x-real-ip")?.trim();
  if (realIp) return realIp;
  const hops = (req.headers.get("x-forwarded-for") || "").split(",").map((s) => s.trim()).filter(Boolean);
  return hops[hops.length - 1] || "unknown";
}
