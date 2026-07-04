import sharp from "sharp";

function normalizeBase64(imageBase64: string): string {
  const value = imageBase64.trim();
  const comma = value.indexOf(",");
  if (value.startsWith("data:") && comma >= 0) {
    return value.slice(comma + 1).trim();
  }
  return value;
}

// FapiHub's /rembg/blur/ returns a full-resolution PNG (background blurred, not
// removed — so the image is opaque and safe to store as JPEG). That PNG is
// typically 2.5–4 MB, which then makes a wasteful round-trip back to the client
// and up to AWS again, and gets stored at that size. Re-encode it to a
// size-capped JPEG so the payload the client re-uploads for enrollment — and
// the persisted check-in photo — stays small.
const MAX_SIDE_PX = 1600;
const TARGET_MAX_BYTES = 900 * 1024; // ~0.9 MB safety cap

async function compressBlurredToJpeg(input: Buffer): Promise<Buffer> {
  const resizeOpts = { fit: "inside" as const, withoutEnlargement: true };
  let out = await sharp(input)
    .rotate()
    .resize(MAX_SIDE_PX, MAX_SIDE_PX, resizeOpts)
    .jpeg({ quality: 82, mozjpeg: true })
    .toBuffer();
  if (out.byteLength > TARGET_MAX_BYTES) {
    out = await sharp(input)
      .rotate()
      .resize(MAX_SIDE_PX, MAX_SIDE_PX, resizeOpts)
      .jpeg({ quality: 68, mozjpeg: true })
      .toBuffer();
  }
  return out;
}

export async function blurBackground(imageBase64: string): Promise<string> {
  const apiKey = process.env.FAPIHUB_API_KEY?.trim();
  if (!apiKey) {
    throw new Error("FAPIHUB_API_KEY is not configured");
  }

  const normalized = normalizeBase64(imageBase64);
  const buffer = Buffer.from(normalized, "base64");
  const blob = new Blob([new Uint8Array(buffer)], { type: "image/jpeg" });

  const formData = new FormData();
  formData.append("image", blob, "photo.jpg");
  formData.append("radius", "15");

  const response = await fetch("https://fapihub.com/v2/rembg/blur/", {
    method: "POST",
    headers: { ApiKey: apiKey },
    body: formData,
  });

  if (!response.ok) {
    throw new Error(`FapiHub error: ${response.status}`);
  }

  const rawBuf = Buffer.from(await response.arrayBuffer());

  // Re-encode the large FapiHub PNG to a size-capped JPEG. If sharp fails for
  // any reason, fall back to the raw output so blur still succeeds.
  try {
    const _t = Date.now();
    const jpeg = await compressBlurredToJpeg(rawBuf);
    console.info("[fapihub][blur] recompress", {
      inputBytes: rawBuf.byteLength,
      outputBytes: jpeg.byteLength,
      ms: Date.now() - _t,
    });
    return jpeg.toString("base64");
  } catch (err) {
    console.warn("[fapihub][blur] recompress failed, returning raw output", err);
    return rawBuf.toString("base64");
  }
}
