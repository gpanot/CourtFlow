import React, { useCallback, useEffect, useRef, useState } from "react";
import {
  ActivityIndicator,
  FlatList,
  Image,
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
import { useFeatureFlagsStore } from "../../stores/feature-flags-store";
import type { SubscriptionPackage } from "../../types/api";
import { FaceCaptureCard } from "../../components/FaceCaptureCard";
import { TabletStaffEscape } from "../../components/TabletStaffEscape";
import type { TabletStackScreenProps } from "../../navigation/types";

type Step =
  | "home"
  | "scan_returning"
  | "needs_registration"
  | "phone_enter"
  | "phone_preview"
  | "reg_face"
  | "reg_form"
  | "subscription_offer"
  | "awaiting_payment"
  | "confirmed"
  | "existing_user"
  | "error";

interface CheckInPlayerLite {
  id: string;
  name: string;
  phone: string;
}

interface PendingPaymentState {
  id: string;
  amount: number;
  paymentRef: string;
  qrUrl: string | null;
}

const IDLE_TIMEOUT_MS = 30_000;

export function CourtPayCheckInScreen({
  navigation,
}: TabletStackScreenProps<"CourtPayCheckIn">) {
  const venueId = useAuthStore((s) => s.venueId);
  const subscriptionsEnabled = useFeatureFlagsStore(
    (s) => s.flags.subscriptions_enabled
  );

  const [step, setStep] = useState<Step>("home");
  const [faceBase64, setFaceBase64] = useState<string | null>(null);
  const [phoneInput, setPhoneInput] = useState("");
  const [phoneError, setPhoneError] = useState("");
  const [phonePreview, setPhonePreview] = useState<CheckInPlayerLite | null>(null);
  const [name, setName] = useState("");
  const [gender, setGender] = useState<"male" | "female" | null>(null);
  const [skillLevel, setSkillLevel] = useState<
    "beginner" | "intermediate" | "advanced" | null
  >(null);
  const [packages, setPackages] = useState<SubscriptionPackage[]>([]);
  const [selectedPkg, setSelectedPkg] = useState<string | null>(null);
  const [player, setPlayer] = useState<CheckInPlayerLite | null>(null);
  const [pendingPayment, setPendingPayment] = useState<PendingPaymentState | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [confirmMessage, setConfirmMessage] = useState("Payment confirmed.");
  const idleTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const resetToHome = useCallback(() => {
    setStep("home");
    setFaceBase64(null);
    setPhoneInput("");
    setPhoneError("");
    setPhonePreview(null);
    setName("");
    setGender(null);
    setSkillLevel(null);
    setSelectedPkg(null);
    setPlayer(null);
    setPendingPayment(null);
    setLoading(false);
    setError("");
    setConfirmMessage("Payment confirmed.");
  }, []);

  const restartIdleTimer = useCallback(() => {
    if (idleTimer.current) clearTimeout(idleTimer.current);
    idleTimer.current = setTimeout(resetToHome, IDLE_TIMEOUT_MS);
  }, [resetToHome]);

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

  useEffect(() => {
    return () => {
      if (idleTimer.current) clearTimeout(idleTimer.current);
    };
  }, []);

  useSocket(venueId, {
    "payment:confirmed": (data: unknown) => {
      const d = data as { pendingPaymentId?: string };
      if (pendingPayment && d.pendingPaymentId === pendingPayment.id) {
        setConfirmMessage("Payment confirmed. Enjoy your game!");
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

  const handleCaptureReturning = async () => {
    if (!faceBase64 || !venueId) return;
    setLoading(true);
    setError("");
    try {
      const res = await api.post<{
        resultType?: string;
        error?: string;
        player?: CheckInPlayerLite;
      }>("/api/courtpay/face-checkin", {
        venueId,
        imageBase64: faceBase64,
      });
      if (res.resultType === "needs_registration") {
        setStep("needs_registration");
      } else if (res.player) {
        setPlayer(res.player);
        setStep("subscription_offer");
      } else {
        setError(res.error ?? "Could not identify player");
        setStep("error");
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed");
      setStep("error");
    } finally {
      setLoading(false);
    }
  };

  const handlePhoneLookup = async () => {
    if (!phoneInput.trim() || !venueId) return;
    setLoading(true);
    setPhoneError("");
    try {
      const res = await api.post<{ player: CheckInPlayerLite }>(
        "/api/kiosk/phone-check-in",
        {
          venueId,
          phase: "lookup",
          phone: phoneInput.trim(),
        }
      );
      setPhonePreview(res.player);
      setStep("phone_preview");
    } catch (err) {
      setPhoneError(err instanceof Error ? err.message : "Lookup failed");
    } finally {
      setLoading(false);
    }
  };

  const handlePhoneConfirm = () => {
    if (!phonePreview) return;
    setPlayer(phonePreview);
    setStep("subscription_offer");
  };

  const handleCaptureRegistrationFace = async () => {
    if (!faceBase64) return;
    setLoading(true);
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
            : "Face already registered."
        );
        setStep("existing_user");
      } else {
        setStep("reg_form");
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "Face verification failed");
      setStep("error");
    } finally {
      setLoading(false);
    }
  };

  const doPaySession = async (targetPlayer: CheckInPlayerLite, packageId?: string) => {
    const res = await api.post<{
      pendingPaymentId?: string | null;
      amount?: number;
      paymentRef?: string | null;
      vietQR?: string | null;
      checkedIn?: boolean;
      free?: boolean;
    }>("/api/courtpay/pay-session", {
      venueCode: venueId,
      playerId: targetPlayer.id,
      packageId,
    });

    if (res.checkedIn || res.free) {
      setConfirmMessage("Checked in successfully.");
      setStep("confirmed");
      return;
    }

    if (res.pendingPaymentId) {
      setPendingPayment({
        id: res.pendingPaymentId,
        amount: res.amount ?? 0,
        paymentRef: res.paymentRef ?? "",
        qrUrl: res.vietQR ?? null,
      });
      setStep("awaiting_payment");
      return;
    }

    setConfirmMessage("Checked in successfully.");
    setStep("confirmed");
  };

  const handlePayExisting = async (packageId?: string) => {
    if (!player || !venueId) return;
    setLoading(true);
    try {
      await doPaySession(player, packageId);
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
        });
        setStep("awaiting_payment");
      } else {
        setConfirmMessage("Registration complete.");
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
      await api.post("/api/courtpay/cash-payment", {
        pendingPaymentId: pendingPayment.id,
      });
      setConfirmMessage("Cash payment confirmed.");
      setStep("confirmed");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Cash payment failed");
      setStep("error");
    } finally {
      setLoading(false);
    }
  };

  const renderStep = () => {
    switch (step) {
      case "home":
        return (
          <View style={styles.centerContent}>
            <View style={styles.heroIcon}>
              <Ionicons name="card-outline" size={64} color="#3b82f6" />
            </View>
            <Text style={styles.heroTitle}>CourtPay</Text>
            <Text style={styles.heroSubtitle}>Exact PWA flow with face check-in.</Text>
            <View style={styles.homeActions}>
              <TouchableOpacity style={styles.primaryBtn} onPress={() => setStep("scan_returning")}>
                <Ionicons name="scan-circle-outline" size={20} color="#fff" />
                <Text style={styles.primaryBtnText}>Check In (Face)</Text>
              </TouchableOpacity>
              <TouchableOpacity style={styles.secondaryHomeBtn} onPress={() => setStep("reg_face")}>
                <Ionicons name="person-add-outline" size={20} color="#fff" />
                <Text style={styles.primaryBtnText}>First Time Register</Text>
              </TouchableOpacity>
            </View>
          </View>
        );

      case "scan_returning":
        return (
          <ScrollView contentContainerStyle={styles.formContent}>
            <Text style={styles.formTitle}>Returning Player</Text>
            <FaceCaptureCard
              title="Face Check-in"
              hint="Capture your face to continue."
              capturedBase64={faceBase64}
              onChange={setFaceBase64}
            />
            <TouchableOpacity
              style={[styles.primaryBtn, (!faceBase64 || loading) && styles.disabledBtn]}
              onPress={handleCaptureReturning}
              disabled={!faceBase64 || loading}
            >
              {loading ? <ActivityIndicator color="#fff" /> : <Text style={styles.primaryBtnText}>Continue</Text>}
            </TouchableOpacity>
            <TouchableOpacity style={styles.secondaryActionBtn} onPress={() => setStep("phone_enter")}>
              <Ionicons name="call-outline" size={18} color="#3b82f6" />
              <Text style={styles.secondaryActionText}>Check in with phone</Text>
            </TouchableOpacity>
            <TouchableOpacity style={styles.cancelBtn} onPress={resetToHome}>
              <Text style={styles.cancelText}>Back</Text>
            </TouchableOpacity>
          </ScrollView>
        );

      case "needs_registration":
        return (
          <View style={styles.centerContent}>
            <Ionicons name="alert-circle-outline" size={60} color="#f59e0b" />
            <Text style={styles.formTitle}>Face Not Recognized</Text>
            <Text style={styles.heroSubtitle}>Try again or use phone.</Text>
            <TouchableOpacity style={styles.primaryBtn} onPress={() => setStep("scan_returning")}>
              <Text style={styles.primaryBtnText}>Scan Again</Text>
            </TouchableOpacity>
            <TouchableOpacity style={styles.secondaryActionBtn} onPress={() => setStep("phone_enter")}>
              <Ionicons name="call-outline" size={18} color="#3b82f6" />
              <Text style={styles.secondaryActionText}>Phone Check-in</Text>
            </TouchableOpacity>
          </View>
        );

      case "phone_enter":
        return (
          <View style={styles.formContent}>
            <Text style={styles.formTitle}>Phone Check-in</Text>
            <TextInput
              style={styles.bigInput}
              value={phoneInput}
              onChangeText={setPhoneInput}
              keyboardType="phone-pad"
              placeholder="Phone number"
              placeholderTextColor="#737373"
            />
            {phoneError ? <Text style={styles.errorText}>{phoneError}</Text> : null}
            <TouchableOpacity
              style={[styles.primaryBtn, loading && styles.disabledBtn]}
              onPress={handlePhoneLookup}
              disabled={loading || !phoneInput.trim()}
            >
              {loading ? <ActivityIndicator color="#fff" /> : <Text style={styles.primaryBtnText}>Look Up</Text>}
            </TouchableOpacity>
            <TouchableOpacity style={styles.cancelBtn} onPress={() => setStep("scan_returning")}>
              <Text style={styles.cancelText}>Back</Text>
            </TouchableOpacity>
          </View>
        );

      case "phone_preview":
        return (
          <View style={styles.formContent}>
            <Text style={styles.formTitle}>Welcome Back</Text>
            <View style={styles.playerCard}>
              <Ionicons name="person-circle" size={48} color="#3b82f6" />
              <Text style={styles.playerCardName}>{phonePreview?.name}</Text>
              <Text style={styles.heroSubtitle}>{phonePreview?.phone}</Text>
            </View>
            <TouchableOpacity style={styles.primaryBtn} onPress={handlePhoneConfirm}>
              <Text style={styles.primaryBtnText}>Continue</Text>
            </TouchableOpacity>
            <TouchableOpacity style={styles.cancelBtn} onPress={() => setStep("phone_enter")}>
              <Text style={styles.cancelText}>Back</Text>
            </TouchableOpacity>
          </View>
        );

      case "reg_face":
        return (
          <ScrollView contentContainerStyle={styles.formContent}>
            <Text style={styles.formTitle}>First Time Registration</Text>
            <FaceCaptureCard
              title="Capture Face"
              hint="Capture once for future face check-ins."
              capturedBase64={faceBase64}
              onChange={setFaceBase64}
            />
            <TouchableOpacity
              style={[styles.primaryBtn, (!faceBase64 || loading) && styles.disabledBtn]}
              onPress={handleCaptureRegistrationFace}
              disabled={!faceBase64 || loading}
            >
              {loading ? <ActivityIndicator color="#fff" /> : <Text style={styles.primaryBtnText}>Continue</Text>}
            </TouchableOpacity>
            <TouchableOpacity style={styles.cancelBtn} onPress={resetToHome}>
              <Text style={styles.cancelText}>Back</Text>
            </TouchableOpacity>
          </ScrollView>
        );

      case "reg_form":
        return (
          <ScrollView contentContainerStyle={styles.formContent}>
            <Text style={styles.formTitle}>Registration Details</Text>
            <TextInput
              style={styles.bigInput}
              value={name}
              onChangeText={setName}
              placeholder="Your name"
              placeholderTextColor="#737373"
            />
            <TextInput
              style={styles.bigInput}
              value={phoneInput}
              onChangeText={setPhoneInput}
              keyboardType="phone-pad"
              placeholder="Phone number"
              placeholderTextColor="#737373"
            />
            <View style={styles.inlineRow}>
              <TouchableOpacity
                style={[styles.selectBtn, gender === "male" && styles.packageCardSelected]}
                onPress={() => setGender("male")}
              >
                <Text style={styles.selectBtnText}>Male</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[styles.selectBtn, gender === "female" && styles.packageCardSelected]}
                onPress={() => setGender("female")}
              >
                <Text style={styles.selectBtnText}>Female</Text>
              </TouchableOpacity>
            </View>
            <View style={styles.inlineRow}>
              {(["beginner", "intermediate", "advanced"] as const).map((lvl) => (
                <TouchableOpacity
                  key={lvl}
                  style={[styles.selectBtn, skillLevel === lvl && styles.packageCardSelected]}
                  onPress={() => setSkillLevel(lvl)}
                >
                  <Text style={styles.selectBtnText}>
                    {lvl.charAt(0).toUpperCase() + lvl.slice(1)}
                  </Text>
                </TouchableOpacity>
              ))}
            </View>

            {subscriptionsEnabled && packages.filter((p) => p.active).length > 0 ? (
              <TouchableOpacity style={styles.secondaryActionBtn} onPress={() => setStep("subscription_offer")}>
                <Ionicons name="pricetag-outline" size={18} color="#3b82f6" />
                <Text style={styles.secondaryActionText}>Choose package (optional)</Text>
              </TouchableOpacity>
            ) : null}

            <TouchableOpacity
              style={[styles.primaryBtn, loading && styles.disabledBtn]}
              onPress={() => handleRegisterAndPay()}
              disabled={loading || !name.trim() || !phoneInput.trim() || !gender || !skillLevel}
            >
              {loading ? <ActivityIndicator color="#fff" /> : <Text style={styles.primaryBtnText}>Register & Pay</Text>}
            </TouchableOpacity>
            <TouchableOpacity style={styles.cancelBtn} onPress={() => setStep("reg_face")}>
              <Text style={styles.cancelText}>Back</Text>
            </TouchableOpacity>
          </ScrollView>
        );

      case "subscription_offer":
        return (
          <View style={styles.formContent}>
            <Text style={styles.formTitle}>Choose a Package</Text>
            <FlatList
              data={packages.filter((p) => p.active)}
              keyExtractor={(p) => p.id}
              scrollEnabled={false}
              renderItem={({ item }) => (
                <TouchableOpacity
                  style={[
                    styles.packageCard,
                    selectedPkg === item.id && styles.packageCardSelected,
                  ]}
                  onPress={() => setSelectedPkg(item.id)}
                >
                  <Text style={styles.packageName}>{item.name}</Text>
                  <Text style={styles.packageDetail}>
                    {item.sessions} sessions - {item.price.toLocaleString()} VND
                  </Text>
                </TouchableOpacity>
              )}
            />
            <TouchableOpacity
              style={[styles.primaryBtn, loading && styles.disabledBtn]}
              onPress={() => {
                if (player) {
                  void handlePayExisting(selectedPkg ?? undefined);
                } else {
                  void handleRegisterAndPay(selectedPkg ?? undefined);
                }
              }}
              disabled={loading}
            >
              {loading ? <ActivityIndicator color="#fff" /> : <Text style={styles.primaryBtnText}>Continue</Text>}
            </TouchableOpacity>
            <TouchableOpacity
              style={styles.cancelBtn}
              onPress={() => (player ? setStep("phone_preview") : setStep("reg_form"))}
            >
              <Text style={styles.cancelText}>Back</Text>
            </TouchableOpacity>
          </View>
        );

      case "awaiting_payment":
        return (
          <View style={styles.centerContent}>
            <Text style={styles.formTitle}>Scan to Pay</Text>
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
            <Text style={styles.waitText}>Waiting for payment...</Text>
            <TouchableOpacity style={styles.cashBtn} onPress={handleCash}>
              <Ionicons name="cash-outline" size={18} color="#fff" />
              <Text style={styles.cashText}>Pay Cash</Text>
            </TouchableOpacity>
            <TouchableOpacity style={styles.cancelBtn} onPress={resetToHome}>
              <Text style={styles.cancelText}>Cancel</Text>
            </TouchableOpacity>
          </View>
        );

      case "existing_user":
        return (
          <View style={styles.centerContent}>
            <Ionicons name="person-circle-outline" size={64} color="#f59e0b" />
            <Text style={styles.formTitle}>Already Registered</Text>
            <Text style={styles.successSub}>{confirmMessage}</Text>
            <TouchableOpacity style={styles.primaryBtn} onPress={resetToHome}>
              <Text style={styles.primaryBtnText}>Back to Home</Text>
            </TouchableOpacity>
          </View>
        );

      case "error":
        return (
          <View style={styles.centerContent}>
            <Ionicons name="warning-outline" size={64} color="#ef4444" />
            <Text style={styles.formTitle}>Error</Text>
            <Text style={styles.errorText}>{error}</Text>
            <TouchableOpacity style={styles.primaryBtn} onPress={resetToHome}>
              <Text style={styles.primaryBtnText}>Try Again</Text>
            </TouchableOpacity>
          </View>
        );

      case "confirmed":
        return (
          <View style={styles.centerContent}>
            <View style={styles.successCircle}>
              <Ionicons name="checkmark" size={64} color="#22c55e" />
            </View>
            <Text style={styles.successTitle}>All Set!</Text>
            <Text style={styles.successSub}>{confirmMessage}</Text>
            <TouchableOpacity style={styles.primaryBtn} onPress={resetToHome}>
              <Text style={styles.primaryBtnText}>Done</Text>
            </TouchableOpacity>
          </View>
        );
    }
  };

  return (
    <View style={styles.container} onTouchStart={restartIdleTimer}>
      {renderStep()}
      <TabletStaffEscape
        onVerified={() => navigation.navigate("TabletModeSelect")}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: "#0a0a0a",
    justifyContent: "center",
    paddingHorizontal: 32,
  },
  centerContent: { alignItems: "center", gap: 16 },
  formContent: { gap: 16 },
  homeActions: { width: "100%", gap: 10 },
  heroIcon: {
    width: 120,
    height: 120,
    borderRadius: 32,
    backgroundColor: "#3b82f615",
    justifyContent: "center",
    alignItems: "center",
    marginBottom: 8,
  },
  heroTitle: { fontSize: 32, fontWeight: "800", color: "#fff" },
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
    backgroundColor: "#3b82f6",
    height: 56,
    borderRadius: 14,
    marginTop: 8,
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
    backgroundColor: "#171717",
    height: 48,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: "#3b82f6",
  },
  secondaryActionText: { color: "#3b82f6", fontSize: 15, fontWeight: "600" },
  secondaryHomeBtn: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 10,
    backgroundColor: "#262626",
    height: 56,
    borderRadius: 14,
    marginTop: 8,
  },
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
  packageCard: {
    backgroundColor: "#171717",
    borderRadius: 14,
    padding: 18,
    marginBottom: 10,
    borderWidth: 1,
    borderColor: "#262626",
  },
  packageCardSelected: {
    borderColor: "#3b82f6",
    backgroundColor: "#3b82f615",
  },
  packageName: { fontSize: 16, fontWeight: "600", color: "#fff" },
  packageDetail: { fontSize: 14, color: "#a3a3a3", marginTop: 4 },
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
  selectBtnText: { color: "#fff", fontSize: 13, fontWeight: "600" },
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
  errorText: { color: "#f87171", textAlign: "center", fontSize: 14 },
});
