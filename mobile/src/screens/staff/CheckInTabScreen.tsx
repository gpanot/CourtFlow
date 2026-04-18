import React, { useCallback, useMemo, useState } from "react";
import {
  ActivityIndicator,
  Image,
  KeyboardAvoidingView,
  Platform,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { api } from "../../lib/api-client";
import { useAuthStore } from "../../stores/auth-store";
import { useSocket } from "../../hooks/useSocket";
import { FaceCaptureCard } from "../../components/FaceCaptureCard";
import {
  SelfCheckInReturningFaceScanner,
  type ReturningFrameResult,
} from "../../components/SelfCheckInReturningFaceScanner";
import { useAppColors } from "../../theme/use-app-colors";
import type { AppColors } from "../../theme/palettes";

type Step = "form" | "awaiting_payment" | "success" | "error";
type Mode = "new" | "existing";

interface ExistingPlayerPreview {
  id: string;
  name: string;
  phone: string;
  source?: "player" | "checkInPlayer";
}

interface PendingPaymentState {
  id: string;
  amount: number;
  qrUrl: string | null;
  paymentRef: string;
}

export function CheckInTabScreen() {
  const venueId = useAuthStore((s) => s.venueId);
  const theme = useAppColors();
  const styles = useMemo(() => createCheckInStyles(theme), [theme]);

  const [mode, setMode] = useState<Mode>("new");
  const [step, setStep] = useState<Step>("form");
  const [name, setName] = useState("");
  const [phone, setPhone] = useState("");
  const [gender, setGender] = useState<"male" | "female" | null>(null);
  const [skillLevel, setSkillLevel] = useState<
    "beginner" | "intermediate" | "advanced" | null
  >(null);
  const [faceBase64, setFaceBase64] = useState<string | null>(null);
  const [existingPreview, setExistingPreview] =
    useState<ExistingPlayerPreview | null>(null);
  const [pendingPayment, setPendingPayment] =
    useState<PendingPaymentState | null>(null);
  const [existingCameraStarted, setExistingCameraStarted] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  const resetForm = useCallback(() => {
    setStep("form");
    setName("");
    setPhone("");
    setGender(null);
    setSkillLevel(null);
    setFaceBase64(null);
    setExistingPreview(null);
    setPendingPayment(null);
    setExistingCameraStarted(false);
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
    } | null
  ) => {
    if (!data?.pendingPaymentId) return null;
    return {
      id: data.pendingPaymentId,
      amount: data.amount ?? 0,
      qrUrl: data.vietQR ?? null,
      paymentRef: data.paymentRef ?? "",
    };
  };

  const submitExistingFrame = useCallback(
    async (imageBase64: string): Promise<ReturningFrameResult> => {
      if (!venueId) return "done";
      setError("");
      try {
        const data = await api.post<{
          resultType?: string;
          error?: string;
          pendingPaymentId?: string;
          amount?: number;
          vietQR?: string | null;
          paymentRef?: string;
        }>("/api/kiosk/checkin-payment", {
          venueId,
          imageBase64,
        });
        const payment = toPendingPayment(data);
        if (payment) {
          setPendingPayment(payment);
          setStep("awaiting_payment");
          return "done";
        }
        if (data.resultType === "already_checked_in") {
          setStep("success");
          return "done";
        }
        if (data.resultType === "needs_registration") {
          setError("Face not recognized. Use New Player flow.");
          setExistingCameraStarted(false);
          return "done";
        }
        if (data.resultType === "no_face" || data.resultType === "multi_face") {
          return "continue_scan";
        }
        if (data.error) {
          setError(data.error);
          setExistingCameraStarted(false);
          return "done";
        }
        setStep("success");
        return "done";
      } catch (err) {
        setError(err instanceof Error ? err.message : "Check-in failed");
        setExistingCameraStarted(false);
        return "done";
      }
    },
    [venueId]
  );

  const existingScannerHint = useMemo(
    () =>
      existingCameraStarted
        ? "Align face in frame — check-in runs automatically."
        : "Tap Start Camera. Face will be detected and checked in automatically.",
    [existingCameraStarted]
  );

  const handleExistingPhoneCheckIn = async () => {
    if (!existingPreview || !venueId) return;
    setLoading(true);
    setError("");
    try {
      // CourtPay players (CheckInPlayer) use the courtpay pay-session endpoint.
      // Self check-in players (Player) use the kiosk checkin-payment endpoint.
      const isCourtPay = existingPreview.source === "checkInPlayer";
      const data = await api.post<{
        pendingPaymentId?: string;
        amount?: number;
        vietQR?: string | null;
        paymentRef?: string;
      }>(
        isCourtPay ? "/api/courtpay/pay-session" : "/api/kiosk/checkin-payment",
        isCourtPay
          ? { playerId: existingPreview.id, venueCode: venueId }
          : { venueId, playerId: existingPreview.id }
      );
      const payment = toPendingPayment(data);
      if (payment) {
        setPendingPayment(payment);
        setStep("awaiting_payment");
      } else {
        setStep("success");
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "Check-in failed");
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
      }>("/api/kiosk/register", {
        venueId,
        imageBase64: faceBase64,
        name: name.trim(),
        phone: phone.trim(),
        gender,
        skillLevel,
      });
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
      await api.post("/api/kiosk/cash-payment", {
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
            setExistingCameraStarted(false);
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
            New Player
          </Text>
        </TouchableOpacity>
        <TouchableOpacity
          style={[styles.modeBtn, mode === "existing" && styles.modeBtnActive]}
          onPress={() => {
            setMode("existing");
            setError("");
            setExistingPreview(null);
            setExistingCameraStarted(false);
          }}
          activeOpacity={0.7}
        >
          <Text
            style={[
              styles.modeBtnText,
              mode === "existing" && styles.modeBtnTextActive,
            ]}
          >
            Existing Player
          </Text>
        </TouchableOpacity>
      </View>

      {mode === "existing" ? (
        <>
          <View style={styles.autoScanCard}>
            <Text style={styles.autoScanTitle}>Face Check-in</Text>
            <Text style={styles.autoScanHint}>{existingScannerHint}</Text>
            {!existingCameraStarted ? (
              <TouchableOpacity
                style={styles.primaryBtn}
                onPress={() => {
                  setError("");
                  setExistingCameraStarted(true);
                }}
                activeOpacity={0.7}
              >
                <Text style={styles.primaryBtnText}>Start Camera</Text>
              </TouchableOpacity>
            ) : (
              <View style={styles.autoScannerWrap}>
                <SelfCheckInReturningFaceScanner
                  venueId={venueId}
                  active
                  copy={{
                    noMatchYet: "No match yet — retrying...",
                    positionFace: "Position your face in the frame",
                    holdStill: "Hold still...",
                    nextScanIn: "Next scan in",
                    scanning: "Scanning...",
                    retryAuto: "Will retry automatically",
                    cameraReady: "Camera ready",
                    cameraStarting: "Starting camera...",
                    checkInWithPhone: "Use phone number instead",
                    back: "Stop camera",
                    allowCameraTitle: "Camera access",
                    allowCameraHint:
                      "Allow the camera for automatic face check-in.",
                    allowCameraCta: "Allow Camera",
                  }}
                  onSubmitFrame={submitExistingFrame}
                  onExhaustedRetries={() => {
                    setError("No face detected. Try again or use phone fallback.");
                    setExistingCameraStarted(false);
                  }}
                  onCameraNotReady={() => {
                    setError("Camera not ready — try again.");
                    setExistingCameraStarted(false);
                  }}
                  onUsePhone={() => setExistingCameraStarted(false)}
                  onBack={() => setExistingCameraStarted(false)}
                />
              </View>
            )}
          </View>

          <View style={styles.divider}>
            <View style={styles.dividerLine} />
            <Text style={styles.dividerText}>or phone fallback</Text>
            <View style={styles.dividerLine} />
          </View>

          <TextInput
            style={styles.inputFull}
            placeholder="Phone number"
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
            <Text style={styles.outlineBtnText}>Lookup by phone</Text>
          </TouchableOpacity>
          {existingPreview ? (
            <View style={styles.playerCard}>
              <Ionicons name="person-circle" size={36} color={theme.blue500} />
              <View style={styles.playerInfo}>
                <Text style={styles.playerName}>{existingPreview.name}</Text>
                <Text style={styles.playerPhone}>{existingPreview.phone}</Text>
              </View>
              <TouchableOpacity
                style={styles.inlineCheckBtn}
                onPress={handleExistingPhoneCheckIn}
                activeOpacity={0.7}
              >
                <Text style={styles.inlineCheckBtnText}>Check In</Text>
              </TouchableOpacity>
            </View>
          ) : null}
        </>
      ) : (
        <>
          <FaceCaptureCard
            title="Register New Player Face"
            hint="Required for first registration."
            capturedBase64={faceBase64}
            onChange={setFaceBase64}
          />
          {faceBase64 ? (
            <View style={styles.qualityCard}>
              <Text style={styles.qualityTitle}>Photo quality (AWS Rekognition)</Text>
              <View style={styles.qualityRow}>
                <Text style={styles.qualityIcon}>✓</Text>
                <Text style={styles.qualityText}>Face centered and fills most of the frame</Text>
              </View>
              <View style={styles.qualityRow}>
                <Text style={styles.qualityIcon}>✓</Text>
                <Text style={styles.qualityText}>Bright, even lighting (no strong backlight)</Text>
              </View>
              <View style={styles.qualityRow}>
                <Text style={styles.qualityIcon}>✓</Text>
                <Text style={styles.qualityText}>Sharp focus, neutral expression, no heavy occlusion</Text>
              </View>
            </View>
          ) : null}
          <TextInput
            style={styles.inputFull}
            placeholder="Player name"
            placeholderTextColor={theme.dimmed}
            value={name}
            onChangeText={setName}
          />
          <TextInput
            style={styles.inputFull}
            placeholder="Phone number"
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
              onPress={() => setGender("male")}
              activeOpacity={0.7}
            >
              <Text style={styles.choiceBtnText}>Male</Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={[
                styles.choiceBtn,
                gender === "female" && styles.choiceBtnActive,
              ]}
              onPress={() => setGender("female")}
              activeOpacity={0.7}
            >
              <Text style={styles.choiceBtnText}>Female</Text>
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
                onPress={() => setSkillLevel(lvl)}
                activeOpacity={0.7}
              >
                <Text style={styles.choiceBtnText}>
                  {lvl.charAt(0).toUpperCase() + lvl.slice(1)}
                </Text>
              </TouchableOpacity>
            ))}
          </View>
          <TouchableOpacity
            style={[
              styles.primaryBtn,
              (loading ||
                !faceBase64 ||
                !name.trim() ||
                !phone.trim() ||
                !gender ||
                !skillLevel) &&
                styles.disabledBtn,
            ]}
            onPress={handleNewRegistration}
            disabled={
              loading ||
              !faceBase64 ||
              !name.trim() ||
              !phone.trim() ||
              !gender ||
              !skillLevel
            }
            activeOpacity={0.7}
          >
            {loading ? (
              <ActivityIndicator color="#fff" />
            ) : (
              <Text style={styles.primaryBtnText}>Register & Check-in</Text>
            )}
          </TouchableOpacity>
        </>
      )}

      {error ? <Text style={styles.errorText}>{error}</Text> : null}
    </View>
  );

  const renderAwaitingPayment = () => (
    <View style={styles.paymentSection}>
      <Text style={styles.paymentTitle}>Awaiting Payment</Text>
      {pendingPayment?.qrUrl ? (
        <View style={styles.qrContainer}>
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
      <TouchableOpacity
        style={styles.cashBtn}
        onPress={handleCashPayment}
        disabled={loading}
        activeOpacity={0.7}
      >
        {loading ? (
          <ActivityIndicator color="#fff" />
        ) : (
          <Text style={styles.cashBtnText}>Confirm Cash Payment</Text>
        )}
      </TouchableOpacity>
      <TouchableOpacity style={styles.cancelLink} onPress={resetForm}>
        <Text style={styles.cancelLinkText}>Cancel</Text>
      </TouchableOpacity>
    </View>
  );

  const renderSuccess = () => (
    <View style={styles.resultSection}>
      <View style={styles.successCircle}>
        <Ionicons name="checkmark" size={44} color={theme.green500} />
      </View>
      <Text style={styles.resultTitle}>Check-in Complete</Text>
      <TouchableOpacity
        style={styles.primaryBtn}
        onPress={resetForm}
        activeOpacity={0.7}
      >
        <Text style={styles.primaryBtnText}>Next Check-in</Text>
      </TouchableOpacity>
    </View>
  );

  const renderError = () => (
    <View style={styles.resultSection}>
      <View style={styles.errorCircle}>
        <Ionicons name="warning-outline" size={40} color={theme.red500} />
      </View>
      <Text style={styles.resultTitle}>Something went wrong</Text>
      <Text style={styles.errorText}>{error}</Text>
      <TouchableOpacity
        style={styles.primaryBtn}
        onPress={resetForm}
        activeOpacity={0.7}
      >
        <Text style={styles.primaryBtnText}>Start Over</Text>
      </TouchableOpacity>
    </View>
  );

  return (
    <KeyboardAvoidingView
      style={{ flex: 1 }}
      behavior="padding"
      keyboardVerticalOffset={Platform.OS === "ios" ? 96 : 0}
    >
      <ScrollView
        style={styles.container}
        contentContainerStyle={styles.scrollContent}
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
    autoScanCard: { gap: 8, padding: 12, backgroundColor: t.card, borderRadius: 12, borderWidth: 1, borderColor: t.border },
    autoScanTitle: { color: t.text, fontSize: 15, fontWeight: "700" },
    autoScanHint: { color: t.muted, fontSize: 12 },
    autoScannerWrap: { marginTop: 4, height: 460, borderRadius: 12, overflow: "hidden", borderWidth: 1, borderColor: t.border, backgroundColor: t.bg },
    primaryBtn: { alignItems: "center", justifyContent: "center", backgroundColor: t.blue600, height: 44, borderRadius: 10 },
    primaryBtnText: { color: "#fff", fontSize: 15, fontWeight: "700" },
    disabledBtn: { opacity: 0.5 },
    outlineBtn: { flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 8, borderRadius: 10, borderWidth: 1, borderColor: t.blue500, height: 42 },
    outlineBtnText: { color: t.blue500, fontSize: 14, fontWeight: "600" },
    playerCard: { flexDirection: "row", alignItems: "center", gap: 10, backgroundColor: t.card, borderRadius: 12, padding: 12, borderWidth: 1, borderColor: t.border },
    playerInfo: { flex: 1 },
    playerName: { fontSize: 15, fontWeight: "600", color: t.text },
    playerPhone: { fontSize: 13, color: t.muted, marginTop: 2 },
    inlineCheckBtn: { borderRadius: 8, backgroundColor: t.blue600, paddingHorizontal: 12, height: 32, alignItems: "center", justifyContent: "center" },
    inlineCheckBtnText: { color: "#fff", fontWeight: "700", fontSize: 12 },
    paymentSection: { alignItems: "center", gap: 12 },
    paymentTitle: { fontSize: 20, fontWeight: "700", color: t.text },
    qrContainer: { alignItems: "center", backgroundColor: "#fff", borderRadius: 14, padding: 14 },
    qrImage: { width: 200, height: 200 },
    paymentAmount: { fontSize: 22, fontWeight: "700", color: t.text, textAlign: "center" },
    paymentRef: { fontSize: 13, color: t.subtle, textAlign: "center" },
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
