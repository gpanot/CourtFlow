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
  Modal,
  Animated,
  Easing,
  Platform,
  BackHandler,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Ionicons } from "@expo/vector-icons";
import { ScanFace, UserPlus } from "lucide-react-native";
import { CameraView, useCameraPermissions } from "expo-camera";
import { StatusBar } from "expo-status-bar";
import { BlurView } from "expo-blur";
import { CourtPayLiquidBackdrop } from "../../components/courtpay/CourtPayLiquidBackdrop";
import { LiquidGlassSurface } from "../../components/courtpay/LiquidGlassSurface";
import { CourtPayStatusCard } from "../../components/courtpay/CourtPayStatusCard";
import { api } from "../../lib/api-client";
import { ENV } from "../../config/env";
import { useAuthStore } from "../../stores/auth-store";
import { useThemeStore, ACCENT_MAP } from "../../stores/theme-store";
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

// CP is resolved dynamically from useThemeStore inside the component.

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
  | "already_paid"
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
  alreadyPaidStatus?: string;
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
  "scan_returning",
  "confirmed",
  "reg_face_capture",
  "reg_face_preview",
  "reg_form",
  "subscription_offer",
  "awaiting_payment",
  "already_paid",
];

export function CourtPayCheckInScreen({
  navigation,
}: TabletStackScreenProps<"CourtPayCheckIn">) {
  const venueId = useAuthStore((s) => s.venueId);
  const venues = useAuthStore((s) => s.venues);
  const themeMode = useThemeStore((s) => s.mode);
  const toggleTheme = useThemeStore((s) => s.toggleMode);
  const accentKey = useThemeStore((s) => s.accent);
  const CP = useMemo(() => ACCENT_MAP[accentKey], [accentKey]);
  const dyn = useMemo(() => ({
    primaryBtn:         { backgroundColor: CP.primary },
    secondaryActionBtn: { borderColor: CP.primaryLight },
    secondaryActionText:{ color: CP.primaryLight },
    selectBtnActive:    { borderColor: CP.primary, backgroundColor: CP.bg },
    scanAgainBig:       { backgroundColor: CP.primary },
    phoneAltBtn:        { backgroundColor: CP.primaryDark },
    confirmAccentBtn:   { backgroundColor: CP.primary },
    regGotPhotoTitle:   { color: CP.text },
    regCircleOuter:     { borderColor: CP.scannerBorder },
    regShutterBtn:      { backgroundColor: CP.primary },
    regLooksGoodBtn:    { backgroundColor: CP.primary },
    pkgBestChoiceTag:   { backgroundColor: CP.primary },
    amount:             { color: CP.amountText },
    payPulseDot:        { backgroundColor: CP.pulseDot },
    successCircle:      { backgroundColor: CP.successCircle },
  }), [CP]);
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
  const [sessionFee, setSessionFee] = useState<number>(0);
  const [showSubscriptionsInFlow, setShowSubscriptionsInFlow] = useState(true);
  const [packages, setPackages] = useState<SubscriptionPackage[]>([]);
  const [selectedPkg, setSelectedPkg] = useState<string | null>(null);
  const [player, setPlayer] = useState<CheckInPlayerLite | null>(null);
  const [isNewPlayer, setIsNewPlayer] = useState(false);
  const [pendingPayment, setPendingPayment] = useState<PendingPaymentState | null>(null);
  const [loading, setLoading] = useState(false);
  const [cashPending, setCashPending] = useState(false);
  const [confirmedSeconds, setConfirmedSeconds] = useState(CONFIRMED_AUTO_HOME_SEC);
  const [error, setError] = useState("");
  const [confirmMessage, setConfirmMessage] = useState("");
  const [alreadyPaidPlayer, setAlreadyPaidPlayer] = useState<CheckInPlayerLite | null>(null);
  const [alreadyPaidStatus, setAlreadyPaidStatus] = useState<string>("");

  const idleTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const confirmedIntervalRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const regCameraRef = useRef<CameraView | null>(null);
  const regCameraReady = useRef(false);
  const [permission, requestPermission] = useCameraPermissions();

  // ── Block OS back button / swipe-back on this kiosk screen ─────────────────
  useEffect(() => {
    const sub = BackHandler.addEventListener("hardwareBackPress", () => true);
    return () => sub.remove();
  }, []);

  // ── Venue info (logo + name) ──────────────────────────────────────────────
  useEffect(() => {
    if (!venueId) return;
    let cancelled = false;
    void api
      .get<{ name?: string; logoUrl?: string | null; settings?: unknown }>(
        `/api/venues/${venueId}`
      )
      .then((v) => {
        if (cancelled) return;
        if (typeof v.name === "string") setVenueApiName(v.name);
        setVenueLogoPath(typeof v.logoUrl === "string" ? v.logoUrl : null);
        const st = v.settings as { logoSpin?: boolean } | undefined;
        setVenueLogoSpin(!!st?.logoSpin);
      })
      .catch(() => {});
    return () => { cancelled = true; };
  }, [venueId]);

  // ── Logo spin animation ───────────────────────────────────────────────────
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

  // ── Session fee + subscription flow setting ───────────────────────────────
  useEffect(() => {
    if (!venueId) return;
    api
      .get<{ sessionFee?: number; showSubscriptionsInFlow?: boolean }>(
        `/api/staff/venue-payment-settings?venueId=${venueId}`
      )
      .then((res) => {
        setSessionFee(res.sessionFee ?? 0);
        setShowSubscriptionsInFlow(res.showSubscriptionsInFlow !== false);
      })
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
    setCashPending(false);
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
      const d = data as {
        pendingPaymentId?: string;
        playerName?: string;
        subscription?: ActiveSubInfo | null;
      };
      if (pendingPayment && d.pendingPaymentId === pendingPayment.id) {
        setCashPending(false);
        const sub = d.subscription;
        let subHint = "";
        if (sub && sub.isUnlimited) {
          subHint = `\nUnlimited pass · ${sub.daysRemaining} days left`;
        } else if (sub && sub.sessionsRemaining !== null) {
          subHint = `\n${sub.sessionsRemaining} session${sub.sessionsRemaining !== 1 ? "s" : ""} remaining · ${sub.daysRemaining} days left`;
        }
        setConfirmMessage(
          (d.playerName
            ? `Welcome ${d.playerName}! Payment confirmed.`
            : "Payment confirmed.") + subHint
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

      // No active sub → show package offer if packages exist and feature is enabled
      const activePkgs = packages.filter((p) => p.active);
      if (activePkgs.length > 0 && showSubscriptionsInFlow) {
        setStep("subscription_offer");
      } else {
        void doPaySession(targetPlayer, undefined);
      }
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [packages, showSubscriptionsInFlow]
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
        // Player already has a confirmed/pending payment this session
        if (data.resultType === "already_paid" && data.player) {
          setAlreadyPaidPlayer(data.player);
          setAlreadyPaidStatus(data.alreadyPaidStatus ?? "confirmed");
          setFaceBase64(imageBase64);
          setStep("already_paid");
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
      // 409 already_checked_in → show friendly confirmation screen instead of error
      if (err instanceof Error && err.message === "already_checked_in") {
        setConfirmMessage(`${targetPlayer.name} is already checked in for this session.`);
        setStep("confirmed");
        return;
      }
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
      // 409 already_checked_in → show friendly confirmation screen
      if (err instanceof Error && err.message === "already_checked_in") {
        setConfirmMessage(`${name.trim()} is already checked in for this session.`);
        setStep("confirmed");
        return;
      }
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
    // Await with a 90s timeout so staff have enough time to accept cash before
    // the player cancels. The kiosk always resets regardless of network outcome.
    try {
      await Promise.race([
        api.post("/api/kiosk/cancel-payment", { pendingPaymentId: pendingPayment.id }),
        new Promise<void>((_, reject) =>
          setTimeout(() => reject(new Error("timeout")), 90_000)
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
      // Show overlay — staff must confirm via the Payment tab. Socket payment:confirmed resolves it.
      setCashPending(true);
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
                style={styles.homeCardTouchable}
                activeOpacity={0.92}
                onPress={() => {
                  setFaceBase64(null);
                  setStep("scan_returning");
                  restartIdleTimer();
                }}
              >
                <LiquidGlassSurface
                  tintColor={CP.glassOverlay}
                  style={styles.homeGlassCard}
                  intensity={Platform.OS === "ios" ? 50 : 88}
                >
                  <View style={styles.homeGlassRow}>
                    <ScanFace size={40} color={CP.text} strokeWidth={2} />
                    <View style={styles.homeCardTextCol}>
                      <Text style={styles.homeCardTitle}>{t("homeCheckIn")}</Text>
                      <Text style={styles.homeCardSub}>{t("homeCheckInSub")}</Text>
                    </View>
                  </View>
                </LiquidGlassSurface>
              </TouchableOpacity>
              <TouchableOpacity
                style={styles.homeCardTouchable}
                activeOpacity={0.92}
                onPress={() => {
                  setFaceBase64(null);
                  setIsNewPlayer(true);
                  setStep("reg_face_capture");
                  restartIdleTimer();
                }}
              >
                <LiquidGlassSurface
                  accent="none"
                  style={styles.homeGlassCard}
                  intensity={Platform.OS === "ios" ? 44 : 82}
                >
                  <View style={styles.homeGlassRow}>
                    <UserPlus size={40} color="#a3a3a3" strokeWidth={2} />
                    <View style={styles.homeCardTextCol}>
                      <Text style={styles.homeCardTitle}>{t("homeFirstTime")}</Text>
                      <Text style={styles.homeCardSubMuted}>{t("homeFirstTimeSub")}</Text>
                    </View>
                  </View>
                </LiquidGlassSurface>
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
            accent="courtpay"
            courtpayAccent={accentKey}
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
          <LiquidGlassSurface style={styles.flowGlassPanel} accent="none">
            <View style={styles.flowGlassPanelInner}>
              <Ionicons name="scan-outline" size={56} color="#fbbf24" />
              <Text style={styles.formTitle}>{t("noFaceDetected")}</Text>
              <Text style={styles.heroSubtitle}>{t("lookAtCamera")}</Text>
              <TouchableOpacity
                style={[styles.primaryBtn, dyn.primaryBtn]}
                onPress={() => setStep("scan_returning")}
              >
                <Text style={styles.primaryBtnText}>{t("tryAgainGeneric")}</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[styles.secondaryActionBtn, dyn.secondaryActionBtn]}
                onPress={() => setStep("phone_enter")}
              >
                <Ionicons name="call-outline" size={18} color={CP.primaryLight} />
                <Text style={[styles.secondaryActionText, dyn.secondaryActionText]}>{t("usePhoneInstead")}</Text>
              </TouchableOpacity>
              <TouchableOpacity style={styles.cancelBtn} onPress={resetToHome}>
                <Text style={styles.cancelText}>{t("backToHome")}</Text>
              </TouchableOpacity>
            </View>
          </LiquidGlassSurface>
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
            <LiquidGlassSurface style={styles.needsRegGlass} accent="amber">
              <View style={styles.needsRegGlassInner}>
                <Ionicons name="alert-circle-outline" size={60} color="#f59e0b" />
                <Text style={styles.formTitle}>{t("faceNotRecognized")}</Text>
                <Text style={styles.heroSubtitle}>{t("faceNotRecognizedHint")}</Text>
                <TouchableOpacity
                  style={[styles.scanAgainBig, dyn.scanAgainBig]}
                  onPress={() => setStep("scan_returning")}
                  activeOpacity={0.92}
                >
                  <Text style={styles.scanAgainBigText}>{t("scanAgain")}</Text>
                </TouchableOpacity>
                <TouchableOpacity
                  style={[styles.phoneAltBtn, dyn.phoneAltBtn]}
                  onPress={() => setStep("phone_enter")}
                  activeOpacity={0.9}
                >
                  <Ionicons name="call-outline" size={20} color="#fff" />
                  <Text style={styles.phoneAltBtnText}>{t("checkInWithPhone")}</Text>
                </TouchableOpacity>
              </View>
            </LiquidGlassSurface>
          </View>
        );

      // ── PHONE ENTER ────────────────────────────────────────────────────────
      case "phone_enter":
        return (
          <View style={styles.formContent}>
            <LiquidGlassSurface style={styles.phoneGlass} tintColor={CP.glassOverlay}>
              <View style={styles.phoneCardInner}>
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
                  style={[styles.primaryBtn, dyn.primaryBtn, phoneLoading && styles.disabledBtn]}
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
            </LiquidGlassSurface>
          </View>
        );

      // ── PHONE PREVIEW ──────────────────────────────────────────────────────
      case "phone_preview":
        return (
          <View style={styles.formContent}>
            <LiquidGlassSurface style={styles.phoneGlass} tintColor={CP.glassOverlay}>
              <View style={styles.phoneCardInner}>
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
                  style={[styles.confirmFuchsiaBtn, dyn.confirmAccentBtn, loading && styles.disabledBtn]}
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
            </LiquidGlassSurface>
          </View>
        );

      // ── REG: FACE CAPTURE ──────────────────────────────────────────────────
      case "reg_face_capture":
        if (!permission) {
          return (
            <View style={styles.centerContent}>
              <ActivityIndicator color={CP.primary} size="large" />
            </View>
          );
        }
        if (!permission.granted) {
          return (
            <LiquidGlassSurface style={styles.flowGlassPanel} tintColor={CP.glassOverlay}>
              <View style={[styles.flowGlassPanelInner, { paddingHorizontal: 8 }]}>
                <Text style={styles.formTitle}>{t("cameraPermissionTitle")}</Text>
                <Text style={styles.heroSubtitle}>{t("cameraPermissionHint")}</Text>
                <TouchableOpacity
                  style={[styles.primaryBtn, dyn.primaryBtn]}
                  onPress={() => void requestPermission()}
                >
                  <Text style={styles.primaryBtnText}>{t("allowCameraCta")}</Text>
                </TouchableOpacity>
                <TouchableOpacity style={styles.cancelBtn} onPress={resetToHome}>
                  <Text style={styles.cancelText}>{t("back")}</Text>
                </TouchableOpacity>
              </View>
            </LiquidGlassSurface>
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
              <View style={[styles.regCircleOuter, dyn.regCircleOuter]}>
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
                style={[styles.regShutterBtn, dyn.regShutterBtn, regCaptureBusy && styles.disabledBtn]}
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
            <Text style={[styles.regGotPhotoTitle, dyn.regGotPhotoTitle]}>{t("regGotPhoto")}</Text>
            {faceBase64 ? (
              <View style={[styles.regCircleOuter, dyn.regCircleOuter]}>
                <Image
                  source={{ uri: `data:image/jpeg;base64,${faceBase64}` }}
                  style={styles.regPreviewImage}
                  resizeMode="cover"
                />
              </View>
            ) : null}
            <View style={styles.regPreviewActions}>
              <TouchableOpacity
                style={[styles.regLooksGoodBtn, dyn.regLooksGoodBtn, regCheckingFace && styles.disabledBtn]}
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
            <LiquidGlassSurface style={styles.regFormGlass} accent="none">
              <View style={styles.regFormCardInner}>
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
                  style={[styles.selectBtn, gender === "male" && styles.selectBtnActive, dyn.selectBtnActive]}
                  onPress={() => { Keyboard.dismiss(); setGender("male"); restartIdleTimer(); }}
                >
                  <Text style={styles.selectBtnText}>{t("regMale")}</Text>
                </TouchableOpacity>
                <TouchableOpacity
                  style={[styles.selectBtn, gender === "female" && styles.selectBtnActive, dyn.selectBtnActive]}
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
                    style={[styles.selectBtn, skillLevel === lvl && styles.selectBtnActive, dyn.selectBtnActive]}
                    onPress={() => { Keyboard.dismiss(); setSkillLevel(lvl); restartIdleTimer(); }}
                  >
                    <Text style={styles.selectBtnText}>
                      {t(labelKey as CheckInScannerStringKey)}
                    </Text>
                  </TouchableOpacity>
                ))}
              </View>
              <TouchableOpacity
                style={[styles.primaryBtn, dyn.primaryBtn, loading && styles.disabledBtn]}
                onPress={() => {
                  setIsNewPlayer(true);
                  const active = packages.filter((p) => p.active);
                  if (active.length > 0 && showSubscriptionsInFlow) {
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
            </View>
            </LiquidGlassSurface>
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
          <View style={{ flex: 1 }}>
            {/* Back button — restart flow */}
            <TouchableOpacity
              style={[styles.subOfferBack, { top: insets.top + 12 }]}
              onPress={resetToHome}
              hitSlop={12}
              activeOpacity={0.7}
            >
              <Ionicons name="arrow-back" size={26} color="#a3a3a3" />
            </TouchableOpacity>

            <ScrollView
              contentContainerStyle={styles.subOfferScroll}
              keyboardShouldPersistTaps="handled"
            >
              <Text style={styles.subOfferGreeting}>{greeting}</Text>
              <Text style={styles.subOfferSubtitle}>{subtitle}</Text>

              <View style={styles.subOfferList}>
                {activePackages.map((pkg) => {
                  const isSelected = selectedPkg === pkg.id;
                  return (
                    <TouchableOpacity
                      key={pkg.id}
                      onPress={() => setSelectedPkg(pkg.id)}
                      activeOpacity={0.85}
                    >
                      <LiquidGlassSurface
                        style={[
                          styles.pkgGlass,
                          isSelected && styles.pkgGlassSelected,
                        ]}
                        accent={isSelected ? "green" : "none"}
                        intensity={
                          Platform.OS === "ios"
                            ? isSelected
                              ? 52
                              : 40
                            : isSelected
                              ? 88
                              : 72
                        }
                      >
                      {/* Top-right badges: Best Choice + Save X%, stacked */}
                      <View style={styles.pkgBadgeStack}>
                        {pkg.isBestChoice && (
                          <View style={[styles.pkgBestChoiceTag, dyn.pkgBestChoiceTag]}>
                            <Text style={styles.pkgBestChoiceText}>Best Choice</Text>
                          </View>
                        )}
                        {pkg.discountPct != null && pkg.discountPct > 0 && (
                          <View style={styles.pkgDiscountBadge}>
                            <Text style={styles.pkgDiscountBadgeText}>
                              Save {pkg.discountPct}%
                            </Text>
                          </View>
                        )}
                      </View>

                      {/* Name — leave right margin so it doesn't overlap badges */}
                      <Text style={[styles.pkgName, { marginRight: 80 }]}>{pkg.name}</Text>

                      <Text style={styles.pkgMeta}>
                        {pkg.sessions === null ? "Unlimited" : `${pkg.sessions} sessions`}
                        {pkg.durationDays ? ` · ${pkg.durationDays} days` : ""}
                      </Text>
                      <Text style={styles.pkgPrice}>
                        {pkg.price === 0 ? "—" : formatVND(pkg.price)}
                      </Text>
                      </LiquidGlassSurface>
                    </TouchableOpacity>
                  );
                })}
              </View>

              <TouchableOpacity
                style={[
                  styles.primaryBtn,
                  { width: "100%" },
                  selectedPkg ? dyn.primaryBtn : undefined,
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

              {/* OR separator */}
              <View style={styles.orSeparator}>
                <View style={styles.orLine} />
                <Text style={styles.orText}>OR</Text>
                <View style={styles.orLine} />
              </View>

              {/* "Pay for Today Only" card — outer width box avoids 0-width % under centered ScrollView */}
              <View style={styles.payTodayOuter}>
                <TouchableOpacity
                  onPress={handleSubscriptionSkip}
                  disabled={loading}
                  activeOpacity={0.8}
                  style={styles.payTodayTouchable}
                >
                  <LiquidGlassSurface style={styles.payTodayGlass} accent="none">
                    <View style={styles.payTodayRow}>
                      <View style={styles.payTodayTextWrap}>
                        <Text style={styles.payTodayTitle}>Pay for Today Only</Text>
                        <Text style={styles.payTodayDesc}>
                          Single session - no package required
                        </Text>
                        {sessionFee > 0 ? (
                          <Text style={styles.payTodayPrice}>{formatVND(sessionFee)}</Text>
                        ) : null}
                      </View>
                      <Ionicons name="chevron-forward" size={20} color="#a3a3a3" />
                    </View>
                  </LiquidGlassSurface>
                </TouchableOpacity>
              </View>
            </ScrollView>
          </View>
        );
      }

      // ── AWAITING PAYMENT ───────────────────────────────────────────────────
      case "awaiting_payment":
        return (
          <LiquidGlassSurface style={styles.payWaitGlass} tintColor={CP.glassOverlay}>
            <View style={styles.payWaitGlassInner}>
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
              <Text style={[styles.amount, dyn.amount]}>
                {formatVND(pendingPayment?.amount ?? 0)} VND
              </Text>
              <Text style={styles.ref}>{pendingPayment?.paymentRef}</Text>

              <View style={styles.payWaitingRow}>
                <View style={[styles.payPulseDot, dyn.payPulseDot]} />
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
          </LiquidGlassSurface>
        );

      // ── ALREADY PAID ───────────────────────────────────────────────────────
      case "already_paid":
        return (
          <CourtPayStatusCard
            variant="already_paid"
            playerName={alreadyPaidPlayer?.name}
            subtitle={
              alreadyPaidStatus === "pending"
                ? "Payment is pending confirmation — no new payment needed."
                : "This player has already paid for this session."
            }
            faceBase64={faceBase64}
            onPrimaryAction={resetToHome}
            primaryLabel={t("backToHome")}
          />
        );

      // ── EXISTING USER ──────────────────────────────────────────────────────
      case "existing_user":
        return (
          <CourtPayStatusCard
            variant="existing_user"
            playerName={t("regExistingUserTitle")}
            subtitle={confirmMessage || t("regExistingUserHint")}
            faceBase64={faceBase64}
            onPrimaryAction={resetToHome}
            primaryLabel={t("backToHome")}
          />
        );

      // ── ERROR ──────────────────────────────────────────────────────────────
      case "error":
        return (
          <LiquidGlassSurface style={styles.flowGlassPanel} accent="none">
            <View style={styles.flowGlassPanelInner}>
              <Ionicons name="warning-outline" size={64} color="#ef4444" />
              <Text style={styles.formTitle}>{t("somethingWrong")}</Text>
              <Text style={styles.errorText}>{error || t("tryAgain")}</Text>
              <TouchableOpacity style={[styles.primaryBtn, dyn.primaryBtn]} onPress={resetToHome}>
                <Text style={styles.primaryBtnText}>{t("tryAgainGeneric")}</Text>
              </TouchableOpacity>
            </View>
          </LiquidGlassSurface>
        );

      // ── CONFIRMED ──────────────────────────────────────────────────────────
      case "confirmed":
        return (
          <ScrollView
            contentContainerStyle={styles.confirmedScroll}
            keyboardShouldPersistTaps="handled"
          >
            <View style={styles.confirmedInner}>
              <LiquidGlassSurface style={styles.confirmedGlass} tintColor={CP.glassOverlay}>
                <View style={styles.confirmedGlassInner}>
                  <View style={[styles.successCircle, dyn.successCircle]}>
                    <Ionicons name="checkmark" size={64} color={CP.text} />
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
                    style={[styles.primaryBtn, dyn.primaryBtn, styles.primaryBtnWide]}
                    onPress={resetToHome}
                    activeOpacity={0.85}
                  >
                    <Text style={styles.primaryBtnText}>{t("done")}</Text>
                  </TouchableOpacity>
                </View>
              </LiquidGlassSurface>
            </View>
          </ScrollView>
        );
    }
  };

  return (
    <View
      style={[
        styles.outer,
        { backgroundColor: themeMode === "light" ? CP.backdropBaseLight : CP.backdropBase },
      ]}
    >
      <CourtPayLiquidBackdrop mode={themeMode} accent={accentKey} />
      <StatusBar style={themeMode === "light" ? "dark" : "light"} />
      {step === "home" ? (
        <CourtFlowKioskTopBar
          topInset={insets.top}
          tagline="CourtPay"
          locale={locale}
          onToggleLocale={toggleLocale}
          themeMode={themeMode}
          onToggleTheme={toggleTheme}
        />
      ) : null}
      <View style={styles.container} onTouchStart={restartIdleTimer}>
        {renderStep()}
      </View>

      {/* Cash waiting overlay — shown after player taps Pay by Cash, waits for staff confirm */}
      <Modal visible={cashPending} transparent animationType="fade">
        <BlurView
          intensity={Platform.OS === "ios" ? 48 : 90}
          tint="dark"
          style={styles.cashOverlayBlur}
        >
          <View style={styles.cashOverlayInner}>
            <LiquidGlassSurface style={styles.cashOverlayCard} accent="amber">
              <View style={styles.cashOverlayCardInner}>
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
                    {formatVND(pendingPayment.amount)} VND
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
            </LiquidGlassSurface>
          </View>
        </BlurView>
      </Modal>

      <TabletStaffEscape
        onVerified={() => navigation.navigate("TabletModeSelect")}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  outer: { flex: 1, backgroundColor: "#030108" },
  container: {
    flex: 1,
    backgroundColor: "transparent",
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
    color: "rgba(255,255,255,0.55)",
    textAlign: "center",
  },
  homeActionsWide: { width: "100%", maxWidth: 520, gap: 16 },
  homeCardTouchable: { width: "100%" },
  homeGlassCard: {
    width: "100%",
    borderRadius: 28,
    ...(Platform.OS === "ios"
      ? ({ borderCurve: "continuous" } as const)
      : null),
  },
  homeGlassRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 20,
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
    backgroundColor: "transparent",
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
    borderColor: "transparent",
    height: 48,
    marginTop: 4,
  },
  secondaryActionText: { color: "transparent", fontSize: 15, fontWeight: "600" },
  iconGhostBtn: { padding: 6, borderRadius: 10 },
  errorText: { color: "#f87171", textAlign: "center", fontSize: 14 },
  inlineRow: { flexDirection: "row", gap: 8 },
  selectBtn: {
    flex: 1,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.1)",
    backgroundColor: "rgba(255,255,255,0.05)",
    alignItems: "center",
    justifyContent: "center",
    height: 42,
  },
  selectBtnActive: { borderColor: "transparent", backgroundColor: "transparent" },
  selectBtnText: { color: "#fff", fontSize: 13, fontWeight: "600" },

  flowGlassPanel: {
    width: "100%",
    maxWidth: 440,
    borderRadius: 26,
    paddingVertical: 26,
    paddingHorizontal: 22,
    alignSelf: "center",
    ...(Platform.OS === "ios"
      ? ({ borderCurve: "continuous" } as const)
      : null),
  },
  flowGlassPanelInner: { alignItems: "center", gap: 16 },

  // ── NEEDS REGISTRATION ────────────────────────────────────────────────────
  needsRegRoot: { position: "relative", width: "100%", paddingTop: 48 },
  needsRegGlass: {
    width: "100%",
    maxWidth: 520,
    borderRadius: 26,
    paddingVertical: 24,
    paddingHorizontal: 20,
    alignSelf: "center",
    ...(Platform.OS === "ios"
      ? ({ borderCurve: "continuous" } as const)
      : null),
  },
  needsRegGlassInner: { alignItems: "center", gap: 16 },
  needsRegBack: { position: "absolute", zIndex: 4, padding: 10, borderRadius: 999 },
  scanAgainBig: {
    width: "100%",
    maxWidth: 520,
    borderRadius: 28,
    backgroundColor: "transparent",
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
    backgroundColor: "transparent",
    paddingVertical: 14,
    paddingHorizontal: 22,
  },
  phoneAltBtnText: { color: "#fff", fontSize: 17, fontWeight: "600" },

  // ── PHONE CARD ────────────────────────────────────────────────────────────
  phoneGlass: {
    width: "100%",
    maxWidth: 440,
    alignSelf: "center",
    borderRadius: 20,
    ...(Platform.OS === "ios"
      ? ({ borderCurve: "continuous" } as const)
      : null),
  },
  phoneCardInner: { padding: 20, gap: 12 },
  phoneCardHeader: { flexDirection: "row", alignItems: "center", gap: 8 },
  phoneCardTitle: { flex: 1, fontSize: 18, fontWeight: "600", color: "#fff" },
  phoneCardHint: { fontSize: 14, color: "#a3a3a3" },
  phonePreviewBox: {
    borderRadius: 12,
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.1)",
    backgroundColor: "rgba(0,0,0,0.35)",
    padding: 16,
    gap: 8,
  },
  phonePreviewLine: { fontSize: 14, color: "#d4d4d4" },
  phonePreviewMuted: { color: "#737373" },
  phonePreviewStrong: { color: "#fff", fontWeight: "600" },
  confirmFuchsiaBtn: {
    marginTop: 4,
    borderRadius: 10,
    backgroundColor: "transparent",
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
  regGotPhotoTitle: { fontSize: 30, fontWeight: "700", color: "transparent", textAlign: "center" },
  bigInput: {
    backgroundColor: "rgba(255,255,255,0.06)",
    borderRadius: 14,
    height: 56,
    paddingHorizontal: 20,
    fontSize: 18,
    color: "#fff",
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.12)",
  },
  regCircleOuter: {
    width: REG_FACE_CIRCLE,
    height: REG_FACE_CIRCLE,
    borderRadius: REG_FACE_CIRCLE / 2,
    borderWidth: 4,
    borderColor: "transparent",
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
    backgroundColor: "transparent",
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
    backgroundColor: "transparent",
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
  regFormGlass: {
    width: "100%",
    borderRadius: 20,
    alignSelf: "center",
    ...(Platform.OS === "ios"
      ? ({ borderCurve: "continuous" } as const)
      : null),
  },
  regFormCardInner: {
    padding: 16,
    gap: 4,
    width: "100%",
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
  subOfferBack: {
    position: "absolute",
    left: 16,
    zIndex: 10,
    padding: 6,
  },
  subOfferScroll: {
    flexGrow: 1,
    justifyContent: "center",
    alignItems: "center",
    paddingHorizontal: 8,
    paddingVertical: 48,
    /** Needed so `width: "100%"` children (packages, pay-today) resolve under `alignItems: "center"`. */
    width: "100%",
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
  subOfferList: { width: "100%", marginTop: 24, gap: 12, marginBottom: 16 },
  pkgGlass: {
    borderRadius: 18,
    padding: 16,
    overflow: "hidden",
    ...(Platform.OS === "ios"
      ? ({ borderCurve: "continuous" } as const)
      : null),
  },
  pkgGlassSelected: {
    borderColor: "rgba(232,121,249,0.55)",
    borderWidth: 1.5,
  },
  pkgName: { fontSize: 16, fontWeight: "600", color: "#fff" },

  // Stacked badges — absolute top-right corner of the card
  pkgBadgeStack: {
    position: "absolute",
    top: 12,
    right: 12,
    alignItems: "flex-end",
    gap: 4,
  },
  pkgBestChoiceTag: {
    paddingHorizontal: 10,
    paddingVertical: 3,
    borderRadius: 12,
    backgroundColor: "transparent",
  },
  pkgBestChoiceText: { fontSize: 11, fontWeight: "700", color: "#fff" },
  pkgDiscountBadge: {
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 10,
    backgroundColor: "rgba(22,163,74,0.22)",
    borderWidth: 1,
    borderColor: "rgba(74,222,128,0.4)",
  },
  pkgDiscountBadgeText: { fontSize: 11, fontWeight: "700", color: "#4ade80" },
  pkgMeta: { fontSize: 14, color: "#a3a3a3", marginTop: 4 },
  pkgPrice: { fontSize: 18, fontWeight: "700", color: "#a855f7", marginTop: 8 },

  // OR separator
  orSeparator: {
    flexDirection: "row",
    alignItems: "center",
    width: "100%",
    marginTop: 20,
    marginBottom: 4,
    gap: 10,
  },
  orLine: { flex: 1, height: StyleSheet.hairlineWidth, backgroundColor: "rgba(255,255,255,0.14)" },
  orText: { fontSize: 12, fontWeight: "600", color: "rgba(255,255,255,0.35)", letterSpacing: 1 },

  // "Pay for Today Only" card at the bottom
  payTodayOuter: {
    width: "100%",
    alignSelf: "center",
    marginTop: 8,
  },
  payTodayTouchable: { width: "100%" },
  payTodayGlass: {
    width: "100%",
    borderRadius: 18,
    padding: 18,
    ...(Platform.OS === "ios"
      ? ({ borderCurve: "continuous" } as const)
      : null),
  },
  payTodayRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
  },
  payTodayTextWrap: { flex: 1, minWidth: 0 },
  payTodayTitle: { fontSize: 16, fontWeight: "700", color: "#fff" },
  payTodayDesc: { fontSize: 13, color: "#a3a3a3", marginTop: 4 },
  payTodayPrice: { fontSize: 15, fontWeight: "700", color: "#a855f7", marginTop: 6 },

  skipBtn: { marginTop: 20, paddingVertical: 12 },
  skipText: {
    fontSize: 14,
    color: "#737373",
    textDecorationLine: "underline",
    textAlign: "center",
  },

  // ── PAYMENT ───────────────────────────────────────────────────────────────
  payWaitGlass: {
    width: "100%",
    maxWidth: 440,
    borderRadius: 26,
    alignSelf: "center",
    ...(Platform.OS === "ios"
      ? ({ borderCurve: "continuous" } as const)
      : null),
  },
  payWaitGlassInner: {
    paddingVertical: 24,
    paddingHorizontal: 20,
    alignItems: "center",
    gap: 16,
  },
  payScanHint: { fontSize: 14, color: "#a3a3a3", textAlign: "center", paddingHorizontal: 8 },
  qrWrap: {
    backgroundColor: "#fff",
    borderRadius: 20,
    padding: 20,
    shadowColor: "#000",
    shadowOpacity: 0.2,
    shadowRadius: 12,
    shadowOffset: { width: 0, height: 4 },
  },
  qrImage: { width: 260, height: 260 },
  amount: { fontSize: 36, fontWeight: "700", color: "transparent" },
  ref: { fontSize: 14, color: "#737373", fontFamily: "monospace" },
  payWaitingRow: { flexDirection: "row", alignItems: "center", gap: 10 },
  payPulseDot: { width: 12, height: 12, borderRadius: 6, backgroundColor: "transparent" },
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
  confirmedGlass: {
    width: "100%",
    borderRadius: 28,
    ...(Platform.OS === "ios"
      ? ({ borderCurve: "continuous" } as const)
      : null),
  },
  confirmedGlassInner: {
    paddingVertical: 28,
    paddingHorizontal: 22,
    alignItems: "center",
    gap: 16,
  },
  successCircle: {
    width: 120,
    height: 120,
    borderRadius: 60,
    backgroundColor: "transparent",
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

  // ── Cash waiting overlay ──────────────────────────────────────────────────
  cashOverlayBlur: {
    flex: 1,
  },
  cashOverlayInner: {
    flex: 1,
    justifyContent: "center",
    alignItems: "center",
    paddingHorizontal: 24,
  },
  cashOverlayCard: {
    width: "100%",
    maxWidth: 420,
    borderRadius: 28,
    ...(Platform.OS === "ios"
      ? ({ borderCurve: "continuous" } as const)
      : null),
  },
  cashOverlayCardInner: {
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
