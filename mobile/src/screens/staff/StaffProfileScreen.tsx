import React, {
  useState,
  useEffect,
  useCallback,
  useMemo,
  useLayoutEffect,
} from "react";
import {
  View,
  Text,
  TextInput,
  TouchableOpacity,
  StyleSheet,
  ScrollView,
  Alert,
  ActivityIndicator,
  Image,
  Modal,
  FlatList,
  Pressable,
  Switch,
} from "react-native";
import { Ionicons } from "@expo/vector-icons";
import {
  useNavigation,
  CommonActions,
} from "@react-navigation/native";
import type { NativeStackNavigationProp } from "@react-navigation/native-stack";
import { api, ApiRequestError } from "../../lib/api-client";
import { useAuthStore } from "../../stores/auth-store";
import type { AppColors } from "../../theme/palettes";
import { useAppColors } from "../../theme/use-app-colors";
import { useThemeStore } from "../../stores/theme-store";
import { buildVietQRUrl, VIETQR_BANKS } from "../../lib/vietqr";
import {
  SOUND_OPTIONS,
  DEFAULT_SOUND_ID,
  getStoredSoundId,
  setStoredSoundId,
  type SoundId,
} from "../../lib/sound-options";
import { playPaymentNotificationSound } from "../../lib/play-payment-notification-sound";
import { useStaffPushRegistration } from "../../hooks/useStaffPushRegistration";
import type { VenuePaymentSettings } from "../../types/api";
import type { StaffStackParamList } from "../../navigation/types";

function createProfileStyles(t: AppColors) {
  return StyleSheet.create({
    container: { flex: 1, backgroundColor: t.bg },
    content: { padding: 20, paddingBottom: 60, gap: 20 },

    identityRow: { flexDirection: "row", alignItems: "flex-start", gap: 14 },
    avatar: {
      width: 52,
      height: 52,
      borderRadius: 26,
      backgroundColor: "rgba(37,99,235,0.2)",
      justifyContent: "center",
      alignItems: "center",
    },
    identityInfo: { flex: 1, minWidth: 0, gap: 8 },
    identityCard: {
      borderRadius: 12,
      borderWidth: 1,
      borderColor: t.border,
      backgroundColor: t.card,
      paddingHorizontal: 14,
      paddingVertical: 12,
      gap: 10,
    },
    identityLabel: { fontSize: 11, fontWeight: "500", color: t.subtle },
    identityValue: {
      fontSize: 14,
      fontWeight: "600",
      color: t.text,
      marginTop: 2,
    },
    identityDivider: { height: 1, backgroundColor: t.border },
    phoneLabelRow: { flexDirection: "row", alignItems: "center", gap: 4 },
    identityValueMuted: {
      fontSize: 14,
      fontWeight: "500",
      color: t.textSecondary,
      marginTop: 2,
    },
    venueLabel: { fontSize: 13, color: t.muted },

    menuCard: {
      borderRadius: 12,
      borderWidth: 1,
      borderColor: t.border,
      backgroundColor: t.card,
      overflow: "hidden",
    },
    menuRow: {
      flexDirection: "row",
      alignItems: "center",
      paddingHorizontal: 14,
      paddingVertical: 14,
      gap: 12,
    },
    menuRowText: {
      flex: 1,
      fontSize: 14,
      fontWeight: "500",
      color: t.textSecondary,
    },
    menuRowMeta: { fontSize: 13, color: t.muted, marginRight: 4 },
    menuChevron: { marginLeft: "auto" },
    menuDivider: { height: 1, backgroundColor: t.border },

    section: {
      borderRadius: 12,
      borderWidth: 1,
      borderColor: t.border,
      backgroundColor: t.card,
      padding: 14,
      gap: 10,
    },
    sectionHeader: {
      flexDirection: "row",
      alignItems: "center",
      gap: 8,
      marginBottom: 2,
    },
    sectionHeaderText: {
      fontSize: 14,
      fontWeight: "500",
      color: t.textSecondary,
    },

    fieldLabel: { fontSize: 11, color: t.subtle, marginBottom: 4 },
    input: {
      backgroundColor: t.inputBg,
      borderRadius: 8,
      paddingHorizontal: 10,
      height: 38,
      color: t.text,
      fontSize: 14,
      borderWidth: 1,
      borderColor: t.borderLight,
    },
    gridRow: { flexDirection: "row", gap: 8 },
    gridCol: { flex: 1 },

    bankSelectField: {
      flexDirection: "row",
      alignItems: "center",
      justifyContent: "space-between",
      backgroundColor: t.inputBg,
      borderRadius: 8,
      paddingHorizontal: 12,
      height: 38,
      borderWidth: 1,
      borderColor: t.borderLight,
    },
    bankSelectText: { fontSize: 14, color: t.text, flex: 1 },
    bankSelectPlaceholder: { fontSize: 14, color: t.dimmed },
    soundHint: {
      fontSize: 12,
      color: t.muted,
      lineHeight: 17,
      marginBottom: 8,
    },
    soundList: { gap: 6 },
    soundOptionRow: {
      flexDirection: "row",
      alignItems: "center",
      gap: 10,
      paddingVertical: 12,
      paddingHorizontal: 10,
      borderRadius: 8,
      borderWidth: 1,
      borderColor: t.borderLight,
      backgroundColor: t.inputBg,
    },
    soundOptionRowActive: {
      borderColor: t.blue500,
      backgroundColor: "rgba(37,99,235,0.1)",
    },
    soundOptionLabel: { flex: 1, fontSize: 14, color: t.textSecondary },
    hapticRow: {
      flexDirection: "row",
      alignItems: "center",
      justifyContent: "space-between",
      gap: 12,
      marginTop: 6,
      paddingTop: 8,
      borderTopWidth: 1,
      borderTopColor: t.border,
    },
    hapticLabelWrap: { flex: 1, gap: 2 },
    hapticTitle: { fontSize: 14, fontWeight: "600", color: t.text },
    hapticSub: { fontSize: 12, color: t.muted, lineHeight: 16 },
    bankModalOverlay: {
      flex: 1,
      backgroundColor: "rgba(0,0,0,0.55)",
      justifyContent: "flex-end",
      position: "relative",
    },
    bankModalCard: {
      zIndex: 2,
      backgroundColor: t.card,
      borderTopLeftRadius: 16,
      borderTopRightRadius: 16,
      paddingHorizontal: 16,
      paddingTop: 12,
      paddingBottom: 28,
      maxHeight: "72%",
      borderWidth: 1,
      borderColor: t.border,
    },
    bankModalTitle: {
      fontSize: 16,
      fontWeight: "700",
      color: t.text,
      marginBottom: 10,
    },
    bankModalSearch: {
      backgroundColor: t.inputBg,
      borderRadius: 8,
      paddingHorizontal: 12,
      height: 40,
      borderWidth: 1,
      borderColor: t.borderLight,
      color: t.text,
      marginBottom: 10,
    },
    bankModalItem: {
      paddingVertical: 14,
      borderBottomWidth: StyleSheet.hairlineWidth,
      borderBottomColor: t.border,
    },
    bankModalItemText: { fontSize: 15, color: t.text },
    bankModalClose: { marginTop: 12, alignItems: "center", padding: 12 },
    bankModalCloseText: { fontSize: 15, color: t.muted, fontWeight: "600" },

    autoApprovalBox: {
      borderRadius: 8,
      borderWidth: 1,
      borderColor: "rgba(112,26,117,0.4)",
      backgroundColor: "rgba(112,26,117,0.12)",
      padding: 10,
      gap: 8,
    },
    autoApprovalTitle: {
      fontSize: 11,
      fontWeight: "600",
      color: t.fuchsia300,
    },
    fuchsiaFocus: {},

    qrPreview: {
      alignItems: "center",
      backgroundColor: "#fff",
      borderRadius: 10,
      padding: 12,
      alignSelf: "center",
    },
    qrImage: { width: 180, height: 180 },
    qrHint: {
      fontSize: 11,
      color: t.green600,
      fontWeight: "600",
      marginTop: 6,
    },

    errorText: { color: t.red400, fontSize: 12, textAlign: "center" },

    saveBtn: {
      flexDirection: "row",
      alignItems: "center",
      justifyContent: "center",
      gap: 6,
      backgroundColor: t.green600,
      height: 40,
      borderRadius: 10,
    },
    saveBtnText: { color: "#fff", fontSize: 14, fontWeight: "600" },
    disabledBtn: { opacity: 0.5 },

    historyBtn: {
      flexDirection: "row",
      alignItems: "center",
      justifyContent: "space-between",
      borderRadius: 12,
      backgroundColor: t.card,
      paddingHorizontal: 14,
      paddingVertical: 14,
    },
    historyLeft: { flexDirection: "row", alignItems: "center", gap: 12 },
    historyTitle: { fontSize: 14, fontWeight: "500", color: t.textSecondary },
    historyDesc: { fontSize: 12, color: t.subtle, marginTop: 1 },

    logoutBtn: {
      flexDirection: "row",
      alignItems: "center",
      justifyContent: "center",
      gap: 8,
      height: 48,
      borderRadius: 12,
      backgroundColor: "rgba(220,38,38,0.15)",
    },
    logoutText: { color: t.red400, fontSize: 15, fontWeight: "600" },
    roleBtn: {
      flexDirection: "row",
      alignItems: "center",
      justifyContent: "center",
      gap: 8,
      height: 48,
      borderRadius: 12,
      backgroundColor: "rgba(37,99,235,0.12)",
    },
    roleBtnText: { color: t.blue400, fontSize: 15, fontWeight: "600" },
  });
}

export function StaffProfileScreen() {
  const { staffName, staffPhone, venueId, venues, clearAuth } =
    useAuthStore();
  const navigation =
    useNavigation<NativeStackNavigationProp<StaffStackParamList>>();
  const venueName = venues.find((v) => v.id === venueId)?.name ?? "";
  const theme = useAppColors();
  const styles = useMemo(() => createProfileStyles(theme), [theme]);
  const themeMode = useThemeStore((s) => s.mode);
  const toggleTheme = useThemeStore((s) => s.toggleMode);

  useLayoutEffect(() => {
    navigation.setOptions({
      headerStyle: { backgroundColor: theme.bg },
      headerTintColor: theme.text,
      headerTitleStyle: { color: theme.text },
      headerShadowVisible: false,
    });
  }, [navigation, theme.bg, theme.text]);

  const [settings, setSettings] = useState<VenuePaymentSettings>({
    sessionFee: 0,
    bankName: "",
    bankAccount: "",
    bankOwnerName: "",
    autoApprovalPhone: "",
    autoApprovalCCCD: "",
  });
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [payError, setPayError] = useState("");

  const [soundId, setSoundId] = useState<SoundId>(DEFAULT_SOUND_ID);
  const [bankModalOpen, setBankModalOpen] = useState(false);
  const [bankSearch, setBankSearch] = useState("");

  const [pushEnabled, setPushEnabled] = useState(false);
  const [pushToggling, setPushToggling] = useState(false);
  const [pushTesting, setPushTesting] = useState(false);
  const [pushDebugLog, setPushDebugLog] = useState<string[]>([]);

  useStaffPushRegistration(pushEnabled);

  useEffect(() => {
    api
      .get<{ pushNotificationsEnabled: boolean }>("/api/auth/staff-me")
      .then((data) => setPushEnabled(data.pushNotificationsEnabled))
      .catch(() => {});
  }, []);

  const handleTogglePush = useCallback(async (next: boolean) => {
    setPushEnabled(next);
    setPushToggling(true);
    try {
      await api.post("/api/staff/push/preferences", {
        pushNotificationsEnabled: next,
      });
    } catch (err) {
      setPushEnabled(!next);
      const detail =
        err instanceof ApiRequestError
          ? err.message
          : err instanceof Error
            ? err.message
            : "Could not update push notification preference.";
      Alert.alert("Error", detail);
    } finally {
      setPushToggling(false);
    }
  }, []);

  const handleTestPush = useCallback(async () => {
    if (!venueId) return;
    const log: string[] = [];
    const addLog = (msg: string) => {
      console.log(`[PushTest] ${msg}`);
      log.push(msg);
    };

    setPushTesting(true);
    setPushDebugLog([]);

    try {
      addLog("Checking device push token…");
      const { getDevicePushToken } = await import(
        "../../hooks/useStaffPushRegistration"
      );
      const deviceToken = await getDevicePushToken();
      if (deviceToken) {
        addLog(`Token: ${deviceToken.slice(0, 22)}…`);
      } else {
        addLog("⚠ No device token (see Expo terminal for details)");
      }

      addLog("Calling POST /api/staff/push/test…");
      const res = await api.post<{
        ok: boolean;
        reason?: string;
        message?: string;
        targets?: number;
        delivered?: number;
      }>("/api/staff/push/test", { venueId });

      addLog(`ok: ${res.ok}`);
      if (res.ok) {
        addLog(`targets: ${res.targets}  delivered: ${res.delivered}`);
        addLog(res.message ?? "");
      } else {
        addLog(`reason: ${res.reason}`);
        addLog(res.message ?? "");
      }
    } catch (err) {
      const detail =
        err instanceof ApiRequestError
          ? `HTTP ${err.status}: ${err.message}`
          : err instanceof Error
            ? err.message
            : String(err);
      addLog(`ERROR: ${detail}`);
      console.error("[PushTest] error:", err);
    } finally {
      setPushTesting(false);
      setPushDebugLog(log);
    }
  }, [venueId]);

  useEffect(() => {
    void getStoredSoundId().then(setSoundId);
  }, []);

  const loadSettings = useCallback(async () => {
    if (!venueId) return;
    try {
      const data = await api.get<VenuePaymentSettings>(
        `/api/staff/venue-payment-settings?venueId=${venueId}`
      );
      setSettings(data);
    } catch {
      /* use defaults */
    } finally {
      setLoading(false);
    }
  }, [venueId]);

  useEffect(() => {
    loadSettings();
  }, [loadSettings]);

  const handleSave = async () => {
    if (!venueId) return;
    setSaving(true);
    setPayError("");
    setSaved(false);
    try {
      await api.patch("/api/staff/venue-payment-settings", {
        venueId,
        sessionFee: settings.sessionFee,
        bankName: settings.bankName,
        bankAccount: settings.bankAccount,
        bankOwnerName: settings.bankOwnerName,
        autoApprovalPhone: settings.autoApprovalPhone,
        autoApprovalCCCD: settings.autoApprovalCCCD,
      });
      setSaved(true);
      setTimeout(() => setSaved(false), 2500);
    } catch (err) {
      setPayError(err instanceof Error ? err.message : "Save failed");
    } finally {
      setSaving(false);
    }
  };

  const handleSelectSound = async (id: SoundId) => {
    setSoundId(id);
    await setStoredSoundId(id);
    await playPaymentNotificationSound(id);
  };

  const handleLogout = () => {
    Alert.alert("Log Out", "Are you sure you want to log out?", [
      { text: "Cancel", style: "cancel" },
      {
        text: "Log Out",
        style: "destructive",
        onPress: () => {
          clearAuth();
          navigation.dispatch(
            CommonActions.reset({ index: 0, routes: [{ name: "StaffLogin" as never }] })
          );
        },
      },
    ]);
  };

  const qrPreviewUrl =
    settings.bankName && settings.bankAccount
      ? buildVietQRUrl({
          bankBin: settings.bankName,
          accountNumber: settings.bankAccount,
          accountName: settings.bankOwnerName,
          amount: settings.sessionFee || 10000,
          description: "Preview",
        })
      : null;

  const updateField = (
    field: keyof VenuePaymentSettings,
    value: string | number
  ) => setSettings((s) => ({ ...s, [field]: value }));

  const filteredBanks = useMemo(() => {
    const q = bankSearch.trim().toLowerCase();
    if (!q) return VIETQR_BANKS;
    return VIETQR_BANKS.filter(
      (b) =>
        b.name.toLowerCase().includes(q) ||
        b.bin.toLowerCase().includes(q)
    );
  }, [bankSearch]);

  const selectedBankLabel =
    VIETQR_BANKS.find((b) => b.bin === settings.bankName)?.name ?? "";

  return (
    <>
    <ScrollView
      style={styles.container}
      contentContainerStyle={styles.content}
      keyboardShouldPersistTaps="handled"
    >
      {/* Identity */}
      <View style={styles.identityRow}>
        <View style={styles.avatar}>
          <Ionicons name="person" size={26} color={theme.blue400} />
        </View>
        <View style={styles.identityInfo}>
          <View style={styles.identityCard}>
            <View>
              <Text style={styles.identityLabel}>Name</Text>
              <Text style={styles.identityValue}>{staffName || "Staff"}</Text>
            </View>
            <View style={styles.identityDivider} />
            <View>
              <View style={styles.phoneLabelRow}>
                <Ionicons name="call-outline" size={11} color={theme.subtle} />
                <Text style={styles.identityLabel}>Phone</Text>
              </View>
              <Text style={styles.identityValueMuted}>
                {staffPhone || "—"}
              </Text>
            </View>
          </View>
          <Text style={styles.venueLabel}>{venueName}</Text>
        </View>
      </View>

      {/* CourtPay Menu */}
      <View style={styles.menuCard}>
        <TouchableOpacity
          style={styles.menuRow}
          onPress={toggleTheme}
          activeOpacity={0.6}
        >
          <Ionicons
            name={themeMode === "dark" ? "moon" : "sunny"}
            size={18}
            color={theme.amber400}
          />
          <Text style={styles.menuRowText}>Appearance</Text>
          <Text style={styles.menuRowMeta}>
            {themeMode === "dark" ? "Dark" : "Light"}
          </Text>
          <Ionicons
            name="chevron-forward"
            size={16}
            color={theme.dimmed}
            style={styles.menuChevron}
          />
        </TouchableOpacity>
        <View style={styles.menuDivider} />
        <TouchableOpacity
          style={styles.menuRow}
          onPress={() => navigation.navigate("StaffSubscriptions")}
          activeOpacity={0.6}
        >
          <Ionicons name="cube-outline" size={16} color={theme.purple400} />
          <Text style={styles.menuRowText}>Subscriptions</Text>
          <Ionicons
            name="chevron-forward"
            size={16}
            color={theme.dimmed}
            style={styles.menuChevron}
          />
        </TouchableOpacity>
        <View style={styles.menuDivider} />
        <TouchableOpacity
          style={styles.menuRow}
          onPress={() => navigation.navigate("StaffBossDashboard")}
          activeOpacity={0.6}
        >
          <Ionicons
            name="bar-chart-outline"
            size={16}
            color={theme.purple400}
          />
          <Text style={styles.menuRowText}>Boss Dashboard</Text>
          <Ionicons
            name="chevron-forward"
            size={16}
            color={theme.dimmed}
            style={styles.menuChevron}
          />
        </TouchableOpacity>
      </View>

      {/* Payment Settings */}
      <View style={styles.section}>
        <View style={styles.sectionHeader}>
          <Ionicons name="card-outline" size={16} color={theme.green400} />
          <Text style={styles.sectionHeaderText}>Payment Settings</Text>
        </View>

        {loading ? (
          <ActivityIndicator
            color={theme.blue500}
            style={{ marginVertical: 20 }}
          />
        ) : (
          <>
            <View style={{ marginBottom: 4 }}>
              <Text style={styles.fieldLabel}>Session Fee (VND)</Text>
              <TextInput
                style={styles.input}
                value={
                  settings.sessionFee
                    ? settings.sessionFee.toLocaleString("en")
                    : ""
                }
                onChangeText={(v) =>
                  updateField(
                    "sessionFee",
                    parseInt(v.replace(/[^0-9]/g, "")) || 0
                  )
                }
                keyboardType="numeric"
                placeholder="500,000"
                placeholderTextColor={theme.dimmed}
              />
            </View>
            <View style={{ marginBottom: 4 }}>
              <Text style={styles.fieldLabel}>Bank</Text>
              <TouchableOpacity
                style={styles.bankSelectField}
                onPress={() => {
                  setBankSearch("");
                  setBankModalOpen(true);
                }}
                activeOpacity={0.7}
              >
                <Text
                  style={
                    selectedBankLabel
                      ? styles.bankSelectText
                      : styles.bankSelectPlaceholder
                  }
                  numberOfLines={1}
                >
                  {selectedBankLabel || "Select bank"}
                </Text>
                <Ionicons name="chevron-down" size={18} color={theme.dimmed} />
              </TouchableOpacity>
            </View>

            <View style={styles.gridRow}>
              <View style={styles.gridCol}>
                <Text style={styles.fieldLabel}>Account Number</Text>
                <TextInput
                  style={styles.input}
                  value={settings.bankAccount}
                  onChangeText={(v) => updateField("bankAccount", v)}
                  placeholder="Account #"
                  placeholderTextColor={theme.dimmed}
                  keyboardType="numeric"
                />
              </View>
              <View style={styles.gridCol}>
                <Text style={styles.fieldLabel}>Account Holder</Text>
                <TextInput
                  style={styles.input}
                  value={settings.bankOwnerName}
                  onChangeText={(v) => updateField("bankOwnerName", v)}
                  placeholder="Account name"
                  placeholderTextColor={theme.dimmed}
                  autoCapitalize="characters"
                />
              </View>
            </View>

            {/* Auto-approval (Phone + CCCD) */}
            <View style={styles.autoApprovalBox}>
              <Text style={styles.autoApprovalTitle}>
                Automatic payment approval
              </Text>
              <View style={styles.gridRow}>
                <View style={styles.gridCol}>
                  <Text style={styles.fieldLabel}>Phone</Text>
                  <TextInput
                    style={[styles.input, styles.fuchsiaFocus]}
                    value={settings.autoApprovalPhone ?? ""}
                    onChangeText={(v) => updateField("autoApprovalPhone", v)}
                    placeholder="0901234567"
                    placeholderTextColor={theme.dimmed}
                    keyboardType="phone-pad"
                  />
                </View>
                <View style={styles.gridCol}>
                  <Text style={styles.fieldLabel}>CCCD</Text>
                  <TextInput
                    style={[styles.input, styles.fuchsiaFocus]}
                    value={settings.autoApprovalCCCD ?? ""}
                    onChangeText={(v) => updateField("autoApprovalCCCD", v)}
                    placeholder="0123456789"
                    placeholderTextColor={theme.dimmed}
                  />
                </View>
              </View>
            </View>

            {qrPreviewUrl && (
              <View style={styles.qrPreview}>
                <Image
                  source={{ uri: qrPreviewUrl }}
                  style={styles.qrImage}
                  resizeMode="contain"
                />
                <Text style={styles.qrHint}>QR Preview</Text>
              </View>
            )}

            {payError ? (
              <Text style={styles.errorText}>{payError}</Text>
            ) : null}

            <TouchableOpacity
              style={[styles.saveBtn, saving && styles.disabledBtn]}
              onPress={handleSave}
              disabled={saving}
              activeOpacity={0.7}
            >
              {saving ? (
                <ActivityIndicator color="#fff" size="small" />
              ) : saved ? (
                <>
                  <Ionicons name="checkmark" size={16} color="#fff" />
                  <Text style={styles.saveBtnText}>Saved</Text>
                </>
              ) : (
                <Text style={styles.saveBtnText}>Save Settings</Text>
              )}
            </TouchableOpacity>
          </>
        )}
      </View>

      {/* Push Notifications Toggle */}
      <View style={styles.section}>
        <View style={styles.sectionHeader}>
          <Ionicons
            name="notifications-outline"
            size={16}
            color={theme.blue400}
          />
          <Text style={styles.sectionHeaderText}>Push Notifications</Text>
        </View>
        <View style={styles.hapticRow}>
          <View style={styles.hapticLabelWrap}>
            <Text style={styles.hapticTitle}>Payment alerts</Text>
            <Text style={styles.hapticSub}>
              Receive push notifications when a payment is pending or confirmed,
              even when the app is in the background.
            </Text>
          </View>
          <Switch
            value={pushEnabled}
            onValueChange={(next) => {
              void handleTogglePush(next);
            }}
            disabled={pushToggling}
            trackColor={{ false: theme.borderLight, true: theme.blue500 }}
            thumbColor="#ffffff"
          />
        </View>

        <TouchableOpacity
          style={[
            styles.saveBtn,
            { backgroundColor: theme.blue500, marginTop: 4 },
            (!pushEnabled || pushTesting) && styles.disabledBtn,
          ]}
          onPress={() => {
            void handleTestPush();
          }}
          disabled={!pushEnabled || pushTesting}
          activeOpacity={0.7}
        >
          {pushTesting ? (
            <ActivityIndicator color="#fff" size="small" />
          ) : (
            <>
              <Ionicons name="paper-plane-outline" size={15} color="#fff" />
              <Text style={styles.saveBtnText}>Send Test Notification</Text>
            </>
          )}
        </TouchableOpacity>

        {pushDebugLog.length > 0 && (
          <View
            style={{
              marginTop: 8,
              backgroundColor: theme.inputBg,
              borderRadius: 8,
              padding: 10,
              borderWidth: 1,
              borderColor: theme.borderLight,
              gap: 2,
            }}
          >
            {pushDebugLog.map((line, i) => (
              <Text
                key={i}
                style={{ fontSize: 11, fontFamily: "monospace", color: theme.textSecondary }}
                selectable
              >
                {line}
              </Text>
            ))}
          </View>
        )}
      </View>

      {/* Payment Notifications */}
      <View style={styles.section}>
        <View style={styles.sectionHeader}>
          <Ionicons
            name="volume-high-outline"
            size={16}
            color={theme.blue400}
          />
          <Text style={styles.sectionHeaderText}>Payment Notifications</Text>
        </View>
        <Text style={styles.soundHint}>
          Sound when a new pending payment arrives and when a payment is
          confirmed.
        </Text>
        <View style={styles.soundList}>
          {SOUND_OPTIONS.map((opt) => (
            <TouchableOpacity
              key={opt.id}
              style={[
                styles.soundOptionRow,
                soundId === opt.id && styles.soundOptionRowActive,
              ]}
              onPress={() => handleSelectSound(opt.id)}
              activeOpacity={0.7}
            >
              <Ionicons
                name={
                  soundId === opt.id
                    ? "radio-button-on"
                    : "radio-button-off"
                }
                size={22}
                color={soundId === opt.id ? theme.blue500 : theme.dimmed}
              />
              <Text style={styles.soundOptionLabel}>{opt.name}</Text>
            </TouchableOpacity>
          ))}
        </View>
      </View>

      {/* Session History */}
      <TouchableOpacity
        style={styles.historyBtn}
        onPress={() => navigation.goBack()}
        activeOpacity={0.7}
      >
        <View style={styles.historyLeft}>
          <Ionicons name="time-outline" size={20} color={theme.blue400} />
          <View>
            <Text style={styles.historyTitle}>Session History</Text>
            <Text style={styles.historyDesc}>View past sessions</Text>
          </View>
        </View>
        <Ionicons name="chevron-forward" size={20} color={theme.subtle} />
      </TouchableOpacity>

      {/* Log Out */}
      <TouchableOpacity
        style={styles.logoutBtn}
        onPress={handleLogout}
        activeOpacity={0.7}
      >
        <Ionicons name="log-out-outline" size={20} color={theme.red400} />
        <Text style={styles.logoutText}>Log Out</Text>
      </TouchableOpacity>

      {/* Go to Role / Tablet */}
      <TouchableOpacity
        style={styles.roleBtn}
        onPress={() => {
          navigation.dispatch(
            CommonActions.reset({ index: 0, routes: [{ name: "ContinueAs" as never }] })
          );
        }}
        activeOpacity={0.7}
      >
        <Ionicons name="swap-horizontal-outline" size={20} color={theme.blue400} />
        <Text style={styles.roleBtnText}>Go to Role / Tablet</Text>
      </TouchableOpacity>
    </ScrollView>

    <Modal
      visible={bankModalOpen}
      animationType="slide"
      transparent
      onRequestClose={() => setBankModalOpen(false)}
    >
      <View style={styles.bankModalOverlay}>
        <Pressable
          style={StyleSheet.absoluteFillObject}
          onPress={() => setBankModalOpen(false)}
        />
        <View style={styles.bankModalCard}>
          <Text style={styles.bankModalTitle}>Select bank</Text>
          <TextInput
            style={styles.bankModalSearch}
            value={bankSearch}
            onChangeText={setBankSearch}
            placeholder="Search by name or BIN…"
            placeholderTextColor={theme.dimmed}
          />
          <FlatList
            data={filteredBanks}
            keyExtractor={(item) => item.bin}
            keyboardShouldPersistTaps="handled"
            style={{ maxHeight: 340 }}
            renderItem={({ item }) => (
              <TouchableOpacity
                style={styles.bankModalItem}
                onPress={() => {
                  updateField("bankName", item.bin);
                  setBankModalOpen(false);
                  setBankSearch("");
                }}
              >
                <Text style={styles.bankModalItemText}>{item.name}</Text>
              </TouchableOpacity>
            )}
          />
          <TouchableOpacity
            style={styles.bankModalClose}
            onPress={() => setBankModalOpen(false)}
          >
            <Text style={styles.bankModalCloseText}>Close</Text>
          </TouchableOpacity>
        </View>
      </View>
    </Modal>
    </>
  );
}
