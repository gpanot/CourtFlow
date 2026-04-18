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
  Keyboard,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Ionicons } from "@expo/vector-icons";
import { ScanFace, UserPlus } from "lucide-react-native";
import { CameraView, useCameraPermissions } from "expo-camera";
import { StatusBar } from "expo-status-bar";
import { api } from "../../lib/api-client";
import { useAuthStore } from "../../stores/auth-store";
import { useSocket } from "../../hooks/useSocket";
import { useTabletKioskLocale } from "../../hooks/useTabletKioskLocale";
import {
  SelfCheckInReturningFaceScanner,
  type ReturningFrameResult,
} from "../../components/SelfCheckInReturningFaceScanner";
import { TabletStaffEscape } from "../../components/TabletStaffEscape";
import { CourtFlowKioskTopBar } from "../../components/CourtFlowKioskTopBar";
import type { SubscriptionPackage } from "../../types/api";
import type { CheckInScannerStringKey } from "../../lib/tablet-check-in-strings";
import type { TabletStackScreenProps } from "../../navigation/types";

// CourtPay fuchsia theme — mirrors PWA fuchsia/pink palette
const FUCHSIA = {
  primary: "#c026d3",
  primaryLight: "#d946ef",
  primaryDark: "#a21caf",
  bg: "rgba(112,26,117,0.22)",
  border: "rgba(192,38,211,0.45)",
  text: "#e879f9",
  scannerBorder: "rgba(192,38,211,0.45)",
  pulseDot: "#c026d3",
  amountText: "#e879f9",
  successCircle: "rgba(192,38,211,0.15)",
};

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
  | "subscription_offer"
  | "awaiting_payment"
  | "confirmed"
  | "existing_user"
  | "error";

interface CheckInPlayerLite {
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

interface ActiveSubInfo {
  id: string;
  packageName: string;
  sessionsRemaining: number | null;
  daysRemaining: number;
  isUnlimited: boolean;
  status: string;
}

interface CourtPayCheckinResponse {
  resultType?: string;
  player?: CheckInPlayerLite;
  activeSubscription?: ActiveSubInfo | null;
  error?: string;
}

function formatVND(amount: number) {
  return new Intl.NumberFormat("vi-VN").format(amount);
}

const IDLE_TIMEOUT_MS = 30_000;
const REG_FACE_CIRCLE = 260;
const CONFIRMED_AUTO_HOME_SEC = 5;
// Steps where idle timer must NOT fire (active user interaction or timed auto-reset)
const NO_IDLE_TIMEOUT_STEPS: Step[] = [
  "home",
  "confirmed",
  "reg_face_capture",
  "reg_face_preview",
  "reg_form",
  "subscription_offer",
  "awaiting_payment",
];

export function CourtPayCheckInScreen({
  navigation,
}: TabletStackScreenProps<"CourtPayCheckIn">) {
  const venueId = useAuthStore((s) => s.venueId);
  const insets = useSafeAreaInsets();
  const { locale, toggleLocale, t } = useTabletKioskLocale();
  const [step, setStep] = useState<Step>("home");
  const [phoneInput, setPhoneInput] = useState("");
  const [phoneError, setPhoneError] = useState("");
  const [phoneLoading, setPhoneLoading] = useState(false);
  const [phonePreview, setPhonePreview] = useState<CheckInPlayerLite | null>(null);
  const [phoneActiveSub, setPhoneActiveSub] = useState<ActiveSubInfo | null>(null);
  const [name, setName] = useState("");
  const [gender, setGender] = useState<"male" | "female" | null>(null);
  const [skillLevel, setSkillLevel] = useState<
    "beginner" | "intermediate" | "advanced" | null
  >(null);
  const [faceBase64, setFaceBase64] = useState<string | null>(null);
  const [regCheckingFace, setRegCheckingFace] = useState(false);
  const [regCaptureBusy, setRegCaptureBusy] = useState(false);
  const [packages, setPackages] = useState<SubscriptionPackage[]>([]);
  const [selectedPkg, setSelectedPkg] = useState<string | null>(null);
  const [player, setPlayer] = useState<CheckInPlayerLite | null>(null);
  const [isNewPlayer, setIsNewPlayer] = useState(false);
  const [pendingPayment, setPendingPayment] = useState<PendingPaymentState | null>(null);
  const [loading, setLoading] = useState(false);
  const [confirmedSeconds, setConfirmedSeconds] = useState(CONFIRMED_AUTO_HOME_SEC);
  const [error, setError] = useState("");
  const [confirmMessage, setConfirmMessage] = useState("");

  const idleTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const confirmedIntervalRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const regCameraRef = useRef<CameraView | null>(null);
  const regCameraReady = useRef(false);
  const [permission, requestPermission] = useCameraPermissions();

  // ── Packages ──────────────────────────────────────────────────────────────
  useEffect(() => {
    if (!venueId) return;
    api
      .get<{ packages?: Array<SubscriptionPackage & { isActive?: boolean }> }>(
        `/api/courtpay/packages/${venueId}`
      )
      .then((res) =>
        setPackages(
          (res.packages ?? []).map((pkg) => ({
            ...pkg,
            active: pkg.active ?? pkg.isActive ?? false,
          }))
        )
      )
      .catch(() => {});
  }, [venueId]);

  const activePackages = packages.filter((p) => p.active);

  // ── Reset ─────────────────────────────────────────────────────────────────
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
    setPhoneActiveSub(null);
    setName("");
    setGender(null);
    setSkillLevel(null);
    setFaceBase64(null);
    setRegCheckingFace(false);
    setRegCaptureBusy(false);
    setSelectedPkg(null);
    setPlayer(null);
    setIsNewPlayer(false);
    setPendingPayment(null);
    setLoading(false);
    setError("");
    setConfirmMessage("");
    setConfirmedSeconds(CONFIRMED_AUTO_HOME_SEC);
  }, []);

  // ── Idle timer ────────────────────────────────────────────────────────────
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

  // ── Confirmed countdown ───────────────────────────────────────────────────
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

  // ── WebSocket ─────────────────────────────────────────────────────────────
  useSocket(venueId, {
    "payment:confirmed": (data: unknown) => {
      const d = data as { pendingPaymentId?: string; playerName?: string };
      if (pendingPayment && d.pendingPaymentId === pendingPayment.id) {
        setConfirmMessage(
          d.playerName
            ? `Welcome ${d.playerName}! Payment confirmed.`
            : "Payment confirmed."
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

  // ── Returning scanner copy (same as SelfCheckIn) ──────────────────────────
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

  // ── Subscription routing ──────────────────────────────────────────────────
  // If player has an active subscription with sessions left → auto-check-in (skip offer + payment).
  // If no active sub (or exhausted/expired) → show subscription_offer when packages exist.
  const goToSubscriptionOrPay = useCallback(
    (targetPlayer: CheckInPlayerLite, newPlayer: boolean, activeSub?: ActiveSubInfo | null) => {
      setPlayer(targetPlayer);
      setIsNewPlayer(newPlayer);

      // Active subscription with sessions remaining → auto-check-in
      if (activeSub && activeSub.status === "active" &&
          (activeSub.isUnlimited || (activeSub.sessionsRemaining !== null && activeSub.sessionsRemaining > 0))) {
        void doPaySession(targetPlayer, undefined);
        return;
      }

      // No active sub → show package offer if packages exist
      const activePkgs = packages.filter((p) => p.active);
      if (activePkgs.length > 0) {
        setStep("subscription_offer");
      } else {
        void doPaySession(targetPlayer, undefined);
      }
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [packages]
  );

  // ── Returning face scan (auto, CourtPay endpoint) ─────────────────────────
  const submitReturningFrame = useCallback(
    async (imageBase64: string): Promise<ReturningFrameResult> => {
      if (!venueId) return "done";
      restartIdleTimer();
      setError("");
      try {
        const data = await api.post<CourtPayCheckinResponse>(
          "/api/courtpay/face-checkin",
          { venueId, imageBase64 }
        );
        if (data.resultType === "needs_registration") {
          setStep("needs_registration");
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
        // Face-checkin returns { resultType: "matched", player: { id, name, phone }, activeSubscription }
        if (data.resultType === "matched" && data.player) {
          goToSubscriptionOrPay(data.player, false, data.activeSubscription);
          return "done";
        }
        return "continue_scan";
      } catch (err) {
        setError(err instanceof Error ? err.message : "Failed");
        setStep("error");
        return "done";
      }
    },
    [venueId, restartIdleTimer, t, goToSubscriptionOrPay]
  );

  // ── Phone lookup (CourtPay — no open session required) ───────────────────
  const handlePhoneLookup = async () => {
    if (!phoneInput.trim() || !venueId) return;
    setPhoneLoading(true);
    setPhoneError("");
    setPhoneActiveSub(null);
    restartIdleTimer();
    try {
      const res = await api.post<{
        found: boolean;
        player: CheckInPlayerLite | null;
        activeSubscription?: ActiveSubInfo | null;
      }>("/api/courtpay/identify", {
        venueCode: venueId,
        phone: phoneInput.trim(),
      });
      if (res.found && res.player) {
        setPhonePreview(res.player);
        setPhoneActiveSub(res.activeSubscription ?? null);
        setStep("phone_preview");
      } else {
        setPhoneError("No player found with this phone number");
      }
    } catch (err) {
      setPhoneError(err instanceof Error ? err.message : "Lookup failed");
    } finally {
      setPhoneLoading(false);
    }
  };

  const handlePhoneConfirm = () => {
    if (!phonePreview) return;
    goToSubscriptionOrPay(phonePreview, false, phoneActiveSub);
  };

  // ── Registration face capture ─────────────────────────────────────────────
  const captureRegistrationPhoto = async () => {
    if (!regCameraRef.current || !regCameraReady.current || regCaptureBusy) return;
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
      const check = await api.post<{ existing: boolean; playerName?: string }>(
        "/api/courtpay/check-face",
        { imageBase64: faceBase64 }
      );
      if (check.existing) {
        setConfirmMessage(
          check.playerName
            ? `${check.playerName} already exists. Use Check In.`
            : t("regExistingUserHint")
        );
        setStep("existing_user");
      } else {
        setStep("reg_form");
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "Face verification failed");
      setStep("error");
    } finally {
      setRegCheckingFace(false);
    }
  };

  // ── Payment ───────────────────────────────────────────────────────────────
  const doPaySession = async (targetPlayer: CheckInPlayerLite, packageId?: string) => {
    setLoading(true);
    try {
      const res = await api.post<{
        pendingPaymentId?: string | null;
        amount?: number;
        paymentRef?: string | null;
        vietQR?: string | null;
        checkedIn?: boolean;
        free?: boolean;
        subscription?: ActiveSubInfo | null;
      }>("/api/courtpay/pay-session", {
        venueCode: venueId,
        playerId: targetPlayer.id,
        packageId,
      });

      if (res.checkedIn || res.free) {
        const sub = res.subscription;
        let subHint = "";
        if (sub && sub.isUnlimited) {
          subHint = `\nUnlimited pass · ${sub.daysRemaining} days left`;
        } else if (sub && sub.sessionsRemaining !== null) {
          subHint = `\n${sub.sessionsRemaining} session${sub.sessionsRemaining !== 1 ? "s" : ""} remaining · ${sub.daysRemaining} days left`;
        }
        setConfirmMessage(
          (isNewPlayer
            ? `Welcome to the club, ${targetPlayer.name}!`
            : `Welcome back, ${targetPlayer.name}!`) + subHint
        );
        setStep("confirmed");
        return;
      }

      if (res.pendingPaymentId) {
        setPendingPayment({
          id: res.pendingPaymentId,
          amount: res.amount ?? 0,
          paymentRef: res.paymentRef ?? "",
          qrUrl: res.vietQR ?? null,
          playerName: targetPlayer.name,
        });
        setStep("awaiting_payment");
        return;
      }

      setConfirmMessage(
        isNewPlayer
          ? `Welcome to the club, ${targetPlayer.name}!`
          : `Welcome back, ${targetPlayer.name}!`
      );
      setStep("confirmed");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Payment failed");
      setStep("error");
    } finally {
      setLoading(false);
    }
  };

  const handleRegisterAndPay = async (packageId?: string) => {
    if (!venueId || !faceBase64 || !name.trim() || !phoneInput.trim() || !gender || !skillLevel) {
      return;
    }
    setLoading(true);
    try {
      const reg = await api.post<{
        playerId?: string;
        playerName?: string;
        pendingPaymentId?: string | null;
        amount?: number;
        paymentRef?: string | null;
        vietQR?: string | null;
      }>("/api/courtpay/register", {
        venueCode: venueId,
        name: name.trim(),
        phone: phoneInput.trim(),
        gender,
        skillLevel,
        imageBase64: faceBase64,
        packageId,
      });

      const registeredPlayer: CheckInPlayerLite = {
        id: reg.playerId ?? "",
        name: reg.playerName ?? name.trim(),
        phone: phoneInput.trim(),
      };
      setPlayer(registeredPlayer);

      if (reg.pendingPaymentId) {
        setPendingPayment({
          id: reg.pendingPaymentId,
          amount: reg.amount ?? 0,
          paymentRef: reg.paymentRef ?? "",
          qrUrl: reg.vietQR ?? null,
          playerName: registeredPlayer.name,
        });
        setStep("awaiting_payment");
      } else {
        setConfirmMessage(`Welcome to the club, ${registeredPlayer.name}!`);
        setStep("confirmed");
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "Registration failed");
      setStep("error");
    } finally {
      setLoading(false);
    }
  };

  const handleSubscriptionContinue = () => {
    if (!selectedPkg) return;
    if (player) {
      void doPaySession(player, selectedPkg);
    } else {
      void handleRegisterAndPay(selectedPkg);
    }
  };

  const handleSubscriptionSkip = () => {
    if (player) {
      void doPaySession(player);
    } else {
      void handleRegisterAndPay();
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

  const handleCash = async () => {
    if (!pendingPayment) return;
    setLoading(true);
    try {
      await api.post("/api/courtpay/cash-payment", {
        pendingPaymentId: pendingPayment.id,
      });
      setConfirmMessage(
        pendingPayment.playerName
          ? `Welcome, ${pendingPayment.playerName}! Payment confirmed.`
          : "Payment confirmed."
      );
      setStep("confirmed");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Cash payment failed");
      setStep("error");
    } finally {
      setLoading(false);
    }
  };

  // ── Render ────────────────────────────────────────────────────────────────
  const renderStep = () => {
    switch (step) {
      // ── HOME ───────────────────────────────────────────────────────────────
      case "home":
        return (
          <View style={styles.homeRoot}>
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
                <ScanFace size={40} color={FUCHSIA.text} strokeWidth={2} />
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
                  setIsNewPlayer(true);
                  setStep("reg_face_capture");
                  restartIdleTimer();
                }}
              >
                <UserPlus size={40} color="#a3a3a3" strokeWidth={2} />
                <View style={styles.homeCardTextCol}>
                  <Text style={styles.homeCardTitle}>{t("homeFirstTime")}</Text>
                  <Text style={styles.homeCardSubMuted}>{t("homeFirstTimeSub")}</Text>
                </View>
              </TouchableOpacity>
            </View>
          </View>
        );

      // ── FACE SCAN (auto, same component as SelfCheckIn) ────────────────────
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

      // ── NO FACE ────────────────────────────────────────────────────────────
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
              <Ionicons name="call-outline" size={18} color={FUCHSIA.primaryLight} />
              <Text style={styles.secondaryActionText}>{t("usePhoneInstead")}</Text>
            </TouchableOpacity>
            <TouchableOpacity style={styles.cancelBtn} onPress={resetToHome}>
              <Text style={styles.cancelText}>{t("backToHome")}</Text>
            </TouchableOpacity>
          </View>
        );

      // ── NEEDS REGISTRATION ─────────────────────────────────────────────────
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
              style={styles.phoneAltBtn}
              onPress={() => setStep("phone_enter")}
              activeOpacity={0.9}
            >
              <Ionicons name="call-outline" size={20} color="#fff" />
              <Text style={styles.phoneAltBtnText}>{t("checkInWithPhone")}</Text>
            </TouchableOpacity>
          </View>
        );

      // ── PHONE ENTER ────────────────────────────────────────────────────────
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

      // ── PHONE PREVIEW ──────────────────────────────────────────────────────
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
                style={[styles.confirmFuchsiaBtn, loading && styles.disabledBtn]}
                onPress={handlePhoneConfirm}
                disabled={loading}
              >
                {loading ? (
                  <ActivityIndicator color="#fff" />
                ) : (
                  <Text style={styles.confirmFuchsiaBtnText}>
                    {t("confirmCheckIn")}
                  </Text>
                )}
              </TouchableOpacity>
            </View>
          </View>
        );

      // ── REG: FACE CAPTURE ──────────────────────────────────────────────────
      case "reg_face_capture":
        if (!permission) {
          return (
            <View style={styles.centerContent}>
              <ActivityIndicator color={FUCHSIA.primary} size="large" />
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

      // ── REG: FACE PREVIEW ──────────────────────────────────────────────────
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

      // ── REG: FORM ──────────────────────────────────────────────────────────
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
                autoFocus
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
                  style={[styles.selectBtn, gender === "male" && styles.selectBtnActive]}
                  onPress={() => { Keyboard.dismiss(); setGender("male"); restartIdleTimer(); }}
                >
                  <Text style={styles.selectBtnText}>{t("regMale")}</Text>
                </TouchableOpacity>
                <TouchableOpacity
                  style={[styles.selectBtn, gender === "female" && styles.selectBtnActive]}
                  onPress={() => { Keyboard.dismiss(); setGender("female"); restartIdleTimer(); }}
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
                    style={[styles.selectBtn, skillLevel === lvl && styles.selectBtnActive]}
                    onPress={() => { Keyboard.dismiss(); setSkillLevel(lvl); restartIdleTimer(); }}
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
              onPress={() => {
                setIsNewPlayer(true);
                const active = packages.filter((p) => p.active);
                if (active.length > 0) {
                  setStep("subscription_offer");
                } else {
                  void handleRegisterAndPay();
                }
              }}
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

      // ── SUBSCRIPTION OFFER (CourtPay only) ────────────────────────────────
      case "subscription_offer": {
        const playerName = player?.name ?? name.trim();
        const greeting = isNewPlayer
          ? `Welcome to the club, ${playerName}!`
          : `Welcome back, ${playerName}!`;
        const subtitle = isNewPlayer
          ? "Want to save with a package?"
          : "Save with a package today?";

        return (
          <ScrollView
            contentContainerStyle={styles.subOfferScroll}
            keyboardShouldPersistTaps="handled"
          >
            <Text style={styles.subOfferGreeting}>{greeting}</Text>
            <Text style={styles.subOfferSubtitle}>{subtitle}</Text>

            <View style={styles.subOfferList}>
              {activePackages.map((pkg) => (
                <TouchableOpacity
                  key={pkg.id}
                  style={[
                    styles.pkgCard,
                    selectedPkg === pkg.id && styles.pkgCardSelected,
                  ]}
                  onPress={() => setSelectedPkg(pkg.id)}
                  activeOpacity={0.85}
                >
                  <Text style={styles.pkgName}>{pkg.name}</Text>
                  <Text style={styles.pkgMeta}>
                    {pkg.sessions === null ? "Unlimited" : `${pkg.sessions} sessions`}
                    {" · "}
                    {pkg.durationDays} days
                  </Text>
                  <Text style={styles.pkgPrice}>
                    {pkg.price === 0 ? "—" : `${formatVND(pkg.price)} VND`}
                  </Text>
                </TouchableOpacity>
              ))}
            </View>

            <TouchableOpacity
              style={[
                styles.primaryBtn,
                { width: "100%", maxWidth: 400 },
                (!selectedPkg || loading) && styles.disabledBtn,
              ]}
              onPress={handleSubscriptionContinue}
              disabled={!selectedPkg || loading}
            >
              {loading ? (
                <ActivityIndicator color="#fff" />
              ) : (
                <Text style={styles.primaryBtnText}>Continue</Text>
              )}
            </TouchableOpacity>

            <TouchableOpacity
              style={styles.skipBtn}
              onPress={handleSubscriptionSkip}
              disabled={loading}
              activeOpacity={0.7}
            >
              <Text style={styles.skipText}>Skip — pay today only</Text>
            </TouchableOpacity>
          </ScrollView>
        );
      }

      // ── AWAITING PAYMENT ───────────────────────────────────────────────────
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
              {formatVND(pendingPayment?.amount ?? 0)} VND
            </Text>
            <Text style={styles.ref}>{pendingPayment?.paymentRef}</Text>

            <View style={styles.payWaitingRow}>
              <View style={styles.payPulseDot} />
              <Text style={styles.waitText}>{t("payWaitingForStaff")}</Text>
            </View>

            <TouchableOpacity style={styles.cashBtn} onPress={handleCash}>
              <Ionicons name="cash-outline" size={18} color="#fff" />
              <Text style={styles.cashText}>{t("payByCash")}</Text>
            </TouchableOpacity>
            <TouchableOpacity style={styles.cancelBtn} onPress={handleCancelPayment}>
              <Text style={styles.cancelText}>{t("cancel")}</Text>
            </TouchableOpacity>
          </View>
        );

      // ── EXISTING USER ──────────────────────────────────────────────────────
      case "existing_user":
        return (
          <View style={styles.centerContent}>
            <Ionicons name="person-circle-outline" size={64} color="#f59e0b" />
            <Text style={styles.formTitle}>{t("regExistingUserTitle")}</Text>
            <Text style={styles.heroSubtitle}>{t("regExistingUserHint")}</Text>
            {confirmMessage ? (
              <Text style={styles.heroSubtitle}>{confirmMessage}</Text>
            ) : null}
            <TouchableOpacity style={styles.primaryBtn} onPress={resetToHome}>
              <Text style={styles.primaryBtnText}>{t("backToHome")}</Text>
            </TouchableOpacity>
          </View>
        );

      // ── ERROR ──────────────────────────────────────────────────────────────
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

      // ── CONFIRMED ──────────────────────────────────────────────────────────
      case "confirmed":
        return (
          <ScrollView
            contentContainerStyle={styles.confirmedScroll}
            keyboardShouldPersistTaps="handled"
          >
            <View style={styles.confirmedInner}>
              <View style={styles.successCircle}>
                <Ionicons name="checkmark" size={64} color={FUCHSIA.text} />
              </View>
              <Text style={styles.successTitle}>
                {isNewPlayer
                  ? `Welcome to the club, ${player?.name ?? ""}!`
                  : player?.name
                    ? `Welcome back, ${player.name}!`
                    : t("welcomeExclaim")}
              </Text>
              {confirmMessage ? (
                <Text style={styles.successSub}>{confirmMessage}</Text>
              ) : null}
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
          tagline="CourtPay"
          locale={locale}
          onToggleLocale={toggleLocale}
        />
      ) : null}
      <View style={styles.container} onTouchStart={restartIdleTimer}>
        {renderStep()}
      </View>
      <TabletStaffEscape
        onVerified={() => navigation.navigate("TabletModeSelect")}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  outer: { flex: 1, backgroundColor: "#000000" },
  container: {
    flex: 1,
    backgroundColor: "#000000",
    justifyContent: "center",
    paddingHorizontal: 24,
  },

  // ── HOME ────────────────────────────────────────────────────────────────
  homeRoot: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    gap: 28,
    paddingBottom: 40,
    paddingHorizontal: 8,
  },
  homeActionsWide: { width: "100%", maxWidth: 520, gap: 16 },
  homeCardPrimary: {
    flexDirection: "row",
    alignItems: "center",
    gap: 20,
    width: "100%",
    borderRadius: 28,
    borderWidth: 2,
    borderColor: FUCHSIA.border,
    backgroundColor: FUCHSIA.bg,
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
  homeCardTitle: { fontSize: 24, fontWeight: "700", color: "#fff" },
  homeCardSub: { fontSize: 16, color: "#a3a3a3" },
  homeCardSubMuted: { fontSize: 16, color: "#a3a3a3" },

  // ── SHARED ───────────────────────────────────────────────────────────────
  centerContent: { alignItems: "center", gap: 16 },
  formContent: { gap: 16 },
  formContentSafe: { paddingHorizontal: 8, paddingBottom: 24 },
  heroSubtitle: { fontSize: 16, color: "#a3a3a3", textAlign: "center" },
  formTitle: {
    fontSize: 24,
    fontWeight: "700",
    color: "#fff",
    textAlign: "center",
    marginBottom: 8,
  },
  primaryBtn: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 10,
    backgroundColor: FUCHSIA.primary,
    height: 56,
    borderRadius: 14,
    marginTop: 8,
  },
  primaryBtnText: { color: "#fff", fontSize: 18, fontWeight: "600" },
  primaryBtnWide: { alignSelf: "stretch", width: "100%", marginTop: 12, minHeight: 56 },
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
    borderColor: FUCHSIA.primaryLight,
    height: 48,
    marginTop: 4,
  },
  secondaryActionText: { color: FUCHSIA.primaryLight, fontSize: 15, fontWeight: "600" },
  iconGhostBtn: { padding: 6, borderRadius: 10 },
  errorText: { color: "#f87171", textAlign: "center", fontSize: 14 },
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
  selectBtnActive: { borderColor: FUCHSIA.primary, backgroundColor: FUCHSIA.bg },
  selectBtnText: { color: "#fff", fontSize: 13, fontWeight: "600" },

  // ── NEEDS REGISTRATION ────────────────────────────────────────────────────
  needsRegRoot: { position: "relative", width: "100%", paddingTop: 48 },
  needsRegBack: { position: "absolute", zIndex: 4, padding: 10, borderRadius: 999 },
  scanAgainBig: {
    width: "100%",
    maxWidth: 520,
    borderRadius: 28,
    backgroundColor: FUCHSIA.primary,
    paddingVertical: 26,
    alignItems: "center",
    justifyContent: "center",
  },
  scanAgainBigText: { color: "#fff", fontSize: 22, fontWeight: "700" },
  phoneAltBtn: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    borderRadius: 14,
    backgroundColor: FUCHSIA.primaryDark,
    paddingVertical: 14,
    paddingHorizontal: 22,
  },
  phoneAltBtnText: { color: "#fff", fontSize: 17, fontWeight: "600" },

  // ── PHONE CARD ────────────────────────────────────────────────────────────
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
  phoneCardHeader: { flexDirection: "row", alignItems: "center", gap: 8 },
  phoneCardTitle: { flex: 1, fontSize: 18, fontWeight: "600", color: "#fff" },
  phoneCardHint: { fontSize: 14, color: "#a3a3a3" },
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
  confirmFuchsiaBtn: {
    marginTop: 4,
    borderRadius: 10,
    backgroundColor: FUCHSIA.primary,
    paddingVertical: 14,
    alignItems: "center",
    justifyContent: "center",
  },
  confirmFuchsiaBtnText: { color: "#fff", fontSize: 16, fontWeight: "600" },

  // ── REG CAMERA ────────────────────────────────────────────────────────────
  regCaptureScreen: { flex: 1, width: "100%" },
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
  regCaptureTitle: { fontSize: 24, fontWeight: "700", color: "#fff", textAlign: "center" },
  regCaptureHint: {
    fontSize: 16,
    color: "#a3a3a3",
    textAlign: "center",
    marginBottom: 8,
    paddingHorizontal: 12,
  },
  regGotPhotoTitle: { fontSize: 30, fontWeight: "700", color: FUCHSIA.text, textAlign: "center" },
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
  regCircleOuter: {
    width: REG_FACE_CIRCLE,
    height: REG_FACE_CIRCLE,
    borderRadius: REG_FACE_CIRCLE / 2,
    borderWidth: 4,
    borderColor: FUCHSIA.scannerBorder,
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
    backgroundColor: FUCHSIA.primary,
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
    backgroundColor: FUCHSIA.primary,
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

  // ── REG FORM ──────────────────────────────────────────────────────────────
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
  regFormCardTitle: { flex: 1, fontSize: 18, fontWeight: "700", color: "#fff" },
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

  // ── SUBSCRIPTION OFFER ────────────────────────────────────────────────────
  subOfferScroll: {
    flexGrow: 1,
    justifyContent: "center",
    alignItems: "center",
    paddingHorizontal: 24,
    paddingVertical: 32,
  },
  subOfferGreeting: {
    fontSize: 24,
    fontWeight: "700",
    color: "#fff",
    textAlign: "center",
  },
  subOfferSubtitle: {
    fontSize: 18,
    color: "#a3a3a3",
    textAlign: "center",
    marginTop: 8,
  },
  subOfferList: { width: "100%", maxWidth: 400, marginTop: 24, gap: 12 },
  pkgCard: {
    borderRadius: 14,
    borderWidth: 1,
    borderColor: "#3f3f46",
    backgroundColor: "#18181b",
    padding: 16,
  },
  pkgCardSelected: {
    borderColor: "#a855f7",
    backgroundColor: "rgba(168,85,247,0.10)",
  },
  pkgName: { fontSize: 16, fontWeight: "600", color: "#fff" },
  pkgMeta: { fontSize: 14, color: "#a3a3a3", marginTop: 4 },
  pkgPrice: { fontSize: 18, fontWeight: "700", color: "#a855f7", marginTop: 8 },
  skipBtn: { marginTop: 20, paddingVertical: 12 },
  skipText: {
    fontSize: 14,
    color: "#737373",
    textDecorationLine: "underline",
    textAlign: "center",
  },

  // ── PAYMENT ───────────────────────────────────────────────────────────────
  payScanHint: { fontSize: 14, color: "#a3a3a3", textAlign: "center", paddingHorizontal: 8 },
  qrWrap: { backgroundColor: "#fff", borderRadius: 20, padding: 20 },
  qrImage: { width: 260, height: 260 },
  amount: { fontSize: 36, fontWeight: "700", color: FUCHSIA.amountText },
  ref: { fontSize: 14, color: "#737373", fontFamily: "monospace" },
  payWaitingRow: { flexDirection: "row", alignItems: "center", gap: 10 },
  payPulseDot: { width: 12, height: 12, borderRadius: 6, backgroundColor: FUCHSIA.pulseDot },
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

  // ── CONFIRMED ─────────────────────────────────────────────────────────────
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
  successCircle: {
    width: 120,
    height: 120,
    borderRadius: 60,
    backgroundColor: FUCHSIA.successCircle,
    justifyContent: "center",
    alignItems: "center",
  },
  successTitle: { fontSize: 28, fontWeight: "800", color: "#fff", textAlign: "center" },
  successSub: { fontSize: 16, color: "#a3a3a3", textAlign: "center" },
  confirmedCountdown: {
    fontSize: 15,
    color: "#94a3b8",
    textAlign: "center",
    marginTop: 4,
  },
});
