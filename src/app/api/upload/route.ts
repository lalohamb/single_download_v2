import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { requireAdmin } from "@/lib/require-admin";

const supabaseAdmin = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!,
);

const IMAGE_BUCKET = "store-images";
const AUDIO_BUCKET = "store-audio";
const VIDEO_BUCKET = "store-video";

const AUDIO_MIME: Record<string, string> = {
  mp3: "audio/mpeg",
  mpeg: "audio/mpeg",
  ogg: "audio/ogg",
  wav: "audio/wav",
  flac: "audio/flac",
  aac: "audio/aac",
  m4a: "audio/mp4",
};

const VIDEO_MIME: Record<string, string> = {
  mp4: "video/mp4",
  webm: "video/webm",
  mov: "video/quicktime",
  m4v: "video/mp4",
};

// Images are identified by their leading bytes, never by the client-supplied
// MIME type or extension. SVG is not accepted: it can carry script and would be
// served as-is from the public bucket.
function sniffImage(buf: Buffer): { ext: string; mime: string } | null {
  if (buf.length >= 3 && buf[0] === 0xff && buf[1] === 0xd8 && buf[2] === 0xff) return { ext: "jpg", mime: "image/jpeg" };
  if (buf.length >= 8 && buf.subarray(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]))) return { ext: "png", mime: "image/png" };
  const head = buf.subarray(0, 12).toString("latin1");
  if (head.startsWith("GIF87a") || head.startsWith("GIF89a")) return { ext: "gif", mime: "image/gif" };
  if (head.startsWith("RIFF") && head.slice(8, 12) === "WEBP") return { ext: "webp", mime: "image/webp" };
  if (head.slice(4, 8) === "ftyp" && ["avif", "avis"].includes(head.slice(8, 12))) return { ext: "avif", mime: "image/avif" };
  return null;
}

export async function POST(req: Request) {
  const authError = await requireAdmin();
  if (authError) return authError;

  const formData = await req.formData();
  const file = formData.get("file") as File | null;
  const folder = (formData.get("folder") as string) || "uploads";

  if (!file) return NextResponse.json({ error: "No file provided" }, { status: 400 });

  const rawExt = file.name.split(".").pop()?.toLowerCase() ?? "";
  const isAudio = rawExt in AUDIO_MIME;
  const isVideo = rawExt in VIDEO_MIME;
  const buffer = Buffer.from(await file.arrayBuffer());
  const image = !isAudio && !isVideo ? sniffImage(buffer) : null;
  const isImage = image !== null;

  if (!isImage && !isAudio && !isVideo) return NextResponse.json({ error: "Unsupported file type. Images must be JPG, PNG, GIF, WebP or AVIF." }, { status: 400 });
  if (isImage && file.size > 5 * 1024 * 1024) return NextResponse.json({ error: "Image must be under 5MB" }, { status: 400 });
  if (isAudio && file.size > 20 * 1024 * 1024) return NextResponse.json({ error: "Audio must be under 20MB" }, { status: 400 });
  if (isVideo && file.size > 200 * 1024 * 1024) return NextResponse.json({ error: "Video must be under 200MB" }, { status: 400 });

  const safeFolder = folder.replace(/[^a-zA-Z0-9_\-/]/g, "").replace(/\/+/g, "/").replace(/(^\/|\/+$)/g, "").slice(0, 128) || "uploads";
  const path = `${safeFolder}/${Date.now()}.${image ? image.ext : rawExt}`;
  const bucket = isVideo ? VIDEO_BUCKET : isAudio ? AUDIO_BUCKET : IMAGE_BUCKET;
  const contentType = isVideo ? VIDEO_MIME[rawExt] : isAudio ? AUDIO_MIME[rawExt] : image!.mime;

  const { error } = await supabaseAdmin.storage.from(bucket).upload(path, buffer, {
    contentType,
    upsert: true,
  });

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  const { data } = supabaseAdmin.storage.from(bucket).getPublicUrl(path);
  return NextResponse.json({ url: data.publicUrl });
}
