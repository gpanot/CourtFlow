export interface RelativeFaceBoundingBox {
  left: number;
  top: number;
  width: number;
  height: number;
}

interface BlurOptions {
  blurPx?: number;
  facePaddingRatio?: number;
  jpegQuality?: number;
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}

function normalizeBase64(imageBase64: string): {
  rawBase64: string;
  dataUrl: string;
} {
  const trimmed = imageBase64.trim();
  if (trimmed.startsWith("data:")) {
    const base64 = trimmed.split(",")[1] ?? "";
    return { rawBase64: base64, dataUrl: trimmed };
  }
  return {
    rawBase64: trimmed,
    dataUrl: `data:image/jpeg;base64,${trimmed}`,
  };
}

async function loadImage(dataUrl: string): Promise<HTMLImageElement> {
  const img = new Image();
  img.decoding = "async";
  img.src = dataUrl;
  if ("decode" in img) {
    try {
      await img.decode();
      return img;
    } catch {
      // Fall back to onload below for browsers where decode can reject.
    }
  }
  await new Promise<void>((resolve, reject) => {
    img.onload = () => resolve();
    img.onerror = () => reject(new Error("Could not load captured image"));
  });
  return img;
}

export async function blurBackgroundKeepFaceSharp(
  imageBase64: string,
  boundingBox?: RelativeFaceBoundingBox | null,
  options: BlurOptions = {}
): Promise<string> {
  const { rawBase64, dataUrl } = normalizeBase64(imageBase64);
  if (!boundingBox) return rawBase64;
  if (typeof window === "undefined" || typeof document === "undefined") {
    return rawBase64;
  }

  const blurPx = options.blurPx ?? 8;
  const facePaddingRatio = options.facePaddingRatio ?? 0.2;
  const jpegQuality = options.jpegQuality ?? 0.9;

  const img = await loadImage(dataUrl);
  const width = img.naturalWidth || img.width;
  const height = img.naturalHeight || img.height;
  if (!width || !height) return rawBase64;

  const canvas = document.createElement("canvas");
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext("2d");
  if (!ctx) return rawBase64;

  // Draw a heavily blurred copy of the entire frame first.
  ctx.filter = `blur(${blurPx}px)`;
  ctx.drawImage(img, 0, 0, width, height);
  ctx.filter = "none";

  const safeLeft = clamp(boundingBox.left, 0, 1);
  const safeTop = clamp(boundingBox.top, 0, 1);
  const safeWidth = clamp(boundingBox.width, 0, 1 - safeLeft);
  const safeHeight = clamp(boundingBox.height, 0, 1 - safeTop);
  if (safeWidth <= 0 || safeHeight <= 0) return rawBase64;

  const padX = safeWidth * facePaddingRatio;
  const padY = safeHeight * facePaddingRatio;
  const x = clamp((safeLeft - padX) * width, 0, width);
  const y = clamp((safeTop - padY) * height, 0, height);
  const w = clamp((safeWidth + padX * 2) * width, 1, width - x);
  const h = clamp((safeHeight + padY * 2) * height, 1, height - y);

  // Re-draw only the face area from the original image.
  ctx.drawImage(img, x, y, w, h, x, y, w, h);

  const out = canvas.toDataURL("image/jpeg", jpegQuality);
  return out.split(",")[1] ?? rawBase64;
}
