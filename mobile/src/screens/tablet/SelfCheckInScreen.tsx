import React, { useState, useCallback, useRef, useEffect, useMemo } from "react";
import {
  View,
  Text,
  TextInput,
  TouchableOpacity,
  StyleSheet,
  ActivityIndicator,
  Image,
  ScrollView,
  Pressable,
  Animated,
  Easing,
  Keyboard,
  Modal,
  BackHandler,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Ionicons } from "@expo/vector-icons";
import { ScanFace, UserPlus } from "lucide-react-native";
import { CameraView, useCameraPermissions } from "expo-camera";
import { StatusBar } from "expo-status-bar";
import { api } from "../../lib/api-client";
import { ENV } from "../../config/env";
import { useAuthStore } from "../../stores/auth-store";
import { useSocket } from "../../hooks/useSocket";
import { useTabletKioskLocale } from "../../hooks/useTabletKioskLocale";
import {
  SelfCheckInReturningFaceScanner,
  type ReturningFrameResult,
} from "../../components/SelfCheckInReturningFaceScanner";
import { TabletStaffEscape } from "../../components/TabletStaffEscape";
import { CourtFlowKioskTopBar } from "../../components/CourtFlowKioskTopBar";
import type { CheckInScannerStringKey } from "../../lib/tablet-check-in-strings";
import type { TabletStackScreenProps } from "../../navigation/types";

type Step =
  | "home"
  | "scan_returning"
  | "no_face"
  | "needs_registration"
  | "phone_enter"
  | "phone_preview"
  | "reg_face_capture"
  | "reg_face_preview"
  | "reg_form"
  | "awaiting_payment"
  | "confirmed"
  | "existing_user"
  | "error";

const IDLE_TIMEOUT_MS = 30_000;
const REG_FACE_CIRCLE = 260;
const CONFIRMED_AUTO_HOME_SEC = 5;
const NO_IDLE_TIMEOUT_STEPS: Step[] = [
  "home",
  "confirmed",
  "reg_face_capture",
  "reg_face_preview",
  "reg_form",
];

function resolveVenueMediaUrl(url: string | null | undefined): string | null {
  if (!url || typeof url !== "string") return null;
  const trimmed = url.trim();
  if (
    /^https?:\/\//i.test(trimmed) ||
    trimmed.startsWith("data:") ||
    trimmed.startsWith("file:")
  ) {
    return trimmed;
  }
  const base = ENV.API_BASE_URL.replace(/\/$/, "");
  return `${base}${trimmed.startsWith("/") ? trimmed : `/${trimmed}`}`;
}

interface SimplePlayer {
  id: string;
  name: string;
  phone?: string;
  skillLevel?: string;
  gender?: string;
}

interface PendingPaymentState {
  id: string;
  amount: number;
  paymentRef: string;
  qrUrl: string | null;
  playerName: string;
}

interface CheckinPaymentResponse {
  pendingPaymentId?: string;
  amount?: number;
  vietQR?: string | null;
  playerName?: string;
  resultType?: string;
  error?: string;
  queueNumber?: number;
}

export function SelfCheckInScreen({
  navigation,
}: TabletStackScreenProps<"SelfCheckIn">) {
  const venueId = useAuthStore((s) => s.venueId);
  const venues = useAuthStore((s) => s.venues);
  const insets = useSafeAreaInsets();
  const { locale, toggleLocale, t } = useTabletKioskLocale();
  const [venueApiName, setVenueApiName] = useState("");
  const [venueLogoPath, setVenueLogoPath] = useState<string | null>(null);
  const [venueLogoSpin, setVenueLogoSpin] = useState(false);
  const logoSpinValue = useRef(new Animated.Value(0)).current;
  const logoSpinLoopRef = useRef<Animated.CompositeAnimation | null>(null);

  const venueName =
    venueApiName.trim() ||
    (venueId ? venues.find((v) => v.id === venueId)?.name : "") ||
    "";

  const resolvedLogoUri = resolveVenueMediaUrl(venueLogoPath);

  const returningScannerCopy = useMemo(
    () => ({
      noMatchYet: t("noMatchYet"),
      positionFace: t("positionFace"),
      holdStill: t("holdStill"),
      nextScanIn: t("nextScanIn"),
      scanning: t("scanning"),
      retryAuto: t("retryAuto"),
      cameraReady: t("cameraReady"),
      cameraStarting: t("cameraStarting"),
      checkInWithPhone: t("checkInWithPhone"),
      back: t("back"),
      allowCameraTitle: t("cameraPermissionTitle"),
      allowCameraHint: t("faceHint"),
      allowCameraCta: t("allowCameraCta"),
    }),
    [t]
  );

  const [step, setStep] = useState<Step>("home");
  const [phoneInput, setPhoneInput] = useState("");
  const [phoneError, setPhoneError] = useState("");
  const [phoneLoading, setPhoneLoading] = useState(false);
  const [phonePreview, setPhonePreview] = useState<SimplePlayer | null>(null);
  const [name, setName] = useState("");
  const [gender, setGender] = useState<"male" | "female" | null>(null);
  const [skillLevel, setSkillLevel] = useState<
    "beginner" | "intermediate" | "advanced" | null
  >(null);
  const [faceBase64, setFaceBase64] = useState<string | null>(null);
  const [regCheckingFace, setRegCheckingFace] = useState(false);
  const [regCaptureBusy, setRegCaptureBusy] = useState(false);
  const [loading, setLoading] = useState(false);
  const [confirmedSeconds, setConfirmedSeconds] = useState(
    CONFIRMED_AUTO_HOME_SEC
  );
  const [error, setError] = useState("");
  const [confirmMessage, setConfirmMessage] = useState("Check-in complete");
  const [pendingPayment, setPendingPayment] = useState<PendingPaymentState | null>(
    null
  );
  const [cashPending, setCashPending] = useState(false);
  const idleTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const regCameraRef = useRef<CameraView | null>(null);
  const regCameraReady = useRef(false);
  const confirmedIntervalRef = useRef<ReturnType<typeof setInterval> | null>(
    null
  );
  const [permission, requestPermission] = useCameraPermissions();

  // ── Block OS back button / swipe-back on this kiosk screen ─────────────────
  useEffect(() => {
    const sub = BackHandler.addEventListener("hardwareBackPress", () => true);
    return () => sub.remove();
  }, []);

  useEffect(() => {
    if (!venueId) return;
    let cancelled = false;
    void api
      .get<{
        name?: string;
        logoUrl?: string | null;
        settings?: unknown;
      }>(`/api/venues/${venueId}`)
      .then((v) => {
        if (cancelled) return;
        if (typeof v.name === "string") setVenueApiName(v.name);
        setVenueLogoPath(typeof v.logoUrl === "string" ? v.logoUrl : null);
        const st = v.settings as { logoSpin?: boolean } | undefined;
        setVenueLogoSpin(!!st?.logoSpin);
      })
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, [venueId]);

  useEffect(() => {
    logoSpinLoopRef.current?.stop();
    logoSpinLoopRef.current = null;

    const shouldAnimate = step === "home" && venueLogoSpin && !!resolvedLogoUri;
    if (!shouldAnimate) {
      logoSpinValue.setValue(0);
      return;
    }

    logoSpinValue.setValue(0);
    const loop = Animated.loop(
      Animated.timing(logoSpinValue, {
        toValue: 1,
        duration: 6000,
        easing: Easing.linear,
        useNativeDriver: true,
      })
    );
    logoSpinLoopRef.current = loop;
    loop.start();

    return () => {
      loop.stop();
      if (logoSpinLoopRef.current === loop) {
        logoSpinLoopRef.current = null;
      }
    };
  }, [step, venueLogoSpin, resolvedLogoUri, logoSpinValue]);

  const logoAnimatedStyle = venueLogoSpin
    ? {
        transform: [
          {
            rotate: logoSpinValue.interpolate({
              inputRange: [0, 1],
              outputRange: ["0deg", "360deg"],
            }),
          },
        ],
      }
    : undefined;

  const resetToHome = useCallback(() => {
    if (confirmedIntervalRef.current) {
      clearInterval(confirmedIntervalRef.current);
      confirmedIntervalRef.current = null;
    }
    regCameraReady.current = false;
    setStep("home");
    setPhoneInput("");
    setPhoneError("");
    setPhonePreview(null);
    setName("");
    setGender(null);
    setSkillLevel(null);
    setFaceBase64(null);
    setRegCheckingFace(false);
    setRegCaptureBusy(false);
    setPendingPayment(null);
    setCashPending(false);
    setConfirmMessage(t("checkInComplete"));
    setError("");
    setLoading(false);
    setConfirmedSeconds(CONFIRMED_AUTO_HOME_SEC);
  }, [t]);

  useEffect(() => {
    if (step !== "confirmed") {
      if (confirmedIntervalRef.current) {
        clearInterval(confirmedIntervalRef.current);
        confirmedIntervalRef.current = null;
      }
      return;
    }
    setConfirmedSeconds(CONFIRMED_AUTO_HOME_SEC);
    let sec = CONFIRMED_AUTO_HOME_SEC;
    confirmedIntervalRef.current = setInterval(() => {
      sec -= 1;
      setConfirmedSeconds(sec);
      if (sec <= 0) {
        if (confirmedIntervalRef.current) {
          clearInterval(confirmedIntervalRef.current);
          confirmedIntervalRef.current = null;
        }
        resetToHome();
      }
    }, 1000);
    return () => {
      if (confirmedIntervalRef.current) {
        clearInterval(confirmedIntervalRef.current);
        confirmedIntervalRef.current = null;
      }
    };
  }, [step, resetToHome]);

  const restartIdleTimer = useCallback(() => {
    if (idleTimer.current) clearTimeout(idleTimer.current);
    idleTimer.current = setTimeout(resetToHome, IDLE_TIMEOUT_MS);
  }, [resetToHome]);

  useEffect(() => {
    return () => {
      if (idleTimer.current) clearTimeout(idleTimer.current);
    };
  }, []);

  useEffect(() => {
    if (NO_IDLE_TIMEOUT_STEPS.includes(step)) {
      if (idleTimer.current) {
        clearTimeout(idleTimer.current);
        idleTimer.current = null;
      }
      return;
    }
    restartIdleTimer();
  }, [step, restartIdleTimer]);

  useSocket(venueId, {
    "payment:confirmed": (data: unknown) => {
      const d = data as { pendingPaymentId?: string; playerName?: string };
      if (pendingPayment && d.pendingPaymentId === pendingPayment.id) {
        setCashPending(false);
        setConfirmMessage(
          d.playerName ? `Welcome ${d.playerName}! You are checked in.` : "Payment confirmed."
        );
        setStep("confirmed");
      }
    },
    "payment:cancelled": (data: unknown) => {
      const d = data as { pendingPaymentId?: string };
      if (pendingPayment && d.pendingPaymentId === pendingPayment.id) {
        resetToHome();
      }
    },
  });

  const applyCheckinPaymentResult = useCallback(
    (data: CheckinPaymentResponse): ReturningFrameResult => {
      if (data.resultType === "needs_registration") {
        setStep("needs_registration");
        return "done";
      }
      if (data.resultType === "already_checked_in") {
        setConfirmMessage(
          data.playerName
            ? `${data.playerName} is already checked in${data.queueNumber ? ` (#${data.queueNumber})` : ""}.`
            : "Already checked in."
        );
        setStep("confirmed");
        return "done";
      }
      if (data.resultType === "no_face" || data.resultType === "multi_face") {
        return "continue_scan";
      }
      if (data.resultType === "error") {
        setError(data.error ?? t("somethingWrong"));
        setStep("error");
        return "done";
      }
      if (data.pendingPaymentId) {
        setPendingPayment({
          id: data.pendingPaymentId,
          amount: data.amount ?? 0,
          paymentRef: "",
          qrUrl: data.vietQR ?? null,
          playerName: data.playerName ?? "",
        });
        setStep("awaiting_payment");
        return "done";
      }
      setConfirmMessage(t("checkInComplete"));
      setStep("confirmed");
      return "done";
    },
    [t]
  );

  const submitReturningFrame = useCallback(
    async (imageBase64: string): Promise<ReturningFrameResult> => {
      if (!venueId) return "done";
      restartIdleTimer();
      setError("");
      try {
        const data = await api.post<CheckinPaymentResponse>(
          "/api/kiosk/checkin-payment",
          { venueId, imageBase64 }
        );
        return applyCheckinPaymentResult(data);
      } catch (err) {
        setError(err instanceof Error ? err.message : "Failed");
        setStep("error");
        return "done";
      }
    },
    [venueId, restartIdleTimer, applyCheckinPaymentResult]
  );

  const handlePhoneLookup = async () => {
    if (!phoneInput.trim() || !venueId) return;
    setPhoneLoading(true);
    setPhoneError("");
    restartIdleTimer();
    try {
      const data = await api.post<{
        player: SimplePlayer;
      }>("/api/kiosk/phone-check-in", {
        phase: "lookup",
        phone: phoneInput.trim(),
        venueId,
      });
      if (data.player) {
        setPhonePreview(data.player);
        setStep("phone_preview");
      }
    } catch (err) {
      setPhoneError(err instanceof Error ? err.message : "Could not find player");
    } finally {
      setPhoneLoading(false);
    }
  };

  const handlePhoneConfirm = async () => {
    if (!phonePreview || !venueId) return;
    setLoading(true);
    setError("");
    try {
      const data = await api.post<{
        pendingPaymentId?: string;
        amount?: number;
        vietQR?: string | null;
        playerName?: string;
        resultType?: string;
        queueNumber?: number;
      }>("/api/kiosk/checkin-payment", {
        venueId,
        playerId: phonePreview.id,
      });

      if (data.resultType === "already_checked_in") {
        setConfirmMessage(
          data.playerName
            ? `${data.playerName} is already checked in${data.queueNumber ? ` (#${data.queueNumber})` : ""}.`
            : "Already checked in."
        );
        setStep("confirmed");
      } else if (data.pendingPaymentId) {
        setPendingPayment({
          id: data.pendingPaymentId,
          amount: data.amount ?? 0,
          paymentRef: "",
          qrUrl: data.vietQR ?? null,
          playerName: data.playerName ?? phonePreview.name,
        });
        setStep("awaiting_payment");
      } else {
        setConfirmMessage(t("checkInComplete"));
        setStep("confirmed");
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed");
      setStep("error");
    } finally {
      setLoading(false);
    }
  };

  const captureRegistrationPhoto = async () => {
    if (!regCameraRef.current || !regCameraReady.current || regCaptureBusy) {
      return;
    }
    setRegCaptureBusy(true);
    try {
      const photo = await regCameraRef.current.takePictureAsync({
        quality: 0.72,
        base64: true,
      });
      if (photo?.base64) {
        setFaceBase64(photo.base64);
        setStep("reg_face_preview");
      }
    } finally {
      setRegCaptureBusy(false);
    }
  };

  const handleCaptureRegistrationFace = async () => {
    if (!faceBase64) return;
    setRegCheckingFace(true);
    setError("");
    try {
      const res = await api.post<{ existing: boolean; playerName?: string }>(
        "/api/kiosk/check-existing-face",
        { imageBase64: faceBase64 }
      );
      if (res.existing) {
        setConfirmMessage(
          res.playerName
            ? `${res.playerName} already exists. Use Check In.`
            : "This face is already registered."
        );
        setStep("existing_user");
      } else {
        setStep("reg_form");
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "Face check failed");
      setStep("error");
    } finally {
      setRegCheckingFace(false);
    }
  };

  const handleRegister = async () => {
    if (!name.trim() || !phoneInput.trim() || !venueId || !faceBase64 || !gender || !skillLevel) {
      return;
    }
    setLoading(true);
    setError("");
    try {
      const data = await api.post<{
        pendingPaymentId?: string;
        amount?: number;
        vietQR?: string | null;
        playerName?: string;
      }>("/api/kiosk/register", {
        venueId,
        imageBase64: faceBase64,
        name: name.trim(),
        phone: phoneInput.trim(),
        gender,
        skillLevel,
      });
      if (data.pendingPaymentId) {
        setPendingPayment({
          id: data.pendingPaymentId,
          amount: data.amount ?? 0,
          paymentRef: "",
          qrUrl: data.vietQR ?? null,
          playerName: data.playerName ?? name.trim(),
        });
        setStep("awaiting_payment");
      } else {
        setConfirmMessage(t("registrationComplete"));
        setStep("confirmed");
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "Registration failed");
      setStep("error");
    } finally {
      setLoading(false);
    }
  };

  const handleCash = async () => {
    if (!pendingPayment) return;
    setLoading(true);
    try {
      await api.post("/api/kiosk/cash-payment", {
        pendingPaymentId: pendingPayment.id,
      });
      // Show overlay — staff must confirm. Socket payment:confirmed will resolve it.
      setCashPending(true);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Cash payment failed");
      setStep("error");
    } finally {
      setLoading(false);
    }
  };

  const handleCancelPayment = async () => {
    if (!pendingPayment) {
      resetToHome();
      return;
    }
    // Await with a 4s timeout so the kiosk always resets even on slow networks,
    // but the DB is updated before the kiosk screen clears.
    try {
      await Promise.race([
        api.post("/api/kiosk/cancel-payment", { pendingPaymentId: pendingPayment.id }),
        new Promise<void>((_, reject) =>
          setTimeout(() => reject(new Error("timeout")), 4000)
        ),
      ]);
    } catch {
      // Best-effort — reset kiosk regardless
    }
    resetToHome();
  };

  const renderStep = () => {
    switch (step) {
      case "home":
        return (
          <View style={styles.homeRoot}>
            {resolvedLogoUri ? (
              venueLogoSpin ? (
                <Animated.View style={[styles.venueLogoCircle, logoAnimatedStyle]}>
                  <Image
                    source={{ uri: resolvedLogoUri }}
                    style={styles.venueLogoImageFixed}
                    resizeMode="cover"
                    accessibilityLabel={venueName || "Venue logo"}
                  />
                </Animated.View>
              ) : (
                <View style={styles.venueLogoCircle}>
                  <Image
                    source={{ uri: resolvedLogoUri }}
                    style={styles.venueLogoImageFixed}
                    resizeMode="cover"
                    accessibilityLabel={venueName || "Venue logo"}
                  />
                </View>
              )
            ) : null}
            {venueName ? (
              <Text style={styles.venueNameMuted}>{venueName}</Text>
            ) : null}
            <View style={styles.homeActionsWide}>
              <TouchableOpacity
                style={styles.homeCardPrimary}
                activeOpacity={0.92}
                onPress={() => {
                  setFaceBase64(null);
                  setStep("scan_returning");
                  restartIdleTimer();
                }}
              >
                <ScanFace size={40} color="#4ade80" strokeWidth={2} />
                <View style={styles.homeCardTextCol}>
                  <Text style={styles.homeCardTitle}>{t("homeCheckIn")}</Text>
                  <Text style={styles.homeCardSub}>{t("homeCheckInSub")}</Text>
                </View>
              </TouchableOpacity>
              <TouchableOpacity
                style={styles.homeCardSecondary}
                activeOpacity={0.92}
                onPress={() => {
                  setFaceBase64(null);
                  setStep("reg_face_capture");
                  restartIdleTimer();
                }}
              >
                <UserPlus size={40} color="#a3a3a3" strokeWidth={2} />
                <View style={styles.homeCardTextCol}>
                  <Text style={styles.homeCardTitle}>{t("homeFirstTime")}</Text>
                  <Text style={styles.homeCardSubMuted}>
                    {t("homeFirstTimeSub")}
                  </Text>
                </View>
              </TouchableOpacity>
            </View>
          </View>
        );

      case "scan_returning":
        return (
          <SelfCheckInReturningFaceScanner
            venueId={venueId}
            active
            copy={returningScannerCopy}
            onSubmitFrame={submitReturningFrame}
            onExhaustedRetries={() => setStep("no_face")}
            onCameraNotReady={() => {
              setError("Camera not ready — try again.");
              setStep("error");
            }}
            onUsePhone={() => setStep("phone_enter")}
            onBack={resetToHome}
          />
        );

      case "no_face":
        return (
          <View style={styles.centerContent}>
            <Ionicons name="scan-outline" size={56} color="#fbbf24" />
            <Text style={styles.formTitle}>{t("noFaceDetected")}</Text>
            <Text style={styles.heroSubtitle}>{t("lookAtCamera")}</Text>
            <TouchableOpacity
              style={styles.primaryBtn}
              onPress={() => setStep("scan_returning")}
            >
              <Text style={styles.primaryBtnText}>{t("tryAgainGeneric")}</Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={styles.secondaryActionBtn}
              onPress={() => setStep("phone_enter")}
            >
              <Ionicons name="call-outline" size={18} color="#3b82f6" />
              <Text style={styles.secondaryActionText}>
                {t("usePhoneInstead")}
              </Text>
            </TouchableOpacity>
            <TouchableOpacity style={styles.cancelBtn} onPress={resetToHome}>
              <Text style={styles.cancelText}>{t("backToHome")}</Text>
            </TouchableOpacity>
          </View>
        );

      case "needs_registration":
        return (
          <View style={[styles.centerContent, styles.needsRegRoot]}>
            <Pressable
              style={[styles.needsRegBack, { top: insets.top + 4, left: 12 }]}
              onPress={resetToHome}
              hitSlop={12}
            >
              <Ionicons name="arrow-back" size={26} color="#a3a3a3" />
            </Pressable>
            <Ionicons name="alert-circle-outline" size={60} color="#f59e0b" />
            <Text style={styles.formTitle}>{t("faceNotRecognized")}</Text>
            <Text style={styles.heroSubtitle}>{t("faceNotRecognizedHint")}</Text>
            <TouchableOpacity
              style={styles.scanAgainBig}
              onPress={() => setStep("scan_returning")}
              activeOpacity={0.92}
            >
              <Text style={styles.scanAgainBigText}>{t("scanAgain")}</Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={styles.phoneBlueBtn}
              onPress={() => setStep("phone_enter")}
              activeOpacity={0.9}
            >
              <Ionicons name="call-outline" size={20} color="#fff" />
              <Text style={styles.phoneBlueBtnText}>{t("checkInWithPhone")}</Text>
            </TouchableOpacity>
          </View>
        );

      case "phone_enter":
        return (
          <View style={styles.formContent}>
            <View style={styles.phoneCard}>
              <View style={styles.phoneCardHeader}>
                <TouchableOpacity
                  style={styles.iconGhostBtn}
                  onPress={resetToHome}
                  hitSlop={10}
                >
                  <Ionicons name="arrow-back" size={22} color="#a3a3a3" />
                </TouchableOpacity>
                <Text style={styles.phoneCardTitle}>{t("checkInByPhone")}</Text>
              </View>
              <Text style={styles.phoneCardHint}>{t("enterPhonePrompt")}</Text>
              <TextInput
                style={styles.bigInput}
                value={phoneInput}
                onChangeText={(v) => {
                  setPhoneInput(v);
                  restartIdleTimer();
                }}
                keyboardType="phone-pad"
                placeholder={t("phonePlaceholder")}
                placeholderTextColor="#737373"
                autoFocus
              />
              {phoneError ? <Text style={styles.errorText}>{phoneError}</Text> : null}
              <TouchableOpacity
                style={[styles.primaryBtn, phoneLoading && styles.disabledBtn]}
                onPress={handlePhoneLookup}
                disabled={phoneLoading || !phoneInput.trim()}
              >
                {phoneLoading ? (
                  <ActivityIndicator color="#fff" />
                ) : (
                  <Text style={styles.primaryBtnText}>{t("lookUp")}</Text>
                )}
              </TouchableOpacity>
            </View>
          </View>
        );

      case "phone_preview":
        return (
          <View style={styles.formContent}>
            <View style={styles.phoneCard}>
              <View style={styles.phoneCardHeader}>
                <TouchableOpacity
                  style={styles.iconGhostBtn}
                  onPress={() => {
                    setPhoneError("");
                    setStep("phone_enter");
                  }}
                  hitSlop={10}
                >
                  <Ionicons name="arrow-back" size={22} color="#a3a3a3" />
                </TouchableOpacity>
                <Text style={styles.phoneCardTitle}>
                  {phonePreview?.name ?? "—"}
                </Text>
              </View>
              <View style={styles.phonePreviewBox}>
                <Text style={styles.phonePreviewLine}>
                  <Text style={styles.phonePreviewMuted}>{t("phoneLabel")} </Text>
                  <Text style={styles.phonePreviewStrong}>
                    {phonePreview?.phone ?? ""}
                  </Text>
                </Text>
                {phonePreview?.skillLevel ? (
                  <Text style={styles.phonePreviewLine}>
                    <Text style={styles.phonePreviewMuted}>{t("levelLabel")} </Text>
                    <Text style={styles.phonePreviewStrong}>
                      {phonePreview.skillLevel}
                    </Text>
                  </Text>
                ) : null}
              </View>
              <TouchableOpacity
                style={[styles.confirmGreenBtn, loading && styles.disabledBtn]}
                onPress={handlePhoneConfirm}
                disabled={loading}
              >
                {loading ? (
                  <ActivityIndicator color="#fff" />
                ) : (
                  <Text style={styles.confirmGreenBtnText}>
                    {t("confirmCheckIn")}
                  </Text>
                )}
              </TouchableOpacity>
            </View>
          </View>
        );

      case "reg_face_capture":
        if (!permission) {
          return (
            <View style={styles.centerContent}>
              <ActivityIndicator color="#22c55e" size="large" />
            </View>
          );
        }
        if (!permission.granted) {
          return (
            <View style={[styles.centerContent, { paddingHorizontal: 24 }]}>
              <Text style={styles.formTitle}>{t("cameraPermissionTitle")}</Text>
              <Text style={styles.heroSubtitle}>{t("cameraPermissionHint")}</Text>
              <TouchableOpacity
                style={styles.primaryBtn}
                onPress={() => void requestPermission()}
              >
                <Text style={styles.primaryBtnText}>{t("allowCameraCta")}</Text>
              </TouchableOpacity>
              <TouchableOpacity style={styles.cancelBtn} onPress={resetToHome}>
                <Text style={styles.cancelText}>{t("back")}</Text>
              </TouchableOpacity>
            </View>
          );
        }
        return (
          <View style={styles.regCaptureScreen}>
            <View style={[styles.regCaptureTopBar, { paddingTop: insets.top + 6 }]}>
              <TouchableOpacity
                style={styles.iconGhostBtn}
                onPress={resetToHome}
                hitSlop={10}
              >
                <Ionicons name="arrow-back" size={22} color="#a3a3a3" />
              </TouchableOpacity>
            </View>
            <View style={[styles.centerContent, styles.regCaptureContent]}>
              <Text style={styles.regCaptureTitle}>{t("regTitle")}</Text>
              <Text style={styles.regCaptureHint}>{t("regFaceHint")}</Text>
              <View style={styles.regCircleOuter}>
                <View style={styles.regCircleClip}>
                  <CameraView
                    ref={regCameraRef}
                    style={styles.regCameraFill}
                    facing="front"
                    mirror
                    onCameraReady={() => {
                      regCameraReady.current = true;
                    }}
                  />
                </View>
              </View>
              <TouchableOpacity
                style={[styles.regShutterBtn, regCaptureBusy && styles.disabledBtn]}
                onPress={() => void captureRegistrationPhoto()}
                disabled={regCaptureBusy}
                activeOpacity={0.85}
              >
                {regCaptureBusy ? (
                  <ActivityIndicator color="#fff" />
                ) : (
                  <Ionicons name="camera" size={36} color="#fff" />
                )}
              </TouchableOpacity>
            </View>
          </View>
        );

      case "reg_face_preview":
        return (
          <View style={[styles.centerContent, { paddingHorizontal: 20 }]}>
            <Text style={styles.regGotPhotoTitle}>{t("regGotPhoto")}</Text>
            {faceBase64 ? (
              <View style={styles.regCircleOuter}>
                <Image
                  source={{ uri: `data:image/jpeg;base64,${faceBase64}` }}
                  style={styles.regPreviewImage}
                  resizeMode="cover"
                />
              </View>
            ) : null}
            <View style={styles.regPreviewActions}>
              <TouchableOpacity
                style={[styles.regLooksGoodBtn, regCheckingFace && styles.disabledBtn]}
                onPress={() => void handleCaptureRegistrationFace()}
                disabled={regCheckingFace}
                activeOpacity={0.85}
              >
                {regCheckingFace ? (
                  <ActivityIndicator color="#fff" />
                ) : (
                  <Text style={styles.regLooksGoodText}>
                    {t("regLooksGood")} →
                  </Text>
                )}
              </TouchableOpacity>
              <TouchableOpacity
                style={styles.regRetakeBtn}
                onPress={() => {
                  setFaceBase64(null);
                  regCameraReady.current = false;
                  setStep("reg_face_capture");
                }}
                activeOpacity={0.85}
              >
                <Text style={styles.regRetakeText}>{t("regRetake")}</Text>
              </TouchableOpacity>
            </View>
          </View>
        );

      case "reg_form":
        return (
          <ScrollView
            contentContainerStyle={[
              styles.formContent,
              styles.formContentSafe,
              { paddingTop: insets.top + 12 },
            ]}
            keyboardShouldPersistTaps="handled"
          >
            <View style={styles.regFormCard}>
              <View style={styles.regFormHeaderRow}>
                <TouchableOpacity
                  style={styles.iconGhostBtn}
                  onPress={() => {
                    Keyboard.dismiss();
                    setStep("reg_face_preview");
                  }}
                  hitSlop={10}
                >
                  <Ionicons name="arrow-back" size={22} color="#a3a3a3" />
                </TouchableOpacity>
                <Text style={styles.regFormCardTitle}>{t("regTitle")}</Text>
              </View>
              <Text style={styles.regFormLabel}>{t("regName")}</Text>
              <TextInput
                style={styles.bigInput}
                value={name}
                onChangeText={(v) => {
                  setName(v);
                  restartIdleTimer();
                }}
                placeholder={t("regNamePlaceholder")}
                placeholderTextColor="#737373"
              />
              <Text style={styles.regFormLabel}>{t("regPhone")}</Text>
              <TextInput
                style={styles.bigInput}
                value={phoneInput}
                onChangeText={(v) => {
                  setPhoneInput(v);
                  restartIdleTimer();
                }}
                keyboardType="phone-pad"
                placeholder={t("regPhonePlaceholder")}
                placeholderTextColor="#737373"
              />
              <Text style={styles.regFormLabel}>{t("regGender")}</Text>
              <View style={styles.inlineRow}>
                <TouchableOpacity
                  style={[
                    styles.selectBtn,
                    gender === "male" && styles.selectBtnActive,
                  ]}
                  onPress={() => {
                    Keyboard.dismiss();
                    setGender("male");
                    restartIdleTimer();
                  }}
                >
                  <Text style={styles.selectBtnText}>{t("regMale")}</Text>
                </TouchableOpacity>
                <TouchableOpacity
                  style={[
                    styles.selectBtn,
                    gender === "female" && styles.selectBtnActive,
                  ]}
                  onPress={() => {
                    Keyboard.dismiss();
                    setGender("female");
                    restartIdleTimer();
                  }}
                >
                  <Text style={styles.selectBtnText}>{t("regFemale")}</Text>
                </TouchableOpacity>
              </View>
              <Text style={styles.regFormLabel}>{t("regLevel")}</Text>
              <View style={styles.inlineRow}>
                {(
                  [
                    ["beginner", "regBeginner"] as const,
                    ["intermediate", "regIntermediate"] as const,
                    ["advanced", "regAdvanced"] as const,
                  ] as const
                ).map(([lvl, labelKey]) => (
                  <TouchableOpacity
                    key={lvl}
                    style={[
                      styles.selectBtn,
                      skillLevel === lvl && styles.selectBtnActive,
                    ]}
                    onPress={() => {
                      Keyboard.dismiss();
                      setSkillLevel(lvl);
                      restartIdleTimer();
                    }}
                  >
                    <Text style={styles.selectBtnText}>
                      {t(labelKey as CheckInScannerStringKey)}
                    </Text>
                  </TouchableOpacity>
                ))}
              </View>
            </View>
            <TouchableOpacity
              style={[styles.primaryBtn, loading && styles.disabledBtn]}
              onPress={handleRegister}
              disabled={
                loading ||
                !name.trim() ||
                !phoneInput.trim() ||
                !gender ||
                !skillLevel ||
                !faceBase64
              }
            >
              {loading ? (
                <ActivityIndicator color="#fff" />
              ) : (
                <Text style={styles.primaryBtnText}>{t("regNext")}</Text>
              )}
            </TouchableOpacity>
          </ScrollView>
        );

      case "awaiting_payment":
        return (
          <View style={styles.centerContent}>
            <Text style={styles.formTitle}>
              {pendingPayment?.playerName?.trim()
                ? t("payTitle", { name: pendingPayment.playerName.trim() })
                : t("payReturningTitle")}
            </Text>
            <Text style={styles.payScanHint}>{t("payScanQR")}</Text>
            {pendingPayment?.qrUrl ? (
              <View style={styles.qrWrap}>
                <Image
                  source={{ uri: pendingPayment.qrUrl }}
                  style={styles.qrImage}
                  resizeMode="contain"
                />
              </View>
            ) : null}
            <Text style={styles.amount}>
              {pendingPayment?.amount?.toLocaleString()} VND
            </Text>
            <Text style={styles.ref}>Ref: {pendingPayment?.paymentRef}</Text>
            <ActivityIndicator color="#3b82f6" style={{ marginVertical: 16 }} />
            <Text style={styles.waitText}>{t("payWaitingForStaff")}</Text>
            <TouchableOpacity style={styles.cashBtn} onPress={handleCash}>
              <Ionicons name="cash-outline" size={18} color="#fff" />
              <Text style={styles.cashText}>{t("payByCash")}</Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={styles.cancelBtn}
              onPress={handleCancelPayment}
            >
              <Text style={styles.cancelText}>{t("cancel")}</Text>
            </TouchableOpacity>
          </View>
        );

      case "existing_user":
        return (
          <View style={styles.centerContent}>
            <Ionicons name="person-circle-outline" size={64} color="#f59e0b" />
            <Text style={styles.formTitle}>{t("regExistingUserTitle")}</Text>
            <Text style={styles.heroSubtitle}>
              {t("regExistingUserHint")}
            </Text>
            {confirmMessage ? (
              <Text style={styles.heroSubtitle}>{confirmMessage}</Text>
            ) : null}
            <TouchableOpacity style={styles.primaryBtn} onPress={resetToHome}>
              <Text style={styles.primaryBtnText}>{t("backToHome")}</Text>
            </TouchableOpacity>
          </View>
        );

      case "error":
        return (
          <View style={styles.centerContent}>
            <Ionicons name="warning-outline" size={64} color="#ef4444" />
            <Text style={styles.formTitle}>{t("somethingWrong")}</Text>
            <Text style={styles.errorText}>{error || t("tryAgain")}</Text>
            <TouchableOpacity style={styles.primaryBtn} onPress={resetToHome}>
              <Text style={styles.primaryBtnText}>{t("tryAgainGeneric")}</Text>
            </TouchableOpacity>
          </View>
        );

      case "confirmed":
        return (
          <ScrollView
            contentContainerStyle={styles.confirmedScroll}
            keyboardShouldPersistTaps="handled"
          >
            <View style={styles.confirmedInner}>
              <View style={styles.successCircle}>
                <Ionicons name="checkmark" size={64} color="#22c55e" />
              </View>
              <Text style={styles.successTitle}>{t("welcomeExclaim")}</Text>
              <Text style={styles.successSub}>{confirmMessage}</Text>
              <Text style={styles.confirmedCountdown}>
                {t("returningToMenu", { seconds: confirmedSeconds })}
              </Text>
              <TouchableOpacity
                style={[styles.primaryBtn, styles.primaryBtnWide]}
                onPress={resetToHome}
                activeOpacity={0.85}
              >
                <Text style={styles.primaryBtnText}>{t("done")}</Text>
              </TouchableOpacity>
            </View>
          </ScrollView>
        );
    }
  };

  return (
    <View style={styles.outer}>
      <StatusBar style="light" />
      {step === "home" ? (
        <CourtFlowKioskTopBar
          topInset={insets.top}
          tagline=""
          locale={locale}
          onToggleLocale={toggleLocale}
        />
      ) : null}
      <View style={styles.container}>{renderStep()}</View>

      {/* Cash waiting overlay — shown after player taps Pay by Cash, waits for staff confirm */}
      <Modal visible={cashPending} transparent animationType="fade">
        <View style={styles.cashOverlay}>
          <View style={styles.cashOverlayCard}>
            <View style={styles.cashOverlayIconRow}>
              <Ionicons name="cash-outline" size={48} color="#f59e0b" />
            </View>
            <Text style={styles.cashOverlayTitle}>Cash Payment</Text>
            <Text style={styles.cashOverlayHint}>
              Please hand the cash to the staff.{"\n"}
              Waiting for staff to confirm…
            </Text>
            <ActivityIndicator color="#f59e0b" style={{ marginVertical: 8 }} />
            {pendingPayment ? (
              <Text style={styles.cashOverlayAmount}>
                {pendingPayment.amount.toLocaleString()} VND
              </Text>
            ) : null}
            <TouchableOpacity
              style={styles.cashOverlayCancel}
              onPress={handleCancelPayment}
              activeOpacity={0.7}
            >
              <Text style={styles.cashOverlayCancelText}>Cancel — go back</Text>
            </TouchableOpacity>
          </View>
        </View>
      </Modal>

      <TabletStaffEscape
        onVerified={() => navigation.navigate("TabletModeSelect")}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  outer: {
    flex: 1,
    backgroundColor: "#000000",
  },
  container: {
    flex: 1,
    backgroundColor: "#000000",
    justifyContent: "center",
    paddingHorizontal: 24,
  },
  homeRoot: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    gap: 28,
    paddingBottom: 40,
    paddingHorizontal: 8,
  },
  venueLogoImageFixed: {
    width: 96,
    height: 96,
    borderRadius: 48,
  },
  venueLogoCircle: {
    width: 96,
    height: 96,
    borderRadius: 48,
    overflow: "hidden",
  },
  venueNameMuted: {
    fontSize: 18,
    fontWeight: "500",
    color: "#a3a3a3",
    textAlign: "center",
  },
  homeActionsWide: {
    width: "100%",
    maxWidth: 520,
    gap: 16,
  },
  homeCardPrimary: {
    flexDirection: "row",
    alignItems: "center",
    gap: 20,
    width: "100%",
    borderRadius: 28,
    borderWidth: 2,
    borderColor: "rgba(22,163,74,0.45)",
    backgroundColor: "rgba(20,83,45,0.28)",
    paddingVertical: 28,
    paddingHorizontal: 28,
  },
  homeCardSecondary: {
    flexDirection: "row",
    alignItems: "center",
    gap: 20,
    width: "100%",
    borderRadius: 28,
    borderWidth: 2,
    borderColor: "rgba(82,82,82,0.55)",
    backgroundColor: "rgba(38,38,38,0.35)",
    paddingVertical: 28,
    paddingHorizontal: 28,
  },
  homeCardTextCol: { flex: 1, gap: 4 },
  homeCardTitle: {
    fontSize: 24,
    fontWeight: "700",
    color: "#fff",
  },
  homeCardSub: { fontSize: 16, color: "#a3a3a3" },
  homeCardSubMuted: { fontSize: 16, color: "#a3a3a3" },
  needsRegRoot: {
    position: "relative",
    width: "100%",
    paddingTop: 48,
  },
  needsRegBack: {
    position: "absolute",
    zIndex: 4,
    padding: 10,
    borderRadius: 999,
  },
  scanAgainBig: {
    width: "100%",
    maxWidth: 520,
    borderRadius: 28,
    backgroundColor: "#16a34a",
    paddingVertical: 26,
    alignItems: "center",
    justifyContent: "center",
  },
  scanAgainBigText: {
    color: "#fff",
    fontSize: 22,
    fontWeight: "700",
  },
  phoneBlueBtn: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    borderRadius: 14,
    backgroundColor: "#2563eb",
    paddingVertical: 14,
    paddingHorizontal: 22,
  },
  phoneBlueBtnText: {
    color: "#fff",
    fontSize: 17,
    fontWeight: "600",
  },
  phoneCard: {
    width: "100%",
    maxWidth: 440,
    alignSelf: "center",
    borderRadius: 14,
    borderWidth: 1,
    borderColor: "#262626",
    backgroundColor: "#171717",
    padding: 20,
    gap: 12,
  },
  phoneCardHeader: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
  },
  phoneCardTitle: {
    flex: 1,
    fontSize: 18,
    fontWeight: "600",
    color: "#fff",
  },
  phoneCardHint: { fontSize: 14, color: "#a3a3a3" },
  iconGhostBtn: {
    padding: 6,
    borderRadius: 10,
  },
  phonePreviewBox: {
    borderRadius: 10,
    borderWidth: 1,
    borderColor: "#262626",
    backgroundColor: "#0a0a0a",
    padding: 16,
    gap: 8,
  },
  phonePreviewLine: { fontSize: 14, color: "#d4d4d4" },
  phonePreviewMuted: { color: "#737373" },
  phonePreviewStrong: { color: "#fff", fontWeight: "600" },
  confirmGreenBtn: {
    marginTop: 4,
    borderRadius: 10,
    backgroundColor: "#16a34a",
    paddingVertical: 14,
    alignItems: "center",
    justifyContent: "center",
  },
  confirmGreenBtnText: {
    color: "#fff",
    fontSize: 16,
    fontWeight: "600",
  },
  regCaptureTitle: {
    fontSize: 24,
    fontWeight: "700",
    color: "#fff",
    textAlign: "center",
  },
  regCaptureHint: {
    fontSize: 16,
    color: "#a3a3a3",
    textAlign: "center",
    marginBottom: 8,
    paddingHorizontal: 12,
  },
  regGotPhotoTitle: {
    fontSize: 30,
    fontWeight: "700",
    color: "#4ade80",
    textAlign: "center",
  },
  payScanHint: {
    fontSize: 14,
    color: "#a3a3a3",
    textAlign: "center",
    paddingHorizontal: 8,
  },
  centerContent: {
    alignItems: "center",
    gap: 16,
  },
  formContent: {
    gap: 16,
  },
  formContentSafe: {
    paddingHorizontal: 8,
    paddingBottom: 24,
  },
  heroSubtitle: { fontSize: 16, color: "#a3a3a3", textAlign: "center" },
  formTitle: {
    fontSize: 24,
    fontWeight: "700",
    color: "#fff",
    textAlign: "center",
    marginBottom: 8,
  },
  bigInput: {
    backgroundColor: "#171717",
    borderRadius: 14,
    height: 56,
    paddingHorizontal: 20,
    fontSize: 18,
    color: "#fff",
    borderWidth: 1,
    borderColor: "#262626",
  },
  primaryBtn: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 10,
    backgroundColor: "#16a34a",
    height: 56,
    borderRadius: 14,
    marginTop: 8,
    minWidth: 220,
    paddingHorizontal: 24,
    alignSelf: "stretch",
  },
  primaryBtnText: { color: "#fff", fontSize: 18, fontWeight: "600" },
  disabledBtn: { opacity: 0.5 },
  cancelBtn: { alignItems: "center", padding: 16 },
  cancelText: { color: "#a3a3a3", fontSize: 16 },
  secondaryActionBtn: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: "#3b82f6",
    height: 48,
    marginTop: 4,
  },
  secondaryActionText: { color: "#3b82f6", fontSize: 15, fontWeight: "600" },
  inlineRow: { flexDirection: "row", gap: 8 },
  selectBtn: {
    flex: 1,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: "#262626",
    backgroundColor: "#171717",
    alignItems: "center",
    justifyContent: "center",
    height: 42,
  },
  selectBtnActive: { borderColor: "#16a34a", backgroundColor: "rgba(22,163,74,0.18)" },
  selectBtnText: { color: "#fff", fontSize: 13, fontWeight: "600" },
  errorText: { color: "#f87171", textAlign: "center", fontSize: 14 },
  playerCard: {
    alignItems: "center",
    gap: 12,
    backgroundColor: "#171717",
    borderRadius: 16,
    padding: 24,
    borderWidth: 1,
    borderColor: "#262626",
  },
  playerCardName: { fontSize: 22, fontWeight: "700", color: "#fff" },
  qrWrap: {
    backgroundColor: "#fff",
    borderRadius: 20,
    padding: 20,
  },
  qrImage: { width: 260, height: 260 },
  amount: { fontSize: 28, fontWeight: "700", color: "#fff" },
  ref: { fontSize: 14, color: "#737373", fontFamily: "monospace" },
  waitText: { color: "#a3a3a3", fontSize: 15 },
  cashBtn: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
    backgroundColor: "#f59e0b",
    height: 52,
    borderRadius: 14,
    paddingHorizontal: 32,
  },
  cashText: { color: "#fff", fontSize: 16, fontWeight: "600" },
  successCircle: {
    width: 120,
    height: 120,
    borderRadius: 60,
    backgroundColor: "#22c55e20",
    justifyContent: "center",
    alignItems: "center",
  },
  successTitle: { fontSize: 36, fontWeight: "800", color: "#fff" },
  successSub: { fontSize: 16, color: "#a3a3a3", textAlign: "center" },
  confirmedScroll: {
    flexGrow: 1,
    justifyContent: "center",
    paddingVertical: 32,
    paddingHorizontal: 12,
  },
  confirmedInner: {
    width: "100%",
    maxWidth: 420,
    alignSelf: "center",
    alignItems: "center",
    gap: 16,
  },
  confirmedCountdown: {
    fontSize: 15,
    color: "#94a3b8",
    textAlign: "center",
    marginTop: 4,
  },
  primaryBtnWide: {
    alignSelf: "stretch",
    width: "100%",
    marginTop: 12,
    minHeight: 56,
  },
  regCaptureScreen: {
    flex: 1,
    width: "100%",
  },
  regCaptureTopBar: {
    width: "100%",
    minHeight: 48,
    justifyContent: "center",
    paddingHorizontal: 12,
  },
  regCaptureContent: {
    flex: 1,
    width: "100%",
    maxWidth: 420,
    alignSelf: "center",
    paddingHorizontal: 20,
    justifyContent: "center",
  },
  regCircleOuter: {
    width: REG_FACE_CIRCLE,
    height: REG_FACE_CIRCLE,
    borderRadius: REG_FACE_CIRCLE / 2,
    borderWidth: 4,
    borderColor: "rgba(34,197,94,0.45)",
    overflow: "hidden",
    backgroundColor: "#000",
    alignSelf: "center",
    justifyContent: "center",
    alignItems: "center",
  },
  regCircleClip: {
    width: REG_FACE_CIRCLE - 8,
    height: REG_FACE_CIRCLE - 8,
    borderRadius: (REG_FACE_CIRCLE - 8) / 2,
    overflow: "hidden",
    backgroundColor: "#000",
  },
  regCameraFill: {
    width: (REG_FACE_CIRCLE - 8) * 1.18,
    height: (REG_FACE_CIRCLE - 8) * 1.18,
    alignSelf: "center",
    marginTop: -(REG_FACE_CIRCLE - 8) * 0.09,
  },
  regPreviewImage: {
    width: REG_FACE_CIRCLE - 8,
    height: REG_FACE_CIRCLE - 8,
    borderRadius: (REG_FACE_CIRCLE - 8) / 2,
  },
  regShutterBtn: {
    width: 88,
    height: 88,
    borderRadius: 44,
    backgroundColor: "#16a34a",
    justifyContent: "center",
    alignItems: "center",
    marginTop: 12,
  },
  regPreviewActions: {
    width: "100%",
    flexDirection: "row",
    gap: 12,
    marginTop: 8,
    paddingHorizontal: 4,
    maxWidth: 420,
  },
  regLooksGoodBtn: {
    flex: 1,
    backgroundColor: "#16a34a",
    borderRadius: 16,
    paddingVertical: 16,
    alignItems: "center",
    justifyContent: "center",
    minHeight: 56,
  },
  regLooksGoodText: { color: "#fff", fontSize: 18, fontWeight: "700" },
  regRetakeBtn: {
    borderRadius: 16,
    backgroundColor: "#404040",
    paddingHorizontal: 18,
    paddingVertical: 16,
    justifyContent: "center",
    minHeight: 56,
    minWidth: 100,
  },
  regRetakeText: { color: "#e5e5e5", fontSize: 16, fontWeight: "600" },
  regFormCard: {
    backgroundColor: "rgba(23,23,23,0.96)",
    borderRadius: 12,
    borderWidth: 1,
    borderColor: "#262626",
    padding: 16,
    gap: 4,
    width: "100%",
    alignSelf: "center",
  },
  regFormCardTitle: {
    flex: 1,
    fontSize: 18,
    fontWeight: "700",
    color: "#fff",
  },
  regFormHeaderRow: {
    flexDirection: "row",
    alignItems: "center",
    marginBottom: 8,
    gap: 8,
  },
  regFormLabel: {
    fontSize: 11,
    fontWeight: "600",
    color: "#a3a3a3",
    marginTop: 8,
    marginBottom: 4,
  },

  // ── Cash waiting overlay ──────────────────────────────────────────────────
  cashOverlay: {
    flex: 1,
    backgroundColor: "rgba(0,0,0,0.82)",
    justifyContent: "center",
    alignItems: "center",
    paddingHorizontal: 24,
  },
  cashOverlayCard: {
    width: "100%",
    maxWidth: 420,
    backgroundColor: "#1c1917",
    borderRadius: 24,
    borderWidth: 1,
    borderColor: "rgba(245,158,11,0.35)",
    padding: 32,
    alignItems: "center",
    gap: 12,
  },
  cashOverlayIconRow: {
    width: 88,
    height: 88,
    borderRadius: 44,
    backgroundColor: "rgba(245,158,11,0.12)",
    justifyContent: "center",
    alignItems: "center",
    marginBottom: 4,
  },
  cashOverlayTitle: {
    fontSize: 26,
    fontWeight: "800",
    color: "#fff",
    textAlign: "center",
  },
  cashOverlayHint: {
    fontSize: 16,
    color: "#a3a3a3",
    textAlign: "center",
    lineHeight: 24,
  },
  cashOverlayAmount: {
    fontSize: 32,
    fontWeight: "700",
    color: "#f59e0b",
    textAlign: "center",
    marginVertical: 4,
  },
  cashOverlayCancel: {
    marginTop: 8,
    paddingVertical: 14,
    paddingHorizontal: 32,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: "#404040",
  },
  cashOverlayCancelText: {
    color: "#a3a3a3",
    fontSize: 15,
    fontWeight: "500",
    textAlign: "center",
  },
});
