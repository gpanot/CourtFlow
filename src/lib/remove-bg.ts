/**
 * Shared utility for calling the remove.bg API.
 * Used by:
 *  - enrollFace() auto-retry when AWS DetectFaces returns "no face"
 *  - Admin player detail manual "Remove background" action
 */

const REMOVE_BG_API_URL = "https://api.remove.bg/v1.0/removebg";

/**
 * Remove background from a raw base64-encoded image using the remove.bg API.
 * Returns the cleaned image as a raw base64 string (no data-URL prefix).
 * Returns `null` if the API key is missing or the call fails (non-throwing).
 */
export async function removeBackgroundFromBase64(
  imageBase64: string
): Promise<string | null> {
  const apiKey = process.env.REMOVE_BG_API_KEY?.trim();
  if (!apiKey) {
    console.warn("[remove-bg] REMOVE_BG_API_KEY not configured — skipping background removal");
    return null;
  }

  try {
    const imageBuffer = Buffer.from(imageBase64, "base64");
    const blob = new Blob([new Uint8Array(imageBuffer)], { type: "image/jpeg" });

    const formData = new FormData();
    formData.append("image_file", blob, "face.jpg");
    formData.append("size", "auto");
    formData.append("type", "person");
    formData.append("format", "png");

    const res = await fetch(REMOVE_BG_API_URL, {
      method: "POST",
      headers: { "X-Api-Key": apiKey },
      body: formData,
    });

    if (!res.ok) {
      const errText = await res.text().catch(() => "");
      console.error(`[remove-bg] API returned ${res.status}: ${errText}`);
      return null;
    }

    const outBytes = Buffer.from(await res.arrayBuffer());
    return outBytes.toString("base64");
  } catch (err) {
    console.error("[remove-bg] Background removal failed:", err);
    return null;
  }
}
