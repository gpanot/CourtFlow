import React, { useCallback, useEffect, useRef, useState } from "react";
import {
  View,
  Text,
  TouchableOpacity,
  StyleSheet,
  ActivityIndicator,
} from "react-native";
import { CameraView, useCameraPermissions } from "expo-camera";
import { Ionicons } from "@expo/vector-icons";

/** Aligned with PWA `self-check-in-scanner.tsx` */
const CAMERA_WARMUP_MS = 1500;
const CAPTURE_POLL_MS = 120;
const CAPTURE_MAX_ATTEMPTS = 45;
const MAX_FACE_ATTEMPTS = 3;
const RETRY_IDLE_MS = 2000;

const CIRCLE_SIZE = 280;

const COURTPAY_ACCENT = {
  circleBorder: "rgba(192,38,211,0.5)",
  circleShadow: "#701a75",
  link: "#e879f9",
  primary: "#c026d3",
  spinner: "#d946ef",
};

type ScanPhase = "adjust" | "capturing" | "between_retries";

export type ReturningFrameResult = "continue_scan" | "done";

export type ReturningScannerCopy = {
  noMatchYet: string;
  positionFace: string;
  holdStill: string;
  nextScanIn: string;
  scanning: string;
  retryAuto: string;
  cameraReady: string;
  cameraStarting: string;
  checkInWithPhone: string;
  back: string;
  allowCameraTitle: string;
  allowCameraHint: string;
  allowCameraCta: string;
};

type Props = {
  venueId: string | null;
  active: boolean;
  copy: ReturningScannerCopy;
  onSubmitFrame: (imageBase64: string) => Promise<ReturningFrameResult>;
  onExhaustedRetries: () => void;
  onCameraNotReady: () => void;
  onUsePhone: () => void;
  onBack: () => void;
  /** CourtPay kiosk: fuchsia chrome instead of green. */
  accent?: "default" | "courtpay";
};

function sleep(ms: number) {
  return new Promise<void>((r) => setTimeout(r, ms));
}

export function SelfCheckInReturningFaceScanner({
  venueId,
  active,
  copy,
  onSubmitFrame,
  onExhaustedRetries,
  onCameraNotReady,
  onUsePhone,
  onBack,
  accent = "default",
}: Props) {
  const isCourtPay = accent === "courtpay";
  const [permission, requestPermission] = useCameraPermissions();
  const cameraRef = useRef<CameraView | null>(null);
  const cameraReadyRef = useRef(false);
  const [cameraReady, setCameraReady] = useState(false);
  const [scanPhase, setScanPhase] = useState<ScanPhase>("adjust");
  const [retrySecondsLeft, setRetrySecondsLeft] = useState<number | null>(null);

  const onCameraReady = useCallback(() => {
    cameraReadyRef.current = true;
    setCameraReady(true);
  }, []);

  useEffect(() => {
    if (!active) {
      cameraReadyRef.current = false;
      setCameraReady(false);
      setScanPhase("adjust");
      setRetrySecondsLeft(null);
    }
  }, [active]);

  useEffect(() => {
    if (!active || !venueId) return;

    let cancelled = false;

    (async () => {
      for (let attempt = 1; attempt <= MAX_FACE_ATTEMPTS && !cancelled; attempt++) {
        setScanPhase("adjust");
        await sleep(CAMERA_WARMUP_MS);
        if (cancelled) return;

        setScanPhase("capturing");

        let frame: string | null = null;
        for (let i = 0; i < CAPTURE_MAX_ATTEMPTS && !cancelled; i++) {
          if (!cameraRef.current || !cameraReadyRef.current) {
            await sleep(CAPTURE_POLL_MS);
            continue;
          }
          try {
            const photo = await cameraRef.current.takePictureAsync({
              quality: 0.45,
              base64: true,
              skipProcessing: false,
            });
            if (photo?.base64) {
              frame = photo.base64;
              break;
            }
          } catch {
            /* retry poll */
          }
          await sleep(CAPTURE_POLL_MS);
        }

        if (cancelled) return;

        if (!frame) {
          onCameraNotReady();
          return;
        }

        const outcome = await onSubmitFrame(frame);
        if (cancelled) return;

        if (outcome === "done") return;

        if (attempt < MAX_FACE_ATTEMPTS) {
          setScanPhase("between_retries");
          const steps = Math.ceil(RETRY_IDLE_MS / 1000);
          for (let s = steps; s >= 1 && !cancelled; s--) {
            setRetrySecondsLeft(s);
            await sleep(1000);
          }
          setRetrySecondsLeft(null);
        }
      }

      if (!cancelled) onExhaustedRetries();
    })();

    return () => {
      cancelled = true;
    };
  }, [active, venueId, onSubmitFrame, onExhaustedRetries, onCameraNotReady]);

  if (!permission) {
    return (
      <View style={styles.center}>
        <ActivityIndicator
          color={isCourtPay ? COURTPAY_ACCENT.spinner : "#22c55e"}
          size="large"
        />
      </View>
    );
  }

  if (!permission.granted) {
    return (
      <View style={styles.center}>
        <Text style={styles.title}>{copy.allowCameraTitle}</Text>
        <Text style={styles.subtitle}>{copy.allowCameraHint}</Text>
        <TouchableOpacity
          style={[styles.primaryBtn, isCourtPay && styles.primaryBtnCourtPay]}
          onPress={requestPermission}
        >
          <Text style={styles.primaryBtnText}>{copy.allowCameraCta}</Text>
        </TouchableOpacity>
        <TouchableOpacity style={styles.textBtn} onPress={onBack}>
          <Text style={styles.textBtnLabel}>{copy.back}</Text>
        </TouchableOpacity>
      </View>
    );
  }

  const hint =
    scanPhase === "between_retries"
      ? copy.noMatchYet
      : scanPhase === "adjust"
        ? copy.positionFace
        : copy.holdStill;

  return (
    <View style={styles.root}>
      <Text style={styles.hint}>{hint}</Text>

      <View
        style={[
          styles.circleOuter,
          isCourtPay && {
            borderColor: COURTPAY_ACCENT.circleBorder,
            shadowColor: COURTPAY_ACCENT.circleShadow,
          },
        ]}
      >
        <View style={styles.circleClip}>
          <CameraView
            ref={cameraRef}
            style={styles.cameraFill}
            facing="front"
            mirror
            onCameraReady={onCameraReady}
          />
        </View>
        {scanPhase === "between_retries" && retrySecondsLeft != null ? (
          <View style={styles.retryOverlay}>
            <Text style={styles.retryTitle}>{copy.nextScanIn}</Text>
            <Text style={styles.retryCount}>{retrySecondsLeft}</Text>
          </View>
        ) : null}
      </View>

      {scanPhase === "capturing" ? (
        <View style={styles.statusRow}>
          <ActivityIndicator
            color={isCourtPay ? COURTPAY_ACCENT.spinner : "#22c55e"}
          />
          <Text style={styles.statusText}>{copy.scanning}</Text>
        </View>
      ) : scanPhase === "between_retries" ? (
        <Text style={styles.retryHint}>{copy.retryAuto}</Text>
      ) : (
        <Text style={styles.readyHint}>
          {cameraReady ? copy.cameraReady : copy.cameraStarting}
        </Text>
      )}

      <TouchableOpacity style={styles.linkRow} onPress={onUsePhone}>
        <Ionicons
          name="call-outline"
          size={18}
          color={isCourtPay ? COURTPAY_ACCENT.link : "#3b82f6"}
        />
        <Text
          style={[styles.linkText, isCourtPay && styles.linkTextCourtPay]}
        >
          {copy.checkInWithPhone}
        </Text>
      </TouchableOpacity>

      <TouchableOpacity style={styles.textBtn} onPress={onBack}>
        <Text style={styles.textBtnLabel}>{copy.back}</Text>
      </TouchableOpacity>
    </View>
  );
}

const styles = StyleSheet.create({
  root: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    gap: 16,
    paddingVertical: 12,
  },
  center: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    gap: 16,
    paddingHorizontal: 24,
  },
  title: {
    fontSize: 22,
    fontWeight: "700",
    color: "#fff",
    textAlign: "center",
  },
  subtitle: {
    fontSize: 15,
    color: "#a3a3a3",
    textAlign: "center",
    lineHeight: 22,
  },
  hint: {
    fontSize: 17,
    color: "#d4d4d4",
    textAlign: "center",
    paddingHorizontal: 12,
  },
  circleOuter: {
    position: "relative",
    width: CIRCLE_SIZE,
    height: CIRCLE_SIZE,
    borderRadius: CIRCLE_SIZE / 2,
    borderWidth: 3,
    borderColor: "rgba(34,197,94,0.45)",
    backgroundColor: "#000",
    overflow: "hidden",
    justifyContent: "center",
    alignItems: "center",
    shadowColor: "#14532d",
    shadowOpacity: 0.35,
    shadowRadius: 16,
    shadowOffset: { width: 0, height: 8 },
  },
  circleClip: {
    width: CIRCLE_SIZE - 6,
    height: CIRCLE_SIZE - 6,
    borderRadius: (CIRCLE_SIZE - 6) / 2,
    overflow: "hidden",
    backgroundColor: "#000",
  },
  cameraFill: {
    width: (CIRCLE_SIZE - 6) * 1.18,
    height: (CIRCLE_SIZE - 6) * 1.18,
    alignSelf: "center",
    marginTop: -(CIRCLE_SIZE - 6) * 0.09,
  },
  retryOverlay: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: "rgba(0,0,0,0.55)",
    justifyContent: "center",
    alignItems: "center",
    borderRadius: CIRCLE_SIZE / 2,
  },
  retryTitle: { fontSize: 22, fontWeight: "600", color: "#fff" },
  retryCount: {
    marginTop: 8,
    fontSize: 48,
    fontWeight: "700",
    color: "#4ade80",
    fontVariant: ["tabular-nums"],
  },
  statusRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
  },
  statusText: { fontSize: 15, color: "#a3a3a3" },
  retryHint: { fontSize: 14, color: "rgba(253,224,71,0.9)" },
  readyHint: { fontSize: 14, color: "#737373" },
  linkRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    marginTop: 8,
    paddingVertical: 10,
  },
  linkText: { fontSize: 16, color: "#3b82f6", fontWeight: "600" },
  textBtn: { paddingVertical: 12 },
  textBtnLabel: { fontSize: 16, color: "#737373" },
  primaryBtn: {
    backgroundColor: "#2563eb",
    paddingHorizontal: 28,
    height: 48,
    borderRadius: 12,
    justifyContent: "center",
    alignItems: "center",
  },
  primaryBtnCourtPay: {
    backgroundColor: COURTPAY_ACCENT.primary,
  },
  primaryBtnText: { color: "#fff", fontSize: 16, fontWeight: "600" },
  linkTextCourtPay: {
    color: COURTPAY_ACCENT.link,
  },
});
