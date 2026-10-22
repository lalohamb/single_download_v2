import { NextResponse } from "next/server";
import { ImageResponse } from "next/og";
import { createClient } from "@supabase/supabase-js";

// Cached and regenerated hourly (same lifetime as the previous browser cache)
// instead of re-proxying the full upload on every request.
export const revalidate = 3600;

// Google wants a square favicon at a multiple of 48px (M2 SEO-003 / SEO-013).
const SIZE = 96;

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
);

// Allowlist: only proxy images hosted on these origins.
// Add your Supabase storage bucket hostname here if you use a custom domain.
const ALLOWED_ORIGINS = [
  process.env.NEXT_PUBLIC_SUPABASE_URL
    ? new URL(process.env.NEXT_PUBLIC_SUPABASE_URL).origin
    : null,
  "https://images.pexels.com",
  "https://images.unsplash.com",
].filter(Boolean) as string[];

function isAllowed(url: string): boolean {
  try {
    const { origin } = new URL(url);
    return ALLOWED_ORIGINS.some((o) => origin === o);
  } catch {
    return false;
  }
}

export async function GET() {
  const { data } = await supabase
    .from("settings_public")
    .select("favicon_url")
    .limit(1)
    .maybeSingle();

  const faviconUrl = data?.favicon_url;
  if (!faviconUrl) return new NextResponse(null, { status: 404 });

  if (!isAllowed(faviconUrl)) {
    console.warn("[favicon] Blocked disallowed URL:", faviconUrl);
    return new NextResponse(null, { status: 404 });
  }

  const upstream = await fetch(faviconUrl, { headers: { Accept: "image/*" } });
  if (!upstream.ok) return new NextResponse(null, { status: 404 });

  const contentType = upstream.headers.get("content-type") ?? "image/x-icon";
  if (!contentType.startsWith("image/")) {
    return new NextResponse(null, { status: 404 });
  }

  const original = await upstream.arrayBuffer();

  // Uploaded favicons can be multi-megabyte photos; serve PNG/JPEG resized.
  // Formats the renderer can't read (SVG, ICO, WebP) are passed through as-is.
  if (/^image\/(png|jpe?g)$/.test(contentType)) {
    try {
      const dataUrl = `data:${contentType};base64,${Buffer.from(original).toString("base64")}`;
      const resized = await new ImageResponse(
        // eslint-disable-next-line @next/next/no-img-element, jsx-a11y/alt-text
        <img src={dataUrl} width={SIZE} height={SIZE} style={{ objectFit: "contain" }} />,
        { width: SIZE, height: SIZE },
      ).arrayBuffer();
      return new NextResponse(resized, {
        status: 200,
        headers: { "Content-Type": "image/png", "Cache-Control": "public, max-age=3600" },
      });
    } catch (e) {
      console.warn("[favicon] Resize failed, serving original:", String((e as Error)?.message ?? e));
    }
  }

  return new NextResponse(original, {
    status: 200,
    headers: {
      "Content-Type": contentType,
      "Cache-Control": "public, max-age=3600",
    },
  });
}
