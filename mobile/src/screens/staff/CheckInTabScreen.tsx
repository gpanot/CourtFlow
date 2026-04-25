import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  ActivityIndicator,
  Image,
  Keyboard,
  KeyboardAvoidingView,
  Platform,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from "react-native";
import { CameraView, type CameraType, useCameraPermissions } from "expo-camera";
import { Ionicons } from "@expo/vector-icons";
import { api, ApiRequestError } from "../../lib/api-client";
import { useAuthStore } from "../../stores/auth-store";
import { useSocket } from "../../hooks/useSocket";
import { FaceCaptureCard } from "../../components/FaceCaptureCard";
import { useAppColors } from "../../theme/use-app-colors";
import type { AppColors } from "../../theme/palettes";
import { resolveMediaUrl } from "../../lib/media-url";
import { useTabletKioskLocale } from "../../hooks/useTabletKioskLocale";
import {
  COURTPAY_LEVEL_QR_BORDER,
  parseCourtPaySkillLevel,
  type CourtPaySkillLevelUI,
} from "../../lib/courtpay-skill-level-ui";

type Step = "form" | "awaiting_payment" | "success" | "error";
type Mode = "new" | "existing";

interface ExistingPlayerPreview {
  id: string;
  name: string;
  phone: string;
  source?: "player" | "checkInPlayer";
  skillLevel?: string | null;
  facePhotoPath?: string | null;
  avatarPhotoPath?: string | null;
}

interface PendingPaymentState {
  id: string;
  amount: number;
  qrUrl: string | null;
  paymentRef: string;
  playerName?: string | null;
  playerPhone?: string | null;
  skillLevel?: CourtPaySkillLevelUI;
  /** On-screen diagnostics for QR border / level (remove when stable). */
  _debug?: {
    rawFromApi: string | null;
    parsedLabel: string;
    borderApplied: boolean;
  };
}

type FaceQualityTier = "good" | "fair" | "poor";

interface FaceQualityCheck {
  overall: FaceQualityTier;
  checks: {
    faceDetected: boolean;
    lighting: FaceQualityTier;
    focus: FaceQualityTier;
    size: FaceQualityTier;
  };
  message: string;
  canForce: boolean;
}

export function CheckInTabScreen() {
  const venueId = useAuthStore((s) => s.venueId);
  const theme = useAppColors();
  const styles = useMemo(() => createCheckInStyles(theme), [theme]);
  const { t } = useTabletKioskLocale();

  const [mode, setMode] = useState<Mode>("new");
  const [step, setStep] = useState<Step>("form");
  const [name, setName] = useState("");
  const [phone, setPhone] = useState("");
  const [gender, setGender] = useState<"male" | "female" | null>(null);
  const [skillLevel, setSkillLevel] = useState<
    "beginner" | "intermediate" | "advanced" | null
  >(null);
  const [faceBase64, setFaceBase64] = useState<string | null>(null);
  const [faceQuality, setFaceQuality] = useState<FaceQualityCheck | null>(null);
  const [faceQualityLoading, setFaceQualityLoading] = useState(false);
  const [existingPreview, setExistingPreview] =
    useState<ExistingPlayerPreview | null>(null);
  const [pendingPayment, setPendingPayment] =
    useState<PendingPaymentState | null>(null);
  const [existingCameraPermission, requestExistingCameraPermission] = useCameraPermissions();
  const existingCameraRef = useRef<CameraView | null>(null);
  const [existingCameraFacing, setExistingCameraFacing] = useState<CameraType>("back");
  const [existingCameraReady, setExistingCameraReady] = useState(false);
  const [existingCameraStarted, setExistingCameraStarted] = useState(false);
  const [existingCaptureBusy, setExistingCaptureBusy] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  const resetForm = useCallback(() => {
    setStep("form");
    setName("");
    setPhone("");
    setGender(null);
    setSkillLevel(null);
    setFaceBase64(null);
    setFaceQuality(null);
    setFaceQualityLoading(false);
    setExistingPreview(null);
    setPendingPayment(null);
    setExistingCameraFacing("back");
    setExistingCameraReady(false);
    setExistingCameraStarted(false);
    setExistingCaptureBusy(false);
    setLoading(false);
    setError("");
  }, []);

  useSocket(venueId, {
    "payment:confirmed": (data: unknown) => {
      const d = data as { pendingPaymentId?: string };
      if (pendingPayment && d.pendingPaymentId === pendingPayment.id) {
        setStep("success");
      }
    },
    "payment:cancelled": (data: unknown) => {
      const d = data as { pendingPaymentId?: string };
      if (pendingPayment && d.pendingPaymentId === pendingPayment.id) {
        resetForm();
      }
    },
  });

  const handleLookupByPhone = async () => {
    if (!phone.trim()) return;
    setLoading(true);
    setError("");
    console.log("[CheckIn] lookup phone:", phone.trim(), "venueId:", venueId);
    try {
      const data = await api.post<{
        success: boolean;
        source: "player" | "checkInPlayer";
        player: ExistingPlayerPreview;
      }>("/api/staff/player-lookup", {
        phone: phone.trim(),
        venueId,
      });
      console.log("[CheckIn] lookup result:", JSON.stringify(data));
      setExistingPreview({ ...data.player, source: data.source });
    } catch (err) {
      console.error("[CheckIn] lookup error:", err instanceof Error ? err.message : err);
      setError(err instanceof Error ? err.message : "Could not find player");
    } finally {
      setLoading(false);
    }
  };

  const toPendingPayment = (
    data: {
      pendingPaymentId?: string;
      amount?: number;
      vietQR?: string | null;
      paymentRef?: string;
      playerName?: string | null;
      playerPhone?: string | null;
      skillLevel?: string | null;
    } | null
  ) => {
    if (!data?.pendingPaymentId) return null;
    const rawFromApi = data.skillLevel ?? null;
    const parsedLevel = parseCourtPaySkillLevel(data.skillLevel ?? undefined);
    return {
      id: data.pendingPaymentId,
      amount: data.amount ?? 0,
      qrUrl: data.vietQR ?? null,
      paymentRef: data.paymentRef ?? "",
      playerName: data.playerName ?? null,
      playerPhone: data.playerPhone ?? null,
      ...(parsedLevel ? { skillLevel: parsedLevel } : {}),
      _debug: {
        rawFromApi,
        parsedLabel: parsedLevel ?? "(parse → undefined)",
        borderApplied: !!parsedLevel,
      },
    };
  };

  useEffect(() => {
    let cancelled = false;
    if (!faceBase64) {
      setFaceQuality(null);
      setFaceQualityLoading(false);
      return;
    }
    setFaceQuality(null);
    setFaceQualityLoading(true);
    void api
      .post<{ qualityCheck?: FaceQualityCheck }>("/api/queue/analyze-face-quality", {
        imageBase64: faceBase64,
      })
      .then((response) => {
        if (cancelled) return;
        if (response.qualityCheck) {
          setFaceQuality(response.qualityCheck);
        } else {
          setFaceQuality({
            overall: "fair",
            checks: {
              faceDetected: true,
              lighting: "fair",
              focus: "fair",
              size: "fair",
            },
            message: "Photo captured. Quality assessment pending.",
            canForce: true,
          });
        }
      })
      .catch(() => {
        if (cancelled) return;
        setFaceQuality({
          overall: "fair",
          checks: {
            faceDetected: true,
            lighting: "fair",
            focus: "fair",
            size: "fair",
          },
          message: "Photo captured. Quality assessment pending.",
          canForce: true,
        });
      })
      .finally(() => {
        if (!cancelled) setFaceQualityLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [faceBase64]);

  const startExistingCamera = useCallback(async () => {
    setError("");
    if (!existingCameraPermission?.granted) {
      const permission = await requestExistingCameraPermission();
      if (!permission.granted) {
        setError("Camera permission is required for face check-in.");
        return;
      }
    }
    setExistingCameraFacing("back");
    setExistingCameraReady(false);
    setExistingCameraStarted(true);
  }, [existingCameraPermission?.granted, requestExistingCameraPermission]);

  const handleExistingCapture = useCallback(async () => {
    if (!venueId || !existingCameraRef.current || !existingCameraReady || existingCaptureBusy) {
      return;
    }
    setExistingCaptureBusy(true);
    setError("");
    try {
      const photo = await existingCameraRef.current.takePictureAsync({
        quality: 0.7,
        base64: true,
      });
      const imageBase64 = photo?.base64;
      if (!imageBase64) {
        setError(t("tryAgainGeneric"));
        return;
      }
      setError("");
      try {
        const data = await api.post<{
          resultType?: string;
          error?: string;
          player?: { id: string; name: string; phone: string };
          alreadyPaidStatus?: string;
        }>("/api/courtpay/face-checkin", { venueId, imageBase64 });

        if (data.resultType === "needs_registration") {
          setError(t("checkInFaceNotRecognized"));
          return;
        }
        if (data.resultType === "no_face" || data.resultType === "multi_face") {
          setError(t("checkInNoFaceDetected"));
          return;
        }
        if (data.resultType === "error") {
          setError(data.error ?? t("somethingWrong"));
          return;
        }
        if (data.resultType === "already_paid") {
          setStep("success");
          setExistingCameraStarted(false);
          return;
        }
        if (data.resultType === "matched" && data.player) {
          const pay = await api.post<{
            pendingPaymentId?: string;
            amount?: number;
            vietQR?: string | null;
            paymentRef?: string;
            playerName?: string | null;
            playerPhone?: string | null;
            skillLevel?: string | null;
            checkedIn?: boolean;
            free?: boolean;
          }>("/api/courtpay/pay-session", {
            venueCode: venueId,
            playerId: data.player.id,
          });
          if (pay.checkedIn || pay.free) {
            setStep("success");
            setExistingCameraStarted(false);
            return;
          }
          const payment = toPendingPayment(pay);
          if (payment) {
            setPendingPayment(payment);
            setStep("awaiting_payment");
            setExistingCameraStarted(false);
            return;
          }
          setStep("success");
          setExistingCameraStarted(false);
          return;
        }
        setError(t("checkInFaceNotRecognized"));
      } catch (err) {
        const msg =
          err instanceof ApiRequestError || err instanceof Error ? err.message : "Check-in failed";
        if (msg === "already_checked_in") {
          setStep("success");
          setExistingCameraStarted(false);
          return;
        }
        setError(msg);
      }
    } finally {
      setExistingCaptureBusy(false);
    }
  }, [existingCameraReady, existingCaptureBusy, venueId, t]);

  const stopExistingCamera = useCallback(() => {
    setExistingCameraStarted(false);
    setExistingCaptureBusy(false);
    setExistingCameraReady(false);
  }, []);

  const toggleExistingCameraFacing = useCallback(() => {
    setExistingCameraFacing((prev) => (prev === "back" ? "front" : "back"));
  }, []);

  const qualityTone = useMemo(() => {
    if (!faceQuality) return "neutral";
    if (faceQuality.overall === "good") return "good";
    if (faceQuality.overall === "poor") return "poor";
    return "fair";
  }, [faceQuality]);

  const canSubmitNewPlayer = useMemo(
    () =>
      !loading &&
      !!faceBase64 &&
      !faceQualityLoading &&
      !!name.trim() &&
      !!phone.trim() &&
      !!gender &&
      !!skillLevel &&
      (faceQuality ? faceQuality.checks.faceDetected : true),
    [faceBase64, faceQuality, faceQualityLoading, gender, loading, name, phone, skillLevel]
  );
  const existingScannerHint = existingCameraStarted
    ? t("checkInCaptureHintActive")
    : t("checkInCaptureHintIdle");

  const handleExistingPhoneCheckIn = async () => {
    if (!existingPreview || !venueId) return;
    setLoading(true);
    setError("");
    try {
      let checkInPlayerId = existingPreview.id;
      if (existingPreview.source === "player") {
        const bridged = await api.post<{
          checkInPlayer: { id: string; name: string; phone: string };
        }>("/api/courtpay/staff/ensure-check-in-player", {
          venueId,
          playerId: existingPreview.id,
        });
        checkInPlayerId = bridged.checkInPlayer.id;
        setExistingPreview({
          id: bridged.checkInPlayer.id,
          name: bridged.checkInPlayer.name,
          phone: bridged.checkInPlayer.phone,
          source: "checkInPlayer",
          skillLevel: existingPreview.skillLevel ?? null,
        });
      }

      const data = await api.post<{
        pendingPaymentId?: string;
        amount?: number;
        vietQR?: string | null;
        paymentRef?: string;
        playerName?: string | null;
        playerPhone?: string | null;
        skillLevel?: string | null;
        checkedIn?: boolean;
        free?: boolean;
      }>("/api/courtpay/pay-session", {
        venueCode: venueId,
        playerId: checkInPlayerId,
      });

      if (data.checkedIn || data.free) {
        setStep("success");
        return;
      }
      const payment = toPendingPayment(data);
      if (payment) {
        setPendingPayment(payment);
        setStep("awaiting_payment");
      } else {
        setStep("success");
      }
    } catch (err) {
      const msg =
        err instanceof ApiRequestError || err instanceof Error ? err.message : "Check-in failed";
      if (msg === "already_checked_in") {
        setStep("success");
        return;
      }
      setError(msg);
      setStep("error");
    } finally {
      setLoading(false);
    }
  };

  const handleNewRegistration = async () => {
    if (
      !venueId ||
      !name.trim() ||
      !phone.trim() ||
      !gender ||
      !skillLevel ||
      !faceBase64
    )
      return;
    setLoading(true);
    setError("");
    try {
      const data = await api.post<{
        pendingPaymentId?: string;
        amount?: number;
        vietQR?: string | null;
        paymentRef?: string;
        playerName?: string | null;
        playerPhone?: string | null;
        skillLevel?: string | null;
        checkedIn?: boolean;
        free?: boolean;
      }>("/api/courtpay/register", {
        venueCode: venueId,
        imageBase64: faceBase64,
        name: name.trim(),
        phone: phone.trim(),
        gender,
        skillLevel,
      });
      if (data.checkedIn || data.free) {
        setStep("success");
        return;
      }
      const payment = toPendingPayment(data);
      if (payment) {
        setPendingPayment(payment);
        setStep("awaiting_payment");
      } else {
        setStep("success");
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "Registration failed");
      setStep("error");
    } finally {
      setLoading(false);
    }
  };

  const handleCashPayment = async () => {
    if (!pendingPayment) return;
    setLoading(true);
    try {
      await api.post("/api/courtpay/cash-payment", {
        pendingPaymentId: pendingPayment.id,
      });
      setStep("success");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Cash payment failed");
      setStep("error");
    } finally {
      setLoading(false);
    }
  };

  const renderForm = () => (
    <View style={styles.section}>
      <View style={styles.modeSwitch}>
        <TouchableOpacity
          style={[styles.modeBtn, mode === "new" && styles.modeBtnActive]}
          onPress={() => {
            setMode("new");
            stopExistingCamera();
            setError("");
            setExistingPreview(null);
          }}
          activeOpacity={0.7}
        >
          <Text
            style={[
              styles.modeBtnText,
              mode === "new" && styles.modeBtnTextActive,
            ]}
          >
            {t("checkInNewPlayer")}
          </Text>
        </TouchableOpacity>
        <TouchableOpacity
          style={[styles.modeBtn, mode === "existing" && styles.modeBtnActive]}
          onPress={() => {
            setMode("existing");
            setError("");
            setExistingPreview(null);
            stopExistingCamera();
          }}
          activeOpacity={0.7}
        >
          <Text
            style={[
              styles.modeBtnText,
              mode === "existing" && styles.modeBtnTextActive,
            ]}
          >
            {t("checkInExistingPlayer")}
          </Text>
        </TouchableOpacity>
      </View>

      {mode === "existing" ? (
        <>
          <View style={styles.autoScanCard}>
            <Text style={styles.autoScanTitle}>{t("checkInFaceCheckIn")}</Text>
            <Text style={styles.autoScanHint}>{existingScannerHint}</Text>
            {!existingCameraStarted ? (
              <TouchableOpacity
                style={styles.primaryBtn}
                onPress={() => void startExistingCamera()}
                activeOpacity={0.7}
              >
                <Text style={styles.primaryBtnText}>{t("checkInStartCamera")}</Text>
              </TouchableOpacity>
            ) : (
              <View style={styles.autoScannerWrap}>
                <CameraView
                  ref={existingCameraRef}
                  style={styles.existingCameraPreview}
                  facing={existingCameraFacing}
                  onCameraReady={() => setExistingCameraReady(true)}
                />
                <View style={styles.existingCameraActions}>
                  <TouchableOpacity
                    style={styles.existingIconBtn}
                    onPress={toggleExistingCameraFacing}
                    disabled={existingCaptureBusy}
                    activeOpacity={0.7}
                  >
                    <Ionicons name="camera-reverse-outline" size={20} color="#fff" />
                  </TouchableOpacity>
                  <TouchableOpacity
                    style={[
                      styles.primaryBtn,
                      styles.existingCaptureBtn,
                      (!existingCameraReady || existingCaptureBusy) && styles.disabledBtn,
                    ]}
                    onPress={() => void handleExistingCapture()}
                    disabled={!existingCameraReady || existingCaptureBusy}
                    activeOpacity={0.7}
                  >
                    {existingCaptureBusy ? (
                      <ActivityIndicator color="#fff" />
                    ) : (
                      <>
                        <Ionicons name="camera-outline" size={18} color="#fff" />
                        <Text style={styles.primaryBtnText}>{t("checkInCapture")}</Text>
                      </>
                    )}
                  </TouchableOpacity>
                  <TouchableOpacity
                    style={styles.existingIconBtn}
                    onPress={stopExistingCamera}
                    disabled={existingCaptureBusy}
                    activeOpacity={0.7}
                  >
                    <Ionicons name="close" size={20} color="#fff" />
                  </TouchableOpacity>
                </View>
              </View>
            )}
          </View>

          <View style={styles.divider}>
            <View style={styles.dividerLine} />
            <Text style={styles.dividerText}>{t("checkInOrPhoneFallback")}</Text>
            <View style={styles.dividerLine} />
          </View>

          <TextInput
            style={styles.inputFull}
            placeholder={t("phonePlaceholder")}
            placeholderTextColor={theme.dimmed}
            value={phone}
            onChangeText={setPhone}
            keyboardType="phone-pad"
          />
          <TouchableOpacity
            style={[styles.outlineBtn, loading && styles.disabledBtn]}
            onPress={handleLookupByPhone}
            disabled={loading || !phone.trim()}
            activeOpacity={0.7}
          >
            <Ionicons name="search" size={16} color={theme.blue500} />
            <Text style={styles.outlineBtnText}>{t("checkInLookupByPhone")}</Text>
          </TouchableOpacity>
          {existingPreview ? (() => {
            const photoUri = resolveMediaUrl(
              existingPreview.avatarPhotoPath ?? existingPreview.facePhotoPath ?? null
            );
            return (
              <View style={styles.playerCard}>
                {photoUri ? (
                  <Image
                    source={{ uri: photoUri }}
                    style={styles.playerAvatar}
                    resizeMode="cover"
                  />
                ) : (
                  <View style={styles.playerAvatarFallback}>
                    <Ionicons name="person" size={22} color={theme.muted} />
                  </View>
                )}
                <View style={styles.playerInfo}>
                  <Text style={styles.playerName}>{existingPreview.name}</Text>
                  <Text style={styles.playerPhone}>{existingPreview.phone}</Text>
                  <Text style={styles.playerSourceBadge}>CourtPay</Text>
                </View>
                <TouchableOpacity
                  style={[styles.inlineCheckBtn, loading && styles.disabledBtn]}
                  onPress={handleExistingPhoneCheckIn}
                  disabled={loading}
                  activeOpacity={0.7}
                >
                  {loading ? (
                    <ActivityIndicator color="#fff" size="small" />
                  ) : (
                    <Text style={styles.inlineCheckBtnText}>{t("checkIn")}</Text>
                  )}
                </TouchableOpacity>
              </View>
            );
          })() : null}
        </>
      ) : (
        <>
          <FaceCaptureCard
            title={t("checkInRegisterNewFace")}
            hint={t("checkInRegisterFaceHint")}
            capturedBase64={faceBase64}
            onChange={setFaceBase64}
          />
          {faceBase64 ? (
            <View
              style={[
                styles.qualityCard,
                qualityTone === "good" && styles.qualityCardGood,
                qualityTone === "fair" && styles.qualityCardFair,
                qualityTone === "poor" && styles.qualityCardPoor,
              ]}
            >
                <Text style={styles.qualityTitle}>{t("checkInPhotoQuality")}</Text>
              {faceQualityLoading ? (
                <View style={styles.qualityLoadingRow}>
                  <ActivityIndicator color={theme.blue500} size="small" />
                  <Text style={styles.qualityText}>{t("checkInAnalyzingPhoto")}</Text>
                </View>
              ) : faceQuality ? (
                <>
                  <View style={styles.qualityRow}>
                    <Text style={styles.qualityIcon}>
                      {faceQuality.checks.faceDetected ? "✓" : "✕"}
                    </Text>
                    <Text style={styles.qualityText}>
                      {t("checkInFaceDetected")}: {faceQuality.checks.faceDetected ? "Yes" : "No"}
                    </Text>
                  </View>
                  <View style={styles.qualityRow}>
                    <Text style={styles.qualityIcon}>
                      {faceQuality.checks.size === "good" ? "✓" : faceQuality.checks.size === "fair" ? "!" : "✕"}
                    </Text>
                    <Text style={styles.qualityText}>
                      {t("checkInFaceSize")}: {faceQuality.checks.size}
                    </Text>
                  </View>
                  <View style={styles.qualityRow}>
                    <Text style={styles.qualityIcon}>
                      {faceQuality.checks.lighting === "good"
                        ? "✓"
                        : faceQuality.checks.lighting === "fair"
                          ? "!"
                          : "✕"}
                    </Text>
                    <Text style={styles.qualityText}>
                      {t("checkInLighting")}: {faceQuality.checks.lighting}
                    </Text>
                  </View>
                  <View style={styles.qualityRow}>
                    <Text style={styles.qualityIcon}>
                      {faceQuality.checks.focus === "good" ? "✓" : faceQuality.checks.focus === "fair" ? "!" : "✕"}
                    </Text>
                    <Text style={styles.qualityText}>
                      {t("checkInFocus")}: {faceQuality.checks.focus}
                    </Text>
                  </View>
                  <Text style={styles.qualityMessage}>{faceQuality.message}</Text>
                </>
              ) : null}
            </View>
          ) : null}
          <TextInput
            style={styles.inputFull}
            placeholder={t("checkInPlayerName")}
            placeholderTextColor={theme.dimmed}
            value={name}
            onChangeText={setName}
          />
          <TextInput
            style={styles.inputFull}
            placeholder={t("phonePlaceholder")}
            placeholderTextColor={theme.dimmed}
            value={phone}
            onChangeText={setPhone}
            keyboardType="phone-pad"
          />
          <View style={styles.row}>
            <TouchableOpacity
              style={[
                styles.choiceBtn,
                gender === "male" && styles.choiceBtnActive,
              ]}
              onPress={() => {
                Keyboard.dismiss();
                setGender("male");
              }}
              activeOpacity={0.7}
            >
              <Text style={styles.choiceBtnText}>{t("regMale")}</Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={[
                styles.choiceBtn,
                gender === "female" && styles.choiceBtnActive,
              ]}
              onPress={() => {
                Keyboard.dismiss();
                setGender("female");
              }}
              activeOpacity={0.7}
            >
              <Text style={styles.choiceBtnText}>{t("regFemale")}</Text>
            </TouchableOpacity>
          </View>
          <View style={styles.row}>
            {(["beginner", "intermediate", "advanced"] as const).map((lvl) => (
              <TouchableOpacity
                key={lvl}
                style={[
                  styles.choiceBtn,
                  skillLevel === lvl && styles.choiceBtnActive,
                ]}
                onPress={() => {
                  Keyboard.dismiss();
                  setSkillLevel(lvl);
                }}
                activeOpacity={0.7}
              >
                <Text style={styles.choiceBtnText}>
                  {lvl === "beginner" ? t("regBeginner") : lvl === "intermediate" ? t("regIntermediate") : t("regAdvanced")}
                </Text>
              </TouchableOpacity>
            ))}
          </View>
          <TouchableOpacity
            style={[
              styles.primaryBtn,
              !canSubmitNewPlayer && styles.disabledBtn,
            ]}
            onPress={handleNewRegistration}
            disabled={!canSubmitNewPlayer}
            activeOpacity={0.7}
          >
            {loading ? (
              <ActivityIndicator color="#fff" />
            ) : (
              <Text style={styles.primaryBtnText}>{t("checkInRegisterBtn")}</Text>
            )}
          </TouchableOpacity>
        </>
      )}

      {error ? <Text style={styles.errorText}>{error}</Text> : null}
    </View>
  );

  const renderAwaitingPayment = () => {
    const payerName =
      pendingPayment?.playerName?.trim() ||
      existingPreview?.name?.trim() ||
      name.trim() ||
      "";
    const payerPhone =
      pendingPayment?.playerPhone?.trim() ||
      existingPreview?.phone?.trim() ||
      phone.trim() ||
      "";
    const showPayer = Boolean(payerName || payerPhone);

    return (
    <View style={styles.paymentSection}>
      <Text style={styles.paymentTitle}>{t("checkInAwaitingPayment")}</Text>
      {showPayer ? (
        <View style={styles.paymentPayerBlock}>
          {payerName ? (
            <Text style={styles.paymentPayerName}>{payerName}</Text>
          ) : null}
          {payerPhone ? (
            <Text style={styles.paymentPayerPhone}>{payerPhone}</Text>
          ) : null}
        </View>
      ) : null}
      {pendingPayment?.qrUrl ? (
        <View
          style={[
            styles.qrContainer,
            pendingPayment.skillLevel
              ? COURTPAY_LEVEL_QR_BORDER[pendingPayment.skillLevel]
              : null,
          ]}
        >
          <Image
            source={{ uri: pendingPayment.qrUrl }}
            style={styles.qrImage}
            resizeMode="contain"
          />
        </View>
      ) : null}
      <Text style={styles.paymentAmount}>
        {pendingPayment?.amount?.toLocaleString()} VND
      </Text>
      <Text style={styles.paymentRef}>
        Ref: {pendingPayment?.paymentRef}
      </Text>
      {pendingPayment?._debug ? (
        <View style={styles.payDebugBox}>
          <Text style={styles.payDebugTitle}>Debug — QR border / level</Text>
          <Text style={styles.payDebugLine}>
            api skillLevel: {JSON.stringify(pendingPayment._debug.rawFromApi)}
          </Text>
          <Text style={styles.payDebugLine}>
            parsed: {pendingPayment._debug.parsedLabel}
          </Text>
          <Text style={styles.payDebugLine}>
            border applied: {String(pendingPayment._debug.borderApplied)}
          </Text>
        </View>
      ) : null}
      <TouchableOpacity
        style={styles.cashBtn}
        onPress={handleCashPayment}
        disabled={loading}
        activeOpacity={0.7}
      >
        {loading ? (
          <ActivityIndicator color="#fff" />
        ) : (
          <Text style={styles.cashBtnText}>{t("checkInConfirmCash")}</Text>
        )}
      </TouchableOpacity>
      <TouchableOpacity style={styles.cancelLink} onPress={resetForm}>
        <Text style={styles.cancelLinkText}>{t("cancel")}</Text>
      </TouchableOpacity>
    </View>
    );
  };

  const renderSuccess = () => (
    <View style={styles.resultSection}>
      <View style={styles.successCircle}>
        <Ionicons name="checkmark" size={44} color={theme.green500} />
      </View>
      <Text style={styles.resultTitle}>{t("checkInComplete")}</Text>
      <TouchableOpacity
        style={styles.primaryBtn}
        onPress={resetForm}
        activeOpacity={0.7}
      >
        <Text style={styles.primaryBtnText}>{t("checkInNextCheckIn")}</Text>
      </TouchableOpacity>
    </View>
  );

  const renderError = () => (
    <View style={styles.resultSection}>
      <View style={styles.errorCircle}>
        <Ionicons name="warning-outline" size={40} color={theme.red500} />
      </View>
      <Text style={styles.resultTitle}>{t("checkInSomethingWrong")}</Text>
      <Text style={styles.errorText}>{error}</Text>
      <TouchableOpacity
        style={styles.primaryBtn}
        onPress={resetForm}
        activeOpacity={0.7}
      >
        <Text style={styles.primaryBtnText}>{t("checkInStartOver")}</Text>
      </TouchableOpacity>
    </View>
  );

  return (
    <KeyboardAvoidingView
      style={{ flex: 1 }}
      behavior={Platform.OS === "ios" ? "padding" : undefined}
      keyboardVerticalOffset={Platform.OS === "ios" ? 96 : 0}
    >
      <ScrollView
        style={styles.container}
        contentContainerStyle={[
          styles.scrollContent,
          Platform.OS === "android" && styles.scrollContentAndroidKb,
        ]}
        keyboardShouldPersistTaps="handled"
      >
        {step === "form" ? renderForm() : null}
        {step === "awaiting_payment" ? renderAwaitingPayment() : null}
        {step === "success" ? renderSuccess() : null}
        {step === "error" ? renderError() : null}
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

function createCheckInStyles(t: AppColors) {
  return StyleSheet.create({
    container: { flex: 1, backgroundColor: t.bg },
    scrollContent: { padding: 16, paddingBottom: 120 },
    /** Extra space so bottom actions stay above keyboard + Android suggestion strip. */
    scrollContentAndroidKb: { paddingBottom: 300 },
    section: { gap: 12 },
    modeSwitch: { flexDirection: "row", borderRadius: 10, borderWidth: 1, borderColor: t.border, overflow: "hidden" },
    modeBtn: { flex: 1, height: 42, alignItems: "center", justifyContent: "center", backgroundColor: t.card },
    modeBtnActive: { backgroundColor: t.blue600 },
    modeBtnText: { color: t.muted, fontWeight: "600", fontSize: 14 },
    modeBtnTextActive: { color: "#fff" },
    inputFull: { backgroundColor: t.card, borderRadius: 10, paddingHorizontal: 14, height: 44, color: t.text, fontSize: 15, borderWidth: 1, borderColor: t.border },
    row: { flexDirection: "row", gap: 8 },
    choiceBtn: { flex: 1, height: 38, borderRadius: 8, borderWidth: 1, borderColor: t.border, backgroundColor: t.card, alignItems: "center", justifyContent: "center" },
    choiceBtnActive: { borderColor: t.blue500, backgroundColor: "rgba(37,99,235,0.15)" },
    choiceBtnText: { color: t.textSecondary, fontSize: 13, fontWeight: "600" },
    divider: { flexDirection: "row", alignItems: "center", gap: 10 },
    dividerLine: { flex: 1, height: 1, backgroundColor: t.border },
    dividerText: { color: t.subtle, fontSize: 12 },
    qualityCard: { borderRadius: 10, borderWidth: 1, borderColor: t.border, backgroundColor: t.card, paddingHorizontal: 10, paddingVertical: 9, gap: 5 },
    qualityTitle: { color: t.textSecondary, fontSize: 11, fontWeight: "700", textTransform: "uppercase", letterSpacing: 0.4 },
    qualityRow: { flexDirection: "row", alignItems: "flex-start", gap: 6 },
    qualityIcon: { color: t.green500, fontSize: 11, fontWeight: "800", marginTop: 1 },
    qualityText: { flex: 1, color: t.muted, fontSize: 11, lineHeight: 14 },
    qualityMessage: { color: t.text, fontSize: 12, lineHeight: 16, marginTop: 2 },
    qualityLoadingRow: { flexDirection: "row", alignItems: "center", gap: 8 },
    qualityCardGood: { borderColor: t.green500 },
    qualityCardFair: { borderColor: t.amber400 },
    qualityCardPoor: { borderColor: t.red500 },
    autoScanCard: { gap: 8, padding: 12, backgroundColor: t.card, borderRadius: 12, borderWidth: 1, borderColor: t.border },
    autoScanTitle: { color: t.text, fontSize: 15, fontWeight: "700" },
    autoScanHint: { color: t.muted, fontSize: 12 },
    autoScannerWrap: { marginTop: 4, borderRadius: 12, overflow: "hidden", borderWidth: 1, borderColor: t.border, backgroundColor: t.bg, gap: 10, paddingBottom: 10 },
    existingCameraPreview: { width: "100%", height: 360, backgroundColor: "#000" },
    existingCameraActions: { flexDirection: "row", alignItems: "center", gap: 10, paddingHorizontal: 10 },
    existingCaptureBtn: { flex: 1 },
    existingIconBtn: { width: 42, height: 42, borderRadius: 21, alignItems: "center", justifyContent: "center", backgroundColor: "#262626" },
    primaryBtn: { alignItems: "center", justifyContent: "center", backgroundColor: t.blue600, height: 44, borderRadius: 10 },
    primaryBtnText: { color: "#fff", fontSize: 15, fontWeight: "700" },
    disabledBtn: { opacity: 0.5 },
    outlineBtn: { flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 8, borderRadius: 10, borderWidth: 1, borderColor: t.blue500, height: 42 },
    outlineBtnText: { color: t.blue500, fontSize: 14, fontWeight: "600" },
    playerCard: { flexDirection: "row", alignItems: "center", gap: 10, backgroundColor: t.card, borderRadius: 12, padding: 12, borderWidth: 1, borderColor: t.border },
    playerAvatar: { width: 48, height: 48, borderRadius: 24, backgroundColor: t.bg },
    playerAvatarFallback: { width: 48, height: 48, borderRadius: 24, backgroundColor: t.inputBg, borderWidth: 1, borderColor: t.border, alignItems: "center", justifyContent: "center" },
    playerInfo: { flex: 1 },
    playerName: { fontSize: 15, fontWeight: "600", color: t.text },
    playerPhone: { fontSize: 13, color: t.muted, marginTop: 2 },
    playerSourceBadge: { fontSize: 11, fontWeight: "700", color: t.fuchsia300, marginTop: 2 },
    inlineCheckBtn: { borderRadius: 8, backgroundColor: t.blue600, paddingHorizontal: 12, height: 36, alignItems: "center", justifyContent: "center", minWidth: 78 },
    inlineCheckBtnText: { color: "#fff", fontWeight: "700", fontSize: 13 },
    paymentSection: { alignItems: "center", gap: 12 },
    paymentTitle: { fontSize: 20, fontWeight: "700", color: t.text },
    paymentPayerBlock: { alignItems: "center", gap: 4, width: "100%" },
    paymentPayerName: { fontSize: 17, fontWeight: "700", color: t.text, textAlign: "center" },
    paymentPayerPhone: { fontSize: 15, fontWeight: "500", color: t.muted, textAlign: "center" },
    qrContainer: { alignItems: "center", backgroundColor: "#fff", borderRadius: 14, padding: 14 },
    qrImage: { width: 200, height: 200 },
    paymentAmount: { fontSize: 22, fontWeight: "700", color: t.text, textAlign: "center" },
    paymentRef: { fontSize: 13, color: t.subtle, textAlign: "center" },
    payDebugBox: {
      alignSelf: "stretch",
      marginTop: 8,
      padding: 12,
      borderRadius: 12,
      borderWidth: 1,
      borderColor: "rgba(251,191,36,0.55)",
      backgroundColor: t.card,
      gap: 4,
    },
    payDebugTitle: {
      fontSize: 12,
      fontWeight: "800",
      color: t.amber400,
    },
    payDebugLine: {
      fontSize: 11,
      color: t.muted,
    },
    cashBtn: { alignItems: "center", justifyContent: "center", backgroundColor: t.amber400, height: 44, borderRadius: 10, width: "100%" },
    cashBtnText: { color: t.bg, fontSize: 15, fontWeight: "700" },
    cancelLink: { padding: 10 },
    cancelLinkText: { color: t.muted, fontSize: 14 },
    resultSection: { alignItems: "center", paddingTop: 50, gap: 14 },
    successCircle: { width: 88, height: 88, borderRadius: 44, backgroundColor: "rgba(34,197,94,0.13)", justifyContent: "center", alignItems: "center" },
    errorCircle: { width: 88, height: 88, borderRadius: 44, backgroundColor: "rgba(220,38,38,0.13)", justifyContent: "center", alignItems: "center" },
    resultTitle: { fontSize: 22, fontWeight: "700", color: t.text, textAlign: "center" },
    errorText: { color: t.red400, textAlign: "center", fontSize: 13 },
  });
}
