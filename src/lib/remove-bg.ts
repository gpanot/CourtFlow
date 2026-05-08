/**
 * Shared utility for removing image backgrounds via the FapiHub API.
 * Used by:
 *  - enrollFace() auto-retry when AWS DetectFaces returns "no face"
 *  - Admin player detail manual "Remove background" action
 */

const FAPIHUB_REMBG_URL = "https://fapihub.com/v2/rembg/";

/**
 * Remove background from a raw base64-encoded image using the FapiHub API.
 * Returns the cleaned image as a raw base64 string (no data-URL prefix).
 * Returns `null` if the API key is missing or the call fails (non-throwing).
 */
export async function removeBackgroundFromBase64(
  imageBase64: string
): Promise<string | null> {
  const apiKey = process.env.FAPIHUB_API_KEY?.trim();
  const inputBytes = Buffer.byteLength(imageBase64, "base64");
  console.info("[remove-bg] start", { inputBytes });
  if (!apiKey) {
    console.warn("[remove-bg] FAPIHUB_API_KEY not configured — skipping background removal");
    return null;
  }

  try {
    const imageBuffer = Buffer.from(imageBase64, "base64");
    const blob = new Blob([new Uint8Array(imageBuffer)], { type: "image/jpeg" });

    const formData = new FormData();
    formData.append("image", blob, "face.jpg");
    formData.append("model", "falcon");

    const res = await fetch(FAPIHUB_REMBG_URL, {
      method: "POST",
      headers: { ApiKey: apiKey },
      body: formData,
    });

    if (!res.ok) {
      const errText = await res.text().catch(() => "");
      console.error(`[remove-bg] FapiHub API returned ${res.status}: ${errText}`);
      return null;
    }

    const outBytes = Buffer.from(await res.arrayBuffer());
    console.info("[remove-bg] success", {
      inputBytes,
      outputBytes: outBytes.byteLength,
    });
    return outBytes.toString("base64");
  } catch (err) {
    console.error("[remove-bg] Background removal failed:", err);
    return null;
  }
}
