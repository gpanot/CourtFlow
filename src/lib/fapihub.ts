function normalizeBase64(imageBase64: string): string {
  const value = imageBase64.trim();
  const comma = value.indexOf(",");
  if (value.startsWith("data:") && comma >= 0) {
    return value.slice(comma + 1).trim();
  }
  return value;
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

  const resultBuffer = await response.arrayBuffer();
  return Buffer.from(resultBuffer).toString("base64");
}
