"use client";

/**
 * Attach a MediaStream to a &lt;video&gt; and wait until it can play (required for Chrome / Safari / PWA).
 */
export async function attachStreamToVideo(video: HTMLVideoElement, stream: MediaStream): Promise<void> {
  video.srcObject = stream;
  video.muted = true;
  video.defaultMuted = true;
  video.setAttribute("playsinline", "true");
  video.playsInline = true;

  await new Promise<void>((resolve, reject) => {
    const done = () => {
      video.removeEventListener("loadedmetadata", onMeta);
      video.removeEventListener("error", onErr);
    };
    const onErr = () => {
      done();
      reject(new Error("Video failed to load stream"));
    };
    const play = () =>
      video
        .play()
        .then(() => {
          done();
          resolve();
        })
        .catch((e) => {
          done();
          reject(e instanceof Error ? e : new Error(String(e)));
        });

    const onMeta = () => {
      void play();
    };

    video.addEventListener("error", onErr, { once: true });

    if (video.readyState >= HTMLMediaElement.HAVE_METADATA) {
      void play();
    } else {
      video.addEventListener("loadedmetadata", onMeta, { once: true });
    }
  });
}
