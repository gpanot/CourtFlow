import { useEffect, useRef, useState } from "react";
import type React from "react";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export type ScanPhase = "idle" | "adjust" | "capturing" | "between_retries" | "matched" | "failed";

const DEFAULTS = {
  maxFaceAttempts: 3,
  cameraWarmupMs: 1500,
  capturePollMs: 120,
  captureMaxAttempts: 45,
  retryIdleMs: 2000,
} as const;

export type FaceScannerDefaults = typeof DEFAULTS;

export interface UseFaceScannerOptions {
  /** Ref to the CameraCapture component (or anything exposing captureFrame). */
  cameraRef: React.RefObject<{ captureFrame: () => string | null } | null>;
  /** When true the loop starts; when false it stops immediately. */
  active: boolean;
  /** URL to POST `{ imageBase64, ...extraBody }` to. */
  endpoint: string;
  /** Extra headers merged into every request (e.g. kiosk secret). */
  headers?: Record<string, string>;
  /** Extra fields merged into every POST body alongside `imageBase64`. */
  extraBody?: Record<string, unknown>;
  /**
   * Called with the parsed JSON response when a frame is captured and sent.
   * Return `true`  → treat as a successful match; the loop stops and phase becomes "matched".
   * Return `false` → treat as no-match; the loop retries (up to maxFaceAttempts).
   */
  onMatch: (result: unknown) => boolean;
  /**
   * Called once when all attempts are exhausted with no match.
   * The phase will be "failed" when this fires.
   */
  onMaxAttemptsReached?: () => void;
  /** Override any of the default timing / attempt constants. */
  overrides?: Partial<FaceScannerDefaults>;
}

export interface UseFaceScannerReturn {
  /** Current phase of the scanner state machine. */
  phase: ScanPhase;
  /** 1-based current attempt number (resets to 1 after reset()). */
  attemptNumber: number;
  /** Seconds remaining in the between-retries cooldown (null when not in that phase). */
  retrySecondsLeft: number | null;
  /** Stop the loop and reset everything to idle. */
  reset: () => void;
}

// ---------------------------------------------------------------------------
// Hook
// ---------------------------------------------------------------------------

export function useFaceScanner(options: UseFaceScannerOptions): UseFaceScannerReturn {
  const {
    cameraRef,
    active,
    endpoint,
    headers,
    extraBody,
    onMatch,
    onMaxAttemptsReached,
    overrides,
  } = options;

  const cfg = { ...DEFAULTS, ...overrides };

  const [phase, setPhase] = useState<ScanPhase>("idle");
  const [attemptNumber, setAttemptNumber] = useState(1);
  const [retrySecondsLeft, setRetrySecondsLeft] = useState<number | null>(null);

  // Stable refs so the async loop always reads the latest values without
  // needing them as useEffect deps (which would restart the loop).
  const cancelledRef = useRef(false);
  const onMatchRef = useRef(onMatch);
  const onMaxRef = useRef(onMaxAttemptsReached);
  const headersRef = useRef(headers);
  const extraBodyRef = useRef(extraBody);

  useEffect(() => { onMatchRef.current = onMatch; }, [onMatch]);
  useEffect(() => { onMaxRef.current = onMaxAttemptsReached; }, [onMaxAttemptsReached]);
  useEffect(() => { headersRef.current = headers; }, [headers]);
  useEffect(() => { extraBodyRef.current = extraBody; }, [extraBody]);

  // Reset helper exposed to consumers.
  const reset = () => {
    cancelledRef.current = true;
    setPhase("idle");
    setAttemptNumber(1);
    setRetrySecondsLeft(null);
  };

  useEffect(() => {
    if (!active) {
      cancelledRef.current = true;
      setPhase("idle");
      setAttemptNumber(1);
      setRetrySecondsLeft(null);
      return;
    }

    cancelledRef.current = false;
    const sleep = (ms: number) => new Promise<void>((r) => setTimeout(r, ms));

    (async () => {
      for (let attempt = 1; attempt <= cfg.maxFaceAttempts; attempt++) {
        if (cancelledRef.current) return;

        setAttemptNumber(attempt);
        setPhase("adjust");
        await sleep(cfg.cameraWarmupMs);
        if (cancelledRef.current) return;

        setPhase("capturing");

        // Poll until a frame is available.
        let frame: string | null = null;
        for (let i = 0; i < cfg.captureMaxAttempts; i++) {
          if (cancelledRef.current) return;
          frame = cameraRef.current?.captureFrame() ?? null;
          if (frame) break;
          await sleep(cfg.capturePollMs);
        }
        if (cancelledRef.current) return;

        if (!frame) {
          // Camera never produced a usable frame — treat as failed.
          setPhase("failed");
          onMaxRef.current?.();
          return;
        }

        // POST the frame.
        let responseData: unknown;
        try {
          const res = await fetch(endpoint, {
            method: "POST",
            headers: {
              "Content-Type": "application/json",
              ...headersRef.current,
            },
            body: JSON.stringify({ imageBase64: frame, ...extraBodyRef.current }),
          });
          if (cancelledRef.current) return;
          responseData = await res.json();
          if (cancelledRef.current) return;
        } catch {
          // Network error — treat as no-match and retry if attempts remain.
          if (cancelledRef.current) return;
          responseData = null;
        }

        const matched = onMatchRef.current(responseData);

        if (matched) {
          setPhase("matched");
          return;
        }

        // No match on this attempt.
        if (attempt < cfg.maxFaceAttempts) {
          setPhase("between_retries");
          const steps = Math.ceil(cfg.retryIdleMs / 1000);
          for (let s = steps; s >= 1; s--) {
            if (cancelledRef.current) return;
            setRetrySecondsLeft(s);
            await sleep(1000);
          }
          setRetrySecondsLeft(null);
          if (cancelledRef.current) return;
        }
      }

      // All attempts exhausted.
      if (!cancelledRef.current) {
        setPhase("failed");
        onMaxRef.current?.();
      }
    })();

    return () => {
      cancelledRef.current = true;
    };
    // cfg values are derived from overrides which callers pass as literals —
    // intentionally not in deps to avoid spurious restarts. `active` and
    // `endpoint` are the only meaningful triggers for restarting the loop.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [active, endpoint]);

  return { phase, attemptNumber, retrySecondsLeft, reset };
}
