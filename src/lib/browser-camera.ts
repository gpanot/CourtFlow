"use client";

/**
 * Acquire a camera stream in a context where the call is still tied to a user gesture
 * (e.g. directly inside a click handler). Browsers often deny getUserMedia if it runs
 * only after async state updates + useEffect delays.
 */
export async function acquireBrowserCameraStream(
  facingMode: "user" | "environment"
): Promise<MediaStream> {
  if (!navigator.mediaDevices?.getUserMedia) {
    throw new Error("Camera API not available in this browser.");
  }
  const g = (c: MediaStreamConstraints) => navigator.mediaDevices.getUserMedia(c);
  try {
    return await g({
      video: {
        width: { ideal: 1280 },
        height: { ideal: 720 },
        facingMode,
        aspectRatio: { ideal: 16 / 9 },
        frameRate: { ideal: 30 },
      },
      audio: false,
    });
  } catch {
    try {
      return await g({ video: { facingMode }, audio: false });
    } catch {
      return await g({ video: true, audio: false });
    }
  }
}

export function stopMediaStream(stream: MediaStream | null | undefined): void {
  stream?.getTracks().forEach((t) => t.stop());
}
