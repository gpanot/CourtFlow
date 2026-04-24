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
  | "subscription_exhausted_offer"
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
  latestSubscription?: ActiveSubInfo | null;
  alreadyPaidStatus?: string;
  error?: string;
}

function formatVND(amount: number) {
  return new Intl.NumberFormat("vi-VN").format(amount);
}

const IDLE_TIMEOUT_MS = 30_000;
const REG_FACE_CIRCLE = 312;
const CONFIRMED_AUTO_HOME_SEC = 8;
const EXHAUSTED_OFFER_AUTO_HOME_SEC = 30;
// Steps where idle timer must NOT fire (active user interaction or timed auto-reset)
const NO_IDLE_TIMEOUT_STEPS: Step[] = [
  "home",
  "scan_returning",
  "confirmed",
  "reg_face_capture",
  "reg_face_preview",
  "reg_form",
  "subscription_offer",
  "subscription_exhausted_offer",
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
  const isLight = themeMode === "light";
  const dyn = useMemo(() => ({
    primaryBtn:         { backgroundColor: CP.primary },
    secondaryActionBtn: { borderColor: isLight ? CP.primaryDark : CP.primaryLight },
    secondaryActionText:{ color: isLight ? CP.primaryDark : CP.primaryLight },
    selectBtnActive:    { borderColor: CP.primary, backgroundColor: isLight ? CP.bgOnLight : CP.bg },
    selectBtnTextActive:{ color: isLight ? CP.textOnLight : CP.text },
    scanAgainBig:       { backgroundColor: CP.primary },
    phoneAltBtn:        { backgroundColor: CP.primaryDark },
    confirmAccentBtn:   { backgroundColor: CP.primary },
    regGotPhotoTitle:   { color: isLight ? CP.textOnLight : CP.text },
    regCircleOuter:     { borderColor: CP.scannerBorder },
    regShutterBtn:      { backgroundColor: CP.primary },
    regLooksGoodBtn:    { backgroundColor: CP.primary },
    pkgBestChoiceTag:   { backgroundColor: CP.primary },
    amount:             { color: isLight ? CP.amountTextOnLight : CP.amountText },
    payPulseDot:        { backgroundColor: CP.pulseDot },
    successCircle:      { backgroundColor: isLight ? CP.successCircleOnLight : CP.successCircle },
  }), [CP, isLight]);
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
  const [regPhoneRequiredVisible, setRegPhoneRequiredVisible] = useState(false);
  const [confirmedSeconds, setConfirmedSeconds] = useState(CONFIRMED_AUTO_HOME_SEC);
  const [exhaustedOfferSeconds, setExhaustedOfferSeconds] = useState(EXHAUSTED_OFFER_AUTO_HOME_SEC);
  const [error, setError] = useState("");
  const [confirmMessage, setConfirmMessage] = useState("");
  const [confirmedSubInfo, setConfirmedSubInfo] = useState<ActiveSubInfo | null>(null);
  const [exhaustedSubInfo, setExhaustedSubInfo] = useState<ActiveSubInfo | null>(null);
  const [showExhaustedPackages, setShowExhaustedPackages] = useState(false);
  const [alreadyPaidPlayer, setAlreadyPaidPlayer] = useState<CheckInPlayerLite | null>(null);
  const [alreadyPaidStatus, setAlreadyPaidStatus] = useState<string>("");

  const idleTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const confirmedIntervalRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const exhaustedOfferIntervalRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const exhaustedOfferScrollRef = useRef<ScrollView | null>(null);
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
  const refreshPaymentSettings = useCallback(() => {
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

  useEffect(() => {
    refreshPaymentSettings();
  }, [refreshPaymentSettings]);

  const activePackages = packages.filter((p) => p.active);

  // ── Reset ─────────────────────────────────────────────────────────────────
  const resetToHome = useCallback(() => {
    if (confirmedIntervalRef.current) {
      clearInterval(confirmedIntervalRef.current);
      confirmedIntervalRef.current = null;
    }
    if (exhaustedOfferIntervalRef.current) {
      clearInterval(exhaustedOfferIntervalRef.current);
      exhaustedOfferIntervalRef.current = null;
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
    setRegPhoneRequiredVisible(false);
    setLoading(false);
    setError("");
    setConfirmMessage("");
    setConfirmedSubInfo(null);
    setExhaustedSubInfo(null);
    setShowExhaustedPackages(false);
    setConfirmedSeconds(CONFIRMED_AUTO_HOME_SEC);
    setExhaustedOfferSeconds(EXHAUSTED_OFFER_AUTO_HOME_SEC);
    refreshPaymentSettings();
  }, [refreshPaymentSettings]);

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

  // ── Exhausted-offer countdown ──────────────────────────────────────────────
  useEffect(() => {
    if (step !== "subscription_exhausted_offer" || showExhaustedPackages) {
      if (exhaustedOfferIntervalRef.current) {
        clearInterval(exhaustedOfferIntervalRef.current);
        exhaustedOfferIntervalRef.current = null;
      }
      return;
    }
    setExhaustedOfferSeconds(EXHAUSTED_OFFER_AUTO_HOME_SEC);
    let sec = EXHAUSTED_OFFER_AUTO_HOME_SEC;
    exhaustedOfferIntervalRef.current = setInterval(() => {
      sec -= 1;
      setExhaustedOfferSeconds(sec);
      if (sec <= 0) {
        if (exhaustedOfferIntervalRef.current) {
          clearInterval(exhaustedOfferIntervalRef.current);
          exhaustedOfferIntervalRef.current = null;
        }
        resetToHome();
      }
    }, 1000);
    return () => {
      if (exhaustedOfferIntervalRef.current) {
        clearInterval(exhaustedOfferIntervalRef.current);
        exhaustedOfferIntervalRef.current = null;
      }
    };
  }, [step, showExhaustedPackages, resetToHome]);

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
        setConfirmedSubInfo(sub ?? null);
        setConfirmMessage(t("paymentConfirmedMsg"));
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
  // Otherwise → regular subscription offer when packages exist.
  const goToSubscriptionOrPay = useCallback(
    (
      targetPlayer: CheckInPlayerLite,
      newPlayer: boolean,
      activeSub?: ActiveSubInfo | null
    ) => {
      setPlayer(targetPlayer);
      setIsNewPlayer(newPlayer);

      // Active subscription with sessions remaining → auto-check-in
      if (activeSub && activeSub.status === "active" &&
          (activeSub.isUnlimited || (activeSub.sessionsRemaining !== null && activeSub.sessionsRemaining > 0))) {
        setExhaustedSubInfo(null);
        void doPaySession(targetPlayer, undefined);
        return;
      }

      // No active sub → show package offer if packages exist and feature is enabled
      const activePkgs = packages.filter((p) => p.active);
      if (activePkgs.length > 0 && showSubscriptionsInFlow) {
        setExhaustedSubInfo(null);
        setStep("subscription_offer");
      } else {
        setExhaustedSubInfo(null);
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
    setExhaustedSubInfo(null);
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
        setPhoneError(t("phoneNotFound"));
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
            ? t("faceAlreadyExists", { name: check.playerName })
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
  const doPaySession = async (
    targetPlayer: CheckInPlayerLite,
    packageId?: string,
    options?: { skipSessionDeduction?: boolean }
  ) => {
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
        latestSubscription?: ActiveSubInfo | null;
      }>("/api/courtpay/pay-session", {
        venueCode: venueId,
        playerId: targetPlayer.id,
        packageId,
        skipSessionDeduction: options?.skipSessionDeduction === true,
      });

      if (res.checkedIn || res.free) {
        const sub = res.subscription;
        const latestSub = res.latestSubscription;
        const shouldShowExhaustedOffer =
          !!latestSub &&
          latestSub.status === "exhausted" &&
          !latestSub.isUnlimited &&
          (latestSub.sessionsRemaining ?? 0) <= 0;

        if (shouldShowExhaustedOffer) {
          setConfirmedSubInfo(null);
          setExhaustedSubInfo(latestSub);
          setShowExhaustedPackages(false);
          setSelectedPkg(null);
          setStep("subscription_exhausted_offer");
        } else {
          setConfirmedSubInfo(sub ?? null);
          setConfirmMessage(t("checkInConfirmedMsg"));
          setStep("confirmed");
        }
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
        setConfirmedSubInfo(null);
        setStep("awaiting_payment");
        return;
      }

      setConfirmedSubInfo(null);
      setConfirmMessage(t("checkInConfirmedMsg"));
      setStep("confirmed");
    } catch (err) {
      // 409 already_checked_in → show friendly confirmation screen instead of error
      if (err instanceof Error && err.message === "already_checked_in") {
        setConfirmedSubInfo(null);
        setConfirmMessage(t("alreadyCheckedInMsg", { name: targetPlayer.name }));
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
    if (!venueId || !faceBase64 || !name.trim() || !gender || !skillLevel) {
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
        checkedIn?: boolean;
        subscription?: ActiveSubInfo | null;
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
        phone: phoneInput.trim() || "",
      };
      setPlayer(registeredPlayer);

      if (reg.checkedIn) {
        const sub = reg.subscription;
        setConfirmedSubInfo(sub ?? null);
        setConfirmMessage(t("checkInConfirmedMsg"));
        setStep("confirmed");
      } else if (reg.pendingPaymentId) {
        setPendingPayment({
          id: reg.pendingPaymentId,
          amount: reg.amount ?? 0,
          paymentRef: reg.paymentRef ?? "",
          qrUrl: reg.vietQR ?? null,
          playerName: registeredPlayer.name,
        });
        setConfirmedSubInfo(null);
        setStep("awaiting_payment");
      } else {
        setConfirmedSubInfo(null);
        setConfirmMessage(t("checkInConfirmedMsg"));
        setStep("confirmed");
      }
    } catch (err) {
      if (err instanceof Error && err.message === "already_checked_in") {
        setConfirmedSubInfo(null);
        setConfirmMessage(t("alreadyCheckedInMsg", { name: name.trim() }));
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
    const isExhaustedRenewal = step === "subscription_exhausted_offer";
    if (player) {
      void doPaySession(player, selectedPkg, {
        skipSessionDeduction: isExhaustedRenewal,
      });
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
              <Text style={[styles.venueNameMuted, isLight && styles.venueNameMutedLight]}>{venueName}</Text>
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
                  tintColor={isLight ? CP.glassOverlayOnLight : CP.glassOverlay}
                  style={styles.homeGlassCard}
                  intensity={Platform.OS === "ios" ? 50 : 88}
                  mode={themeMode}
                >
                  <View style={styles.homeGlassRow}>
                    <ScanFace size={40} color={isLight ? CP.textOnLight : CP.text} strokeWidth={2} />
                    <View style={styles.homeCardTextCol}>
                      <Text style={[styles.homeCardTitle, isLight && styles.homeCardTitleLight]}>{t("homeCheckIn")}</Text>
                      <Text style={[styles.homeCardSub, isLight && styles.homeCardSubLight]}>{t("homeCheckInSub")}</Text>
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
                  mode={themeMode}
                >
                  <View style={styles.homeGlassRow}>
                    <UserPlus size={40} color={isLight ? "#64748b" : "#a3a3a3"} strokeWidth={2} />
                    <View style={styles.homeCardTextCol}>
                      <Text style={[styles.homeCardTitle, isLight && styles.homeCardTitleLight]}>{t("homeFirstTime")}</Text>
                      <Text style={[styles.homeCardSubMuted, isLight && styles.homeCardSubMutedLight]}>{t("homeFirstTimeSub")}</Text>
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
              setError(t("cameraNotReady"));
              setStep("error");
            }}
            onUsePhone={() => setStep("phone_enter")}
            onBack={resetToHome}
          />
        );

      // ── NO FACE ────────────────────────────────────────────────────────────
      case "no_face":
        return (
          <LiquidGlassSurface style={styles.flowGlassPanel} accent="none" mode={themeMode}>
            <View style={styles.flowGlassPanelInner}>
              <Ionicons name="scan-outline" size={56} color={isLight ? "#b45309" : "#fbbf24"} />
              <Text style={[styles.formTitle, isLight && styles.formTitleLight]}>{t("noFaceDetected")}</Text>
              <Text style={[styles.heroSubtitle, isLight && styles.heroSubtitleLight]}>{t("lookAtCamera")}</Text>
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
                <Ionicons name="call-outline" size={18} color={isLight ? CP.primaryDark : CP.primaryLight} />
                <Text style={[styles.secondaryActionText, dyn.secondaryActionText]}>{t("usePhoneInstead")}</Text>
              </TouchableOpacity>
              <TouchableOpacity style={styles.cancelBtn} onPress={resetToHome}>
                <Text style={[styles.cancelText, isLight && styles.cancelTextLight]}>{t("backToHome")}</Text>
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
              <Ionicons name="arrow-back" size={26} color={isLight ? "#475569" : "#a3a3a3"} />
            </Pressable>
            <LiquidGlassSurface style={styles.needsRegGlass} accent="amber" mode={themeMode}>
              <View style={styles.needsRegGlassInner}>
                <Ionicons name="alert-circle-outline" size={60} color={isLight ? "#b45309" : "#f59e0b"} />
                <Text style={[styles.formTitle, isLight && styles.formTitleLight]}>{t("faceNotRecognized")}</Text>
                <Text style={[styles.heroSubtitle, isLight && styles.heroSubtitleLight]}>{t("faceNotRecognizedHint")}</Text>
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
            <LiquidGlassSurface style={styles.phoneGlass} tintColor={isLight ? CP.glassOverlayOnLight : CP.glassOverlay} mode={themeMode}>
              <View style={styles.phoneCardInner}>
                <View style={styles.phoneCardHeader}>
                  <TouchableOpacity
                    style={styles.iconGhostBtn}
                    onPress={resetToHome}
                    hitSlop={10}
                  >
                    <Ionicons name="arrow-back" size={22} color={isLight ? "#475569" : "#a3a3a3"} />
                  </TouchableOpacity>
                  <Text style={[styles.phoneCardTitle, isLight && styles.phoneCardTitleLight]}>{t("checkInByPhone")}</Text>
                </View>
                <Text style={[styles.phoneCardHint, isLight && styles.phoneCardHintLight]}>{t("enterPhonePrompt")}</Text>
                <TextInput
                  style={[styles.bigInput, isLight && styles.bigInputLight]}
                  value={phoneInput}
                  onChangeText={(v) => {
                    setPhoneInput(v);
                    restartIdleTimer();
                  }}
                  keyboardType="phone-pad"
                  placeholder={t("phonePlaceholder")}
                  placeholderTextColor={isLight ? "#94a3b8" : "#737373"}
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
            <LiquidGlassSurface style={styles.phoneGlass} tintColor={isLight ? CP.glassOverlayOnLight : CP.glassOverlay} mode={themeMode}>
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
                    <Ionicons name="arrow-back" size={22} color={isLight ? "#475569" : "#a3a3a3"} />
                  </TouchableOpacity>
                  <Text style={[styles.phoneCardTitle, isLight && styles.phoneCardTitleLight]}>
                    {phonePreview?.name ?? "—"}
                  </Text>
                </View>
                <View style={[styles.phonePreviewBox, isLight && styles.phonePreviewBoxLight]}>
                  <Text style={[styles.phonePreviewLine, isLight && styles.phonePreviewLineLight]}>
                    <Text style={[styles.phonePreviewMuted, isLight && styles.phonePreviewMutedLight]}>{t("phoneLabel")} </Text>
                    <Text style={[styles.phonePreviewStrong, isLight && styles.phonePreviewStrongLight]}>
                      {phonePreview?.phone ?? ""}
                    </Text>
                  </Text>
                  {phonePreview?.skillLevel ? (
                    <Text style={[styles.phonePreviewLine, isLight && styles.phonePreviewLineLight]}>
                      <Text style={[styles.phonePreviewMuted, isLight && styles.phonePreviewMutedLight]}>{t("levelLabel")} </Text>
                      <Text style={[styles.phonePreviewStrong, isLight && styles.phonePreviewStrongLight]}>
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
            <LiquidGlassSurface style={styles.flowGlassPanel} tintColor={isLight ? CP.glassOverlayOnLight : CP.glassOverlay} mode={themeMode}>
              <View style={[styles.flowGlassPanelInner, { paddingHorizontal: 8 }]}>
                <Text style={[styles.formTitle, isLight && styles.formTitleLight]}>{t("cameraPermissionTitle")}</Text>
                <Text style={[styles.heroSubtitle, isLight && styles.heroSubtitleLight]}>{t("cameraPermissionHint")}</Text>
                <TouchableOpacity
                  style={[styles.primaryBtn, dyn.primaryBtn]}
                  onPress={() => void requestPermission()}
                >
                  <Text style={styles.primaryBtnText}>{t("allowCameraCta")}</Text>
                </TouchableOpacity>
                <TouchableOpacity style={styles.cancelBtn} onPress={resetToHome}>
                  <Text style={[styles.cancelText, isLight && styles.cancelTextLight]}>{t("back")}</Text>
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
                <Ionicons name="arrow-back" size={22} color={isLight ? "#475569" : "#a3a3a3"} />
              </TouchableOpacity>
            </View>
            <View style={[styles.centerContent, styles.regCaptureContent]}>
              <Text style={[styles.regCaptureTitle, isLight && styles.regCaptureTitleLight]}>{t("regTitle")}</Text>
              <Text style={[styles.regCaptureHint, isLight && styles.regCaptureHintLight]}>{t("regFaceHint")}</Text>
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
                style={[styles.regRetakeBtn, isLight && styles.regRetakeBtnLight]}
                onPress={() => {
                  setFaceBase64(null);
                  regCameraReady.current = false;
                  setStep("reg_face_capture");
                }}
                activeOpacity={0.85}
              >
                <Text style={[styles.regRetakeText, isLight && styles.regRetakeTextLight]}>{t("regRetake")}</Text>
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
            <LiquidGlassSurface style={styles.regFormGlass} accent="none" mode={themeMode}>
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
                    <Ionicons name="arrow-back" size={22} color={isLight ? "#475569" : "#a3a3a3"} />
                  </TouchableOpacity>
                  <Text style={[styles.regFormCardTitle, isLight && styles.regFormCardTitleLight]}>{t("regTitle")}</Text>
                </View>
                <Text style={[styles.regFormLabel, isLight && styles.regFormLabelLight]}>{t("regName")}</Text>
              <TextInput
                style={[styles.bigInput, isLight && styles.bigInputLight]}
                value={name}
                onChangeText={(v) => {
                  setName(v);
                  restartIdleTimer();
                }}
                placeholder={t("regNamePlaceholder")}
                placeholderTextColor={isLight ? "#94a3b8" : "#737373"}
                autoFocus
              />
              <Text style={[styles.regFormLabel, isLight && styles.regFormLabelLight]}>{t("regPhone")}</Text>
              <TextInput
                style={[styles.bigInput, isLight && styles.bigInputLight]}
                value={phoneInput}
                onChangeText={(v) => {
                  setPhoneInput(v);
                  restartIdleTimer();
                }}
                keyboardType="phone-pad"
                placeholder={t("regPhonePlaceholder")}
                placeholderTextColor={isLight ? "#94a3b8" : "#737373"}
              />
              <Text style={[styles.regFormLabel, isLight && styles.regFormLabelLight]}>{t("regGender")}</Text>
              <View style={styles.inlineRow}>
                <TouchableOpacity
                  style={[
                    styles.selectBtn,
                    isLight && styles.selectBtnLight,
                    gender === "male" && styles.selectBtnActive,
                    gender === "male" && dyn.selectBtnActive,
                  ]}
                  onPress={() => { Keyboard.dismiss(); setGender("male"); restartIdleTimer(); }}
                >
                  <Text
                    style={[
                      styles.selectBtnText,
                      isLight && styles.selectBtnTextLight,
                      gender === "male" && styles.selectBtnTextActive,
                      gender === "male" && dyn.selectBtnTextActive,
                    ]}
                  >
                    {t("regMale")}
                  </Text>
                </TouchableOpacity>
                <TouchableOpacity
                  style={[
                    styles.selectBtn,
                    isLight && styles.selectBtnLight,
                    gender === "female" && styles.selectBtnActive,
                    gender === "female" && dyn.selectBtnActive,
                  ]}
                  onPress={() => { Keyboard.dismiss(); setGender("female"); restartIdleTimer(); }}
                >
                  <Text
                    style={[
                      styles.selectBtnText,
                      isLight && styles.selectBtnTextLight,
                      gender === "female" && styles.selectBtnTextActive,
                      gender === "female" && dyn.selectBtnTextActive,
                    ]}
                  >
                    {t("regFemale")}
                  </Text>
                </TouchableOpacity>
              </View>
              <Text style={[styles.regFormLabel, isLight && styles.regFormLabelLight]}>{t("regLevel")}</Text>
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
                      isLight && styles.selectBtnLight,
                      skillLevel === lvl && styles.selectBtnActive,
                      skillLevel === lvl && dyn.selectBtnActive,
                    ]}
                    onPress={() => { Keyboard.dismiss(); setSkillLevel(lvl); restartIdleTimer(); }}
                  >
                    <Text
                      style={[
                        styles.selectBtnText,
                        isLight && styles.selectBtnTextLight,
                        skillLevel === lvl && styles.selectBtnTextActive,
                        skillLevel === lvl && dyn.selectBtnTextActive,
                      ]}
                    >
                      {t(labelKey as CheckInScannerStringKey)}
                    </Text>
                  </TouchableOpacity>
                ))}
              </View>
              <TouchableOpacity
                style={[styles.primaryBtn, dyn.primaryBtn, loading && styles.disabledBtn]}
                onPress={() => {
                  if (!phoneInput.trim()) {
                    restartIdleTimer();
                    setRegPhoneRequiredVisible(true);
                    return;
                  }
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
          ? t("subOfferWelcomeNew", { name: playerName })
          : t("subOfferWelcomeBack", { name: playerName });
        const subtitle = isNewPlayer
          ? t("subOfferSubtitleNew")
          : t("subOfferSubtitleReturning");

        return (
          <View style={{ flex: 1 }}>
            {/* Back button — restart flow */}
            <TouchableOpacity
              style={[styles.subOfferBack, { top: insets.top + 12 }]}
              onPress={resetToHome}
              hitSlop={12}
              activeOpacity={0.7}
            >
              <Ionicons name="arrow-back" size={26} color={isLight ? "#475569" : "#a3a3a3"} />
            </TouchableOpacity>

            <ScrollView
              ref={exhaustedOfferScrollRef}
              contentContainerStyle={styles.subOfferScroll}
              keyboardShouldPersistTaps="handled"
            >
              <Text style={[styles.subOfferGreeting, isLight && styles.subOfferGreetingLight]}>{greeting}</Text>
              <Text style={[styles.subOfferSubtitle, isLight && styles.subOfferSubtitleLight]}>{subtitle}</Text>

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
                        mode={themeMode}
                      >
                      <View style={styles.pkgBadgeStack}>
                        {pkg.isBestChoice && (
                          <View style={[styles.pkgBestChoiceTag, dyn.pkgBestChoiceTag]}>
                            <Text style={styles.pkgBestChoiceText}>{t("subOfferBestChoice")}</Text>
                          </View>
                        )}
                        {pkg.discountPct != null && pkg.discountPct > 0 && (
                          <View style={styles.pkgDiscountBadge}>
                            <Text style={styles.pkgDiscountBadgeText}>
                              {t("subOfferSave", { pct: pkg.discountPct })}
                            </Text>
                          </View>
                        )}
                      </View>

                      <Text style={[styles.pkgName, { marginRight: 80 }, isLight && styles.pkgNameLight]}>{pkg.name}</Text>

                      <Text style={[styles.pkgMeta, isLight && styles.pkgMetaLight]}>
                        {pkg.sessions === null
                          ? t("subOfferUnlimited")
                          : `${pkg.sessions} ${t("subOfferSessions")}`}
                        {pkg.durationDays ? ` · ${pkg.durationDays} ${t("subOfferDays")}` : ""}
                      </Text>
                      <Text style={[styles.pkgPrice, isLight && styles.pkgPriceLight]}>
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
                  !selectedPkg && !loading && styles.primaryBtnContinueIdle,
                  loading && styles.disabledBtn,
                ]}
                onPress={handleSubscriptionContinue}
                disabled={!selectedPkg || loading}
              >
                {loading ? (
                  <ActivityIndicator color="#fff" />
                ) : selectedPkg ? (
                  <Text style={styles.primaryBtnText}>{t("subOfferContinue")}</Text>
                ) : null}
              </TouchableOpacity>

              <View style={styles.orSeparator}>
                <View style={[styles.orLine, isLight && styles.orLineLight]} />
                <Text style={[styles.orText, isLight && styles.orTextLight]}>{t("subOfferOr")}</Text>
                <View style={[styles.orLine, isLight && styles.orLineLight]} />
              </View>

              <View style={styles.payTodayOuter}>
                <TouchableOpacity
                  onPress={handleSubscriptionSkip}
                  disabled={loading}
                  activeOpacity={0.8}
                  style={styles.payTodayTouchable}
                >
                  <LiquidGlassSurface style={styles.payTodayGlass} accent="none" mode={themeMode}>
                    <View style={styles.payTodayRow}>
                      <View style={styles.payTodayTextWrap}>
                        <Text style={[styles.payTodayTitle, isLight && styles.payTodayTitleLight]}>{t("subOfferPayTodayTitle")}</Text>
                        <Text style={[styles.payTodayDesc, isLight && styles.payTodayDescLight]}>
                          {t("subOfferPayTodayDesc")}
                        </Text>
                        {sessionFee > 0 ? (
                          <Text style={[styles.payTodayPrice, isLight && styles.payTodayPriceLight]}>{formatVND(sessionFee)}</Text>
                        ) : null}
                      </View>
                      <Ionicons name="chevron-forward" size={20} color={isLight ? "#64748b" : "#a3a3a3"} />
                    </View>
                  </LiquidGlassSurface>
                </TouchableOpacity>
              </View>
            </ScrollView>
          </View>
        );
      }

      // ── SUBSCRIPTION EXHAUSTED OFFER ───────────────────────────────────────
      case "subscription_exhausted_offer": {
        const playerName = player?.name ?? phonePreview?.name ?? "player";
        const daysLeft = exhaustedSubInfo?.daysRemaining ?? 0;
        return (
          <View style={{ flex: 1 }}>
            <TouchableOpacity
              style={[styles.subOfferBack, { top: insets.top + 12 }]}
              onPress={resetToHome}
              hitSlop={12}
              activeOpacity={0.7}
            >
              <Ionicons name="arrow-back" size={26} color={isLight ? "#475569" : "#a3a3a3"} />
            </TouchableOpacity>
            <ScrollView
              contentContainerStyle={styles.subOfferScroll}
              keyboardShouldPersistTaps="handled"
            >
              <View style={styles.exhaustedHero}>
                <View style={[styles.successCircle, dyn.successCircle, styles.exhaustedSuccessCircle]}>
                  <Ionicons name="checkmark" size={42} color={isLight ? CP.textOnLight : CP.text} />
                </View>
                <Text style={[styles.exhaustedTitle, isLight && styles.exhaustedTitleLight]}>{t("exhaustedWelcomeBack", { name: playerName })}</Text>
                <Text style={[styles.exhaustedSubtitle, isLight && styles.exhaustedSubtitleLight]}>
                  {t("exhaustedSubtitle")}
                </Text>
                <View style={styles.exhaustedKpiRow}>
                  <LiquidGlassSurface style={styles.exhaustedKpiCard} tintColor={isLight ? CP.glassOverlayOnLight : CP.glassOverlay} mode={themeMode}>
                    <View style={styles.exhaustedKpiInner}>
                      <Ionicons name="ticket-outline" size={18} color={isLight ? CP.primaryDark : CP.primaryLight} />
                      <Text style={[styles.exhaustedKpiValue, { color: isLight ? CP.textOnLight : CP.text }]}>0</Text>
                      <Text style={[styles.exhaustedKpiLabel, isLight && styles.exhaustedKpiLabelLight]}>{t("exhaustedSessionsLeft")}</Text>
                    </View>
                  </LiquidGlassSurface>
                  <LiquidGlassSurface style={styles.exhaustedKpiCard} tintColor={isLight ? CP.glassOverlayOnLight : CP.glassOverlay} mode={themeMode}>
                    <View style={styles.exhaustedKpiInner}>
                      <Ionicons name="calendar-outline" size={18} color={isLight ? CP.primaryDark : CP.primaryLight} />
                      <Text style={[styles.exhaustedKpiValue, { color: isLight ? CP.textOnLight : CP.text }]}>{daysLeft}</Text>
                      <Text style={[styles.exhaustedKpiLabel, isLight && styles.exhaustedKpiLabelLight]}>{t("exhaustedDaysLeft")}</Text>
                    </View>
                  </LiquidGlassSurface>
                </View>
                {!showExhaustedPackages ? (
                  <>
                    <Text style={[styles.exhaustedCountdownText, isLight && styles.exhaustedCountdownTextLight]}>
                      {t("exhaustedCountdown", { seconds: exhaustedOfferSeconds })}
                    </Text>
                    <TouchableOpacity
                      style={[styles.primaryBtn, dyn.primaryBtn, styles.primaryBtnWide]}
                      onPress={() => {
                        setShowExhaustedPackages(true);
                        setTimeout(() => {
                          exhaustedOfferScrollRef.current?.scrollToEnd({ animated: true });
                        }, 80);
                      }}
                      activeOpacity={0.85}
                    >
                      <Text style={styles.primaryBtnText}>{t("exhaustedShowPackages")}</Text>
                    </TouchableOpacity>
                    <TouchableOpacity
                      style={styles.cancelBtn}
                      onPress={resetToHome}
                      activeOpacity={0.7}
                    >
                      <Text style={[styles.cancelText, isLight && styles.cancelTextLight]}>{t("exhaustedNextTime")}</Text>
                    </TouchableOpacity>
                  </>
                ) : null}
              </View>

              {showExhaustedPackages ? (
                <>
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
                            mode={themeMode}
                          >
                            <View style={styles.pkgBadgeStack}>
                              {pkg.isBestChoice && (
                                <View style={[styles.pkgBestChoiceTag, dyn.pkgBestChoiceTag]}>
                                  <Text style={styles.pkgBestChoiceText}>{t("subOfferBestChoice")}</Text>
                                </View>
                              )}
                              {pkg.discountPct != null && pkg.discountPct > 0 && (
                                <View style={styles.pkgDiscountBadge}>
                                  <Text style={styles.pkgDiscountBadgeText}>
                                    {t("subOfferSave", { pct: pkg.discountPct })}
                                  </Text>
                                </View>
                              )}
                            </View>
                            <Text style={[styles.pkgName, { marginRight: 80 }, isLight && styles.pkgNameLight]}>{pkg.name}</Text>
                            <Text style={[styles.pkgMeta, isLight && styles.pkgMetaLight]}>
                              {pkg.sessions === null
                                ? t("subOfferUnlimited")
                                : `${pkg.sessions} ${t("subOfferSessions")}`}
                              {pkg.durationDays ? ` · ${pkg.durationDays} ${t("subOfferDays")}` : ""}
                            </Text>
                            <Text style={[styles.pkgPrice, isLight && styles.pkgPriceLight]}>
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
                      !selectedPkg && !loading && styles.primaryBtnContinueIdle,
                      loading && styles.disabledBtn,
                    ]}
                    onPress={handleSubscriptionContinue}
                    disabled={!selectedPkg || loading}
                  >
                    {loading ? (
                      <ActivityIndicator color="#fff" />
                    ) : selectedPkg ? (
                      <Text style={styles.primaryBtnText}>{t("subOfferContinue")}</Text>
                    ) : null}
                  </TouchableOpacity>

                  <TouchableOpacity
                    style={styles.cancelBtn}
                    onPress={resetToHome}
                    activeOpacity={0.7}
                  >
                    <Text style={[styles.cancelText, isLight && styles.cancelTextLight]}>{t("exhaustedNextTime")}</Text>
                  </TouchableOpacity>
                </>
              ) : null}
            </ScrollView>
          </View>
        );
      }

      // ── AWAITING PAYMENT ───────────────────────────────────────────────────
      case "awaiting_payment":
        return (
          <LiquidGlassSurface style={styles.payWaitGlass} tintColor={isLight ? CP.glassOverlayOnLight : CP.glassOverlay} mode={themeMode}>
            <View style={styles.payWaitGlassInner}>
              <Text style={[styles.formTitle, isLight && styles.formTitleLight]}>
                {pendingPayment?.playerName?.trim()
                  ? t("payTitle", { name: pendingPayment.playerName.trim() })
                  : t("payReturningTitle")}
              </Text>
              <Text style={[styles.payScanHint, isLight && styles.payScanHintLight]}>{t("payScanQR")}</Text>
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
              <Text style={[styles.ref, isLight && styles.refLight]}>{pendingPayment?.paymentRef}</Text>

              <View style={styles.payWaitingRow}>
                <View style={[styles.payPulseDot, dyn.payPulseDot]} />
                <Text style={[styles.waitText, isLight && styles.waitTextLight]}>{t("payWaitingForStaff")}</Text>
              </View>

              <TouchableOpacity style={styles.cashBtn} onPress={handleCash}>
                <Ionicons name="cash-outline" size={18} color={isLight ? "#b45309" : "#fbbf24"} />
                <Text style={[styles.cashText, isLight && styles.cashTextLight]}>{t("payByCash")}</Text>
              </TouchableOpacity>
              <TouchableOpacity style={styles.cancelBtn} onPress={handleCancelPayment}>
                <Text style={[styles.cancelText, isLight && styles.cancelTextLight]}>{t("cancel")}</Text>
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
            playerNameAlreadyPaidLabel={
              alreadyPaidPlayer?.name
                ? t("alreadyPaidWithName", { name: alreadyPaidPlayer.name })
                : t("alreadyPaidNoName")
            }
            noNameFallback={t("alreadyPaidNoName")}
            subtitle={
              alreadyPaidStatus === "pending"
                ? t("alreadyPaidPending")
                : t("alreadyPaidConfirmed")
            }
            faceBase64={faceBase64}
            onPrimaryAction={resetToHome}
            primaryLabel={t("backToHome")}
            mode={themeMode}
          />
        );

      // ── EXISTING USER ──────────────────────────────────────────────────────
      case "existing_user":
        return (
          <CourtPayStatusCard
            variant="existing_user"
            playerName={t("regExistingUserTitle")}
            noNameFallback={t("existingPlayerNoName")}
            subtitle={confirmMessage || t("regExistingUserHint")}
            faceBase64={faceBase64}
            onPrimaryAction={resetToHome}
            primaryLabel={t("backToHome")}
            mode={themeMode}
          />
        );

      // ── ERROR ──────────────────────────────────────────────────────────────
      case "error":
        return (
          <LiquidGlassSurface style={styles.flowGlassPanel} accent="none" mode={themeMode}>
            <View style={styles.flowGlassPanelInner}>
              <Ionicons name="warning-outline" size={64} color="#ef4444" />
              <Text style={[styles.formTitle, isLight && styles.formTitleLight]}>{t("somethingWrong")}</Text>
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
              <LiquidGlassSurface style={styles.confirmedGlass} tintColor={isLight ? CP.glassOverlayOnLight : CP.glassOverlay} mode={themeMode}>
                <View style={styles.confirmedGlassInner}>
                  <View style={[styles.successCircle, dyn.successCircle]}>
                    <Ionicons name="checkmark" size={64} color={isLight ? CP.textOnLight : CP.text} />
                  </View>
                  <Text style={[styles.successTitle, isLight && styles.successTitleLight]}>
                    {(player?.name ?? "").trim()
                      ? t("confirmedHeadline", { name: (player?.name ?? "").trim() })
                      : t("confirmedHeadlineNoName")}
                  </Text>
                  <Text style={[styles.successSub, isLight && styles.successSubLight]}>
                    {t("confirmedHaveFun")}
                  </Text>
                  {confirmMessage ? (
                    <Text style={[styles.successSubMuted, isLight && styles.successSubMutedLight]}>
                      {confirmMessage}
                    </Text>
                  ) : null}
                  {confirmedSubInfo ? (
                    <View style={styles.confirmedKpiRow}>
                      <LiquidGlassSurface style={styles.confirmedKpiCard} tintColor={isLight ? CP.glassOverlayOnLight : CP.glassOverlay} mode={themeMode}>
                        <View style={styles.confirmedKpiInner}>
                          <Ionicons name="ticket-outline" size={22} color={isLight ? CP.primaryDark : CP.primaryLight} />
                          <Text style={[styles.confirmedKpiValue, { color: isLight ? CP.textOnLight : CP.text }]}>
                            {confirmedSubInfo.isUnlimited ? "∞" : String(confirmedSubInfo.sessionsRemaining ?? 0)}
                          </Text>
                          <Text style={[styles.confirmedKpiLabel, isLight && styles.confirmedKpiLabelLight]}>{t("confirmedSessionsRemaining")}</Text>
                        </View>
                      </LiquidGlassSurface>
                      <LiquidGlassSurface style={styles.confirmedKpiCard} tintColor={isLight ? CP.glassOverlayOnLight : CP.glassOverlay} mode={themeMode}>
                        <View style={styles.confirmedKpiInner}>
                          <Ionicons name="calendar-outline" size={22} color={isLight ? CP.primaryDark : CP.primaryLight} />
                          <Text style={[styles.confirmedKpiValue, { color: isLight ? CP.textOnLight : CP.text }]}>
                            {confirmedSubInfo.daysRemaining}
                          </Text>
                          <Text style={[styles.confirmedKpiLabel, isLight && styles.confirmedKpiLabelLight]}>{t("confirmedDaysLeft")}</Text>
                        </View>
                      </LiquidGlassSurface>
                    </View>
                  ) : null}
                  <Text style={[styles.confirmedCountdown, isLight && styles.confirmedCountdownLight]}>
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
          tagline={t("courtpayTagline")}
          locale={locale}
          onToggleLocale={toggleLocale}
          themeMode={themeMode}
          onToggleTheme={toggleTheme}
        />
      ) : null}
      <View style={styles.container} onTouchStart={restartIdleTimer}>
        {renderStep()}
      </View>

      {/* Cash waiting overlay — solid surfaces (no translucent dialog chrome) */}
      <Modal visible={cashPending} animationType="fade">
        <View
          style={[
            styles.cashOverlayBlur,
            { backgroundColor: isLight ? CP.backdropBaseLight : CP.backdropBase },
          ]}
        >
          <View style={styles.cashOverlayInner}>
            <View
              style={[
                styles.cashOverlayCard,
                isLight && styles.cashOverlayCardLight,
              ]}
            >
              <View style={styles.cashOverlayCardInner}>
                <View
                  style={[
                    styles.cashOverlayIconRow,
                    isLight && styles.cashOverlayIconRowLight,
                  ]}
                >
                  <Ionicons name="cash-outline" size={48} color="#f59e0b" />
                </View>
                <Text
                  style={[styles.cashOverlayTitle, isLight && styles.cashOverlayTitleLight]}
                >
                  {t("cashOverlayTitle")}
                </Text>
                <Text
                  style={[styles.cashOverlayHint, isLight && styles.cashOverlayHintLight]}
                >
                  {t("cashOverlayHint")}
                </Text>
                <ActivityIndicator color="#f59e0b" style={{ marginVertical: 8 }} />
                {pendingPayment ? (
                  <Text style={styles.cashOverlayAmount}>
                    {formatVND(pendingPayment.amount)} VND
                  </Text>
                ) : null}
                <TouchableOpacity
                  style={[styles.cashOverlayCancel, isLight && styles.cashOverlayCancelLight]}
                  onPress={handleCancelPayment}
                  activeOpacity={0.7}
                >
                  <Text
                    style={[
                      styles.cashOverlayCancelText,
                      isLight && styles.cashOverlayCancelTextLight,
                    ]}
                  >
                    {t("cashOverlayCancel")}
                  </Text>
                </TouchableOpacity>
              </View>
            </View>
          </View>
        </View>
      </Modal>

      {/* Registration: phone reminder — solid panel (no glass / translucent scrim) */}
      <Modal
        visible={regPhoneRequiredVisible}
        animationType="fade"
        onRequestClose={() => setRegPhoneRequiredVisible(false)}
      >
        <View
          style={[
            styles.phoneReqRoot,
            { backgroundColor: isLight ? CP.backdropBaseLight : CP.backdropBase },
          ]}
          onTouchStart={restartIdleTimer}
        >
          <Pressable
            style={StyleSheet.absoluteFillObject}
            onPress={() => setRegPhoneRequiredVisible(false)}
            accessibilityRole="button"
            accessibilityLabel={t("regPhoneRequiredDismissScrim")}
          />
          <View style={styles.phoneReqCardWrap} pointerEvents="box-none">
            <View
              style={[
                styles.phoneReqCard,
                isLight ? styles.phoneReqCardLight : styles.phoneReqCardDark,
              ]}
            >
              <View style={styles.phoneReqInner}>
                <View
                  style={[
                    styles.phoneReqIconCircle,
                    isLight ? styles.phoneReqIconCircleLight : styles.phoneReqIconCircleDark,
                  ]}
                >
                  <Ionicons
                    name="phone-portrait-outline"
                    size={40}
                    color={isLight ? CP.primaryDark : CP.primaryLight}
                  />
                </View>
                <Text style={[styles.formTitle, isLight && styles.formTitleLight]}>
                  {t("regPhoneRequiredAlertTitle")}
                </Text>
                <Text style={[styles.heroSubtitle, isLight && styles.heroSubtitleLight]}>
                  {t("regPhoneRequiredAlertMessage")}
                </Text>
                <TouchableOpacity
                  style={[styles.primaryBtn, dyn.primaryBtn, styles.phoneReqOkBtn]}
                  onPress={() => {
                    restartIdleTimer();
                    setRegPhoneRequiredVisible(false);
                  }}
                  activeOpacity={0.88}
                >
                  <Text style={styles.primaryBtnText}>{t("regPhoneRequiredOk")}</Text>
                </TouchableOpacity>
              </View>
            </View>
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
  venueNameMutedLight: {
    color: "rgba(15,23,42,0.55)",
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
  homeCardTitleLight: { color: "#0f172a" },
  homeCardSub: { fontSize: 16, color: "#a3a3a3" },
  homeCardSubLight: { color: "#475569" },
  homeCardSubMuted: { fontSize: 16, color: "#a3a3a3" },
  homeCardSubMutedLight: { color: "#64748b" },

  // ── SHARED ───────────────────────────────────────────────────────────────
  centerContent: { alignItems: "center", gap: 16 },
  formContent: { gap: 16 },
  formContentSafe: { paddingHorizontal: 8, paddingBottom: 24 },
  heroSubtitle: { fontSize: 16, color: "#a3a3a3", textAlign: "center" },
  heroSubtitleLight: { color: "#475569" },
  formTitle: {
    fontSize: 24,
    fontWeight: "700",
    color: "#fff",
    textAlign: "center",
    marginBottom: 8,
  },
  formTitleLight: { color: "#0f172a" },
  primaryBtn: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 10,
    backgroundColor: "transparent",
    height: 56,
    borderRadius: 14,
    marginTop: 8,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: "rgba(255,255,255,0.30)",
    borderBottomWidth: 2,
    borderBottomColor: "rgba(0,0,0,0.20)",
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 3 },
    shadowOpacity: 0.25,
    shadowRadius: 6,
    elevation: 4,
  },
  primaryBtnText: { color: "#fff", fontSize: 18, fontWeight: "600", textShadowColor: "rgba(0,0,0,0.18)", textShadowOffset: { width: 0, height: 1 }, textShadowRadius: 1 },
  primaryBtnWide: { alignSelf: "stretch", width: "100%", marginTop: 12, minHeight: 56 },
  /** Continue on subscription offer: no package selected — keep layout height, no grey chrome */
  primaryBtnContinueIdle: {
    borderTopWidth: 0,
    borderBottomWidth: 0,
    shadowOpacity: 0,
    elevation: 0,
    opacity: 1,
  },
  disabledBtn: { opacity: 0.5 },
  cancelBtn: { alignItems: "center", padding: 16 },
  cancelText: { color: "#a3a3a3", fontSize: 16 },
  cancelTextLight: { color: "#64748b" },
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
    backgroundColor: "rgba(255,255,255,0.04)",
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.12,
    shadowRadius: 4,
    elevation: 2,
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
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: "rgba(255,255,255,0.12)",
    borderBottomWidth: 1.5,
    borderBottomColor: "rgba(0,0,0,0.12)",
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.10,
    shadowRadius: 2,
    elevation: 1,
  },
  selectBtnActive: { borderColor: "rgba(255,255,255,0.32)", backgroundColor: "rgba(255,255,255,0.12)" },
  selectBtnLight: {
    borderColor: "rgba(0,0,0,0.1)",
    backgroundColor: "rgba(0,0,0,0.04)",
    borderTopColor: "rgba(255,255,255,0.60)",
    borderBottomColor: "rgba(0,0,0,0.08)",
  },
  selectBtnText: { color: "#fff", fontSize: 13, fontWeight: "600" },
  selectBtnTextLight: { color: "#334155" },
  selectBtnTextActive: { color: "#fff" },

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
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: "rgba(255,255,255,0.28)",
    borderBottomWidth: 2,
    borderBottomColor: "rgba(0,0,0,0.18)",
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.30,
    shadowRadius: 8,
    elevation: 6,
  },
  scanAgainBigText: { color: "#fff", fontSize: 22, fontWeight: "700", textShadowColor: "rgba(0,0,0,0.20)", textShadowOffset: { width: 0, height: 1 }, textShadowRadius: 1 },
  phoneAltBtn: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    borderRadius: 14,
    backgroundColor: "transparent",
    paddingVertical: 14,
    paddingHorizontal: 22,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: "rgba(255,255,255,0.22)",
    borderBottomWidth: 1.5,
    borderBottomColor: "rgba(0,0,0,0.18)",
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.20,
    shadowRadius: 4,
    elevation: 3,
  },
  phoneAltBtnText: { color: "#fff", fontSize: 17, fontWeight: "600", textShadowColor: "rgba(0,0,0,0.18)", textShadowOffset: { width: 0, height: 1 }, textShadowRadius: 1 },

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
  phoneCardTitleLight: { color: "#0f172a" },
  phoneCardHint: { fontSize: 14, color: "#a3a3a3" },
  phoneCardHintLight: { color: "#64748b" },
  phonePreviewBox: {
    borderRadius: 12,
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.1)",
    backgroundColor: "rgba(0,0,0,0.35)",
    padding: 16,
    gap: 8,
  },
  phonePreviewBoxLight: {
    borderColor: "rgba(0,0,0,0.08)",
    backgroundColor: "rgba(0,0,0,0.04)",
  },
  phonePreviewLine: { fontSize: 14, color: "#d4d4d4" },
  phonePreviewLineLight: { color: "#334155" },
  phonePreviewMuted: { color: "#737373" },
  phonePreviewMutedLight: { color: "#94a3b8" },
  phonePreviewStrong: { color: "#fff", fontWeight: "600" },
  phonePreviewStrongLight: { color: "#0f172a" },
  confirmFuchsiaBtn: {
    marginTop: 4,
    borderRadius: 10,
    backgroundColor: "transparent",
    paddingVertical: 14,
    alignItems: "center",
    justifyContent: "center",
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: "rgba(255,255,255,0.25)",
    borderBottomWidth: 2,
    borderBottomColor: "rgba(0,0,0,0.18)",
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 3 },
    shadowOpacity: 0.22,
    shadowRadius: 5,
    elevation: 4,
  },
  confirmFuchsiaBtnText: { color: "#fff", fontSize: 16, fontWeight: "600", textShadowColor: "rgba(0,0,0,0.18)", textShadowOffset: { width: 0, height: 1 }, textShadowRadius: 1 },

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
  regCaptureTitleLight: { color: "#0f172a" },
  regCaptureHint: {
    fontSize: 16,
    color: "#a3a3a3",
    textAlign: "center",
    marginBottom: 8,
    paddingHorizontal: 12,
  },
  regCaptureHintLight: { color: "#64748b" },
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
  bigInputLight: {
    backgroundColor: "rgba(0,0,0,0.04)",
    borderColor: "rgba(0,0,0,0.12)",
    color: "#0f172a",
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
    borderTopWidth: 1,
    borderTopColor: "rgba(255,255,255,0.35)",
    borderBottomWidth: 3,
    borderBottomColor: "rgba(0,0,0,0.25)",
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.35,
    shadowRadius: 8,
    elevation: 6,
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
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: "rgba(255,255,255,0.30)",
    borderBottomWidth: 2,
    borderBottomColor: "rgba(0,0,0,0.20)",
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 3 },
    shadowOpacity: 0.25,
    shadowRadius: 6,
    elevation: 4,
  },
  regLooksGoodText: { color: "#fff", fontSize: 18, fontWeight: "700", textShadowColor: "rgba(0,0,0,0.18)", textShadowOffset: { width: 0, height: 1 }, textShadowRadius: 1 },
  regRetakeBtn: {
    borderRadius: 16,
    backgroundColor: "#404040",
    paddingHorizontal: 18,
    paddingVertical: 16,
    justifyContent: "center",
    minHeight: 56,
    minWidth: 100,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: "rgba(255,255,255,0.12)",
    borderBottomWidth: 2,
    borderBottomColor: "rgba(0,0,0,0.25)",
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.18,
    shadowRadius: 4,
    elevation: 3,
  },
  regRetakeBtnLight: {
    backgroundColor: "rgba(0,0,0,0.08)",
    borderTopColor: "rgba(255,255,255,0.5)",
    borderBottomColor: "rgba(0,0,0,0.10)",
  },
  regRetakeText: { color: "#e5e5e5", fontSize: 16, fontWeight: "600" },
  regRetakeTextLight: { color: "#334155" },

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
  regFormCardTitleLight: { color: "#0f172a" },
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
  regFormLabelLight: { color: "#64748b" },

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
  subOfferGreetingLight: { color: "#0f172a" },
  subOfferSubtitle: {
    fontSize: 18,
    color: "#a3a3a3",
    textAlign: "center",
    marginTop: 8,
  },
  subOfferSubtitleLight: { color: "#475569" },
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
  pkgNameLight: { color: "#0f172a" },

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
  pkgMetaLight: { color: "#64748b" },
  pkgPrice: { fontSize: 18, fontWeight: "700", color: "#a855f7", marginTop: 8 },
  pkgPriceLight: { color: "#7c3aed" },

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
  orLineLight: { backgroundColor: "rgba(0,0,0,0.12)" },
  orText: { fontSize: 12, fontWeight: "600", color: "rgba(255,255,255,0.35)", letterSpacing: 1 },
  orTextLight: { color: "rgba(0,0,0,0.35)" },

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
  payTodayTitleLight: { color: "#0f172a" },
  payTodayDesc: { fontSize: 13, color: "#a3a3a3", marginTop: 4 },
  payTodayDescLight: { color: "#64748b" },
  payTodayPrice: { fontSize: 15, fontWeight: "700", color: "#a855f7", marginTop: 6 },
  payTodayPriceLight: { color: "#7c3aed" },

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
  payScanHintLight: { color: "#64748b" },
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
  refLight: { color: "#64748b" },
  payWaitingRow: { flexDirection: "row", alignItems: "center", gap: 10 },
  payPulseDot: { width: 12, height: 12, borderRadius: 6, backgroundColor: "transparent" },
  waitText: { color: "#a3a3a3", fontSize: 15 },
  waitTextLight: { color: "#475569" },
  cashBtn: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
    backgroundColor: "rgba(217,119,6,0.12)",
    height: 40,
    borderRadius: 12,
    paddingHorizontal: 14,
    borderWidth: 1,
    borderColor: "rgba(217,119,6,0.30)",
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: "rgba(255,255,255,0.12)",
    borderBottomWidth: 1.5,
    borderBottomColor: "rgba(0,0,0,0.12)",
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.10,
    shadowRadius: 2,
    elevation: 1,
  },
  cashText: { color: "#fbbf24", fontSize: 16, fontWeight: "600" },
  cashTextLight: { color: "#b45309" },

  // ── EXHAUSTED OFFER ────────────────────────────────────────────────────────
  exhaustedHero: { width: "100%", alignItems: "center", marginBottom: 16 },
  exhaustedSuccessCircle: { width: 92, height: 92, borderRadius: 46 },
  exhaustedTitle: {
    fontSize: 36,
    lineHeight: 42,
    fontWeight: "800",
    color: "#fff",
    textAlign: "center",
    marginTop: 8,
  },
  exhaustedTitleLight: { color: "#0f172a" },
  exhaustedSubtitle: {
    fontSize: 15,
    color: "#a3a3a3",
    textAlign: "center",
    marginTop: 8,
    marginBottom: 12,
  },
  exhaustedSubtitleLight: { color: "#475569" },
  exhaustedKpiRow: {
    width: "100%",
    flexDirection: "row",
    gap: 12,
    marginBottom: 8,
  },
  exhaustedKpiCard: {
    flex: 1,
    borderRadius: 18,
    ...(Platform.OS === "ios"
      ? ({ borderCurve: "continuous" } as const)
      : null),
  },
  exhaustedKpiInner: {
    paddingVertical: 12,
    paddingHorizontal: 14,
    alignItems: "flex-start",
    minHeight: 104,
    justifyContent: "space-between",
  },
  exhaustedKpiValue: {
    fontSize: 34,
    lineHeight: 36,
    fontWeight: "700",
  },
  exhaustedKpiLabel: {
    fontSize: 12,
    color: "#cbd5e1",
    fontWeight: "600",
  },
  exhaustedKpiLabelLight: { color: "#475569" },
  exhaustedCountdownText: {
    fontSize: 14,
    color: "#94a3b8",
    textAlign: "center",
    marginTop: 4,
  },
  exhaustedCountdownTextLight: { color: "#64748b" },

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
  successTitleLight: { color: "#0f172a" },
  successSub: { fontSize: 16, color: "#a3a3a3", textAlign: "center" },
  successSubLight: { color: "#475569" },
  successSubMuted: {
    fontSize: 15,
    color: "#737373",
    textAlign: "center",
    marginTop: 4,
    lineHeight: 22,
  },
  successSubMutedLight: { color: "#64748b" },
  confirmedKpiRow: {
    width: "100%",
    flexDirection: "row",
    gap: 12,
  },
  confirmedKpiCard: {
    flex: 1,
    borderRadius: 22,
    ...(Platform.OS === "ios"
      ? ({ borderCurve: "continuous" } as const)
      : null),
  },
  confirmedKpiInner: {
    paddingVertical: 16,
    paddingHorizontal: 16,
    minHeight: 144,
    justifyContent: "space-between",
    alignItems: "flex-start",
  },
  confirmedKpiValue: {
    fontSize: 56,
    lineHeight: 60,
    fontWeight: "700",
  },
  confirmedKpiLabel: {
    fontSize: 14,
    lineHeight: 20,
    color: "#cbd5e1",
    fontWeight: "600",
  },
  confirmedKpiLabelLight: { color: "#475569" },
  confirmedCountdown: {
    fontSize: 15,
    color: "#94a3b8",
    textAlign: "center",
    marginTop: 4,
  },
  confirmedCountdownLight: { color: "#64748b" },

  // ── Registration phone reminder dialog (opaque) ───────────────────────────
  phoneReqRoot: {
    flex: 1,
    justifyContent: "center",
    alignItems: "center",
  },
  phoneReqCardWrap: {
    width: "88%",
    maxWidth: 400,
    zIndex: 1,
  },
  phoneReqCard: {
    width: "100%",
    borderRadius: 26,
    borderWidth: 1,
    overflow: "hidden",
    ...(Platform.OS === "ios"
      ? ({ borderCurve: "continuous" } as const)
      : null),
  },
  phoneReqCardDark: {
    backgroundColor: "#1a1225",
    borderColor: "#2e2040",
  },
  phoneReqCardLight: {
    backgroundColor: "#ffffff",
    borderColor: "#e2e8f0",
  },
  phoneReqInner: {
    paddingVertical: 26,
    paddingHorizontal: 22,
    alignItems: "center",
    gap: 14,
  },
  phoneReqIconCircle: {
    width: 76,
    height: 76,
    borderRadius: 38,
    borderWidth: 1,
    justifyContent: "center",
    alignItems: "center",
  },
  phoneReqIconCircleDark: {
    backgroundColor: "#2a1f3d",
    borderColor: "#3d2f55",
  },
  phoneReqIconCircleLight: {
    backgroundColor: "#f1f5f9",
    borderColor: "#cbd5e1",
  },
  phoneReqOkBtn: {
    width: "100%",
    marginTop: 4,
  },

  // ── Cash waiting overlay (opaque) ────────────────────────────────────────
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
    backgroundColor: "#1a1225",
    borderWidth: 1,
    borderColor: "#2e2040",
    ...(Platform.OS === "ios"
      ? ({ borderCurve: "continuous" } as const)
      : null),
  },
  cashOverlayCardLight: {
    backgroundColor: "#ffffff",
    borderColor: "#e2e8f0",
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
    backgroundColor: "#2d1f00",
    justifyContent: "center",
    alignItems: "center",
    marginBottom: 4,
  },
  cashOverlayIconRowLight: {
    backgroundColor: "#fff7ed",
  },
  cashOverlayTitle: {
    fontSize: 26,
    fontWeight: "800",
    color: "#fff",
    textAlign: "center",
  },
  cashOverlayTitleLight: {
    color: "#0f172a",
  },
  cashOverlayHint: {
    fontSize: 16,
    color: "#a3a3a3",
    textAlign: "center",
    lineHeight: 24,
  },
  cashOverlayHintLight: {
    color: "#475569",
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
  cashOverlayCancelLight: {
    borderColor: "#cbd5e1",
  },
  cashOverlayCancelText: {
    color: "#a3a3a3",
    fontSize: 15,
    fontWeight: "500",
    textAlign: "center",
  },
  cashOverlayCancelTextLight: {
    color: "#475569",
  },
});
