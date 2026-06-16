"use client";

/**
 * Acquire a camera stream in a context where the call is still tied to a user gesture
 * (e.g. directly inside a click handler). Browsers often deny getUserMedia if it runs
 * only after async state updates + useEffect delays.
 */
export async function acquireBrowserCameraStream(
  facingMode: "user" | "environment"
): Promise<MediaStream> {
  const hasMediaDevices = !!navigator.mediaDevices?.getUserMedia;
  console.log("[browser-camera] acquireStream — facingMode:", facingMode, "| isSecureContext:", window.isSecureContext, "| protocol:", window.location.protocol, "| hostname:", window.location.hostname, "| hasMediaDevices:", hasMediaDevices);
  if (!hasMediaDevices) {
    console.error("[browser-camera] navigator.mediaDevices.getUserMedia is not available — likely non-HTTPS and not localhost");
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
  } catch (err1) {
    console.warn("[browser-camera] ideal constraints failed:", err1, "— retrying with basic facingMode");
    try {
      return await g({ video: { facingMode }, audio: false });
    } catch (err2) {
      console.warn("[browser-camera] basic facingMode failed:", err2, "— retrying with video:true");
      return await g({ video: true, audio: false });
    }
  }
}

export function stopMediaStream(stream: MediaStream | null | undefined): void {
  stream?.getTracks().forEach((t) => t.stop());
}
