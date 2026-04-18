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
  KeyboardAvoidingView,
  Platform,
} from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { useNavigation } from "@react-navigation/native";
import type { NativeStackNavigationProp } from "@react-navigation/native-stack";
import { api, ApiRequestError } from "../../lib/api-client";
import { useAuthStore } from "../../stores/auth-store";
import type { AppColors } from "../../theme/palettes";
import { useAppColors } from "../../theme/use-app-colors";
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

function createStyles(t: AppColors) {
  return StyleSheet.create({
    container: { flex: 1, backgroundColor: t.bg },
    content: { padding: 20, paddingBottom: 60, gap: 20 },

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

    autoApprovalBox: {
      borderRadius: 8,
      borderWidth: 1,
      borderColor: "rgba(112,26,117,0.4)",
      backgroundColor: "rgba(112,26,117,0.12)",
      padding: 10,
      gap: 8,
    },
    autoApprovalTitle: { fontSize: 11, fontWeight: "600", color: t.fuchsia300 },

    qrPreview: {
      alignItems: "center",
      backgroundColor: "#fff",
      borderRadius: 10,
      padding: 12,
      alignSelf: "center",
    },
    qrImage: { width: 180, height: 180 },
    qrHint: { fontSize: 11, color: t.green600, fontWeight: "600", marginTop: 6 },

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

    soundHint: { fontSize: 12, color: t.muted, lineHeight: 17, marginBottom: 4 },
    soundRow: {
      flexDirection: "row",
      alignItems: "center",
      gap: 10,
    },
    soundDropdown: {
      flex: 1,
      flexDirection: "row",
      alignItems: "center",
      justifyContent: "space-between",
      backgroundColor: t.inputBg,
      borderRadius: 8,
      paddingHorizontal: 12,
      height: 42,
      borderWidth: 1,
      borderColor: t.borderLight,
    },
    soundDropdownText: { fontSize: 14, color: t.text, flex: 1 },
    soundPlayBtn: {
      width: 42,
      height: 42,
      borderRadius: 8,
      backgroundColor: "rgba(37,99,235,0.15)",
      justifyContent: "center",
      alignItems: "center",
    },

    modalOverlay: {
      flex: 1,
      backgroundColor: "rgba(0,0,0,0.55)",
      justifyContent: "flex-end",
      position: "relative",
    },
    modalCard: {
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
    modalTitle: { fontSize: 16, fontWeight: "700", color: t.text, marginBottom: 10 },
    modalSearch: {
      backgroundColor: t.inputBg,
      borderRadius: 8,
      paddingHorizontal: 12,
      height: 40,
      borderWidth: 1,
      borderColor: t.borderLight,
      color: t.text,
      marginBottom: 10,
    },
    modalItem: {
      paddingVertical: 14,
      borderBottomWidth: StyleSheet.hairlineWidth,
      borderBottomColor: t.border,
    },
    modalItemText: { fontSize: 15, color: t.text },
    modalItemActive: { color: t.blue500, fontWeight: "600" },
    modalClose: { marginTop: 12, alignItems: "center", padding: 12 },
    modalCloseText: { fontSize: 15, color: t.muted, fontWeight: "600" },
  });
}

export function StaffPaymentSettingsScreen() {
  const venueId = useAuthStore((s) => s.venueId);
  const navigation =
    useNavigation<NativeStackNavigationProp<StaffStackParamList>>();
  const theme = useAppColors();
  const styles = useMemo(() => createStyles(theme), [theme]);

  useLayoutEffect(() => {
    navigation.setOptions({
      headerStyle: { backgroundColor: theme.bg },
      headerTintColor: theme.text,
      headerTitleStyle: { color: theme.text },
      headerShadowVisible: false,
    });
  }, [navigation, theme.bg, theme.text]);

  // ── Payment settings state ──
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
  const [bankModalOpen, setBankModalOpen] = useState(false);
  const [bankSearch, setBankSearch] = useState("");

  // ── Push notifications state ──
  const [pushEnabled, setPushEnabled] = useState(false);
  const [pushToggling, setPushToggling] = useState(false);
  useStaffPushRegistration(pushEnabled);

  // ── Sound state ──
  const [soundId, setSoundId] = useState<SoundId>(DEFAULT_SOUND_ID);
  const [soundModalOpen, setSoundModalOpen] = useState(false);

  // ── Load data ──
  useEffect(() => {
    api
      .get<{ pushNotificationsEnabled: boolean }>("/api/auth/staff-me")
      .then((data) => setPushEnabled(data.pushNotificationsEnabled))
      .catch(() => {});
  }, []);

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

  // ── Handlers ──
  const updateField = (field: keyof VenuePaymentSettings, value: string | number) =>
    setSettings((s) => ({ ...s, [field]: value }));

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

  const handleSelectSound = async (id: SoundId) => {
    setSoundId(id);
    setSoundModalOpen(false);
    await setStoredSoundId(id);
    await playPaymentNotificationSound(id);
  };

  const handlePlayPreview = () => {
    void playPaymentNotificationSound(soundId);
  };

  // ── Derived ──
  const filteredBanks = useMemo(() => {
    const q = bankSearch.trim().toLowerCase();
    if (!q) return VIETQR_BANKS;
    return VIETQR_BANKS.filter(
      (b) => b.name.toLowerCase().includes(q) || b.bin.toLowerCase().includes(q)
    );
  }, [bankSearch]);

  const selectedBankLabel =
    VIETQR_BANKS.find((b) => b.bin === settings.bankName)?.name ?? "";

  const selectedSoundLabel =
    SOUND_OPTIONS.find((s) => s.id === soundId)?.name ?? "Select sound";

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

  return (
    <>
      <KeyboardAvoidingView
        style={{ flex: 1 }}
        behavior={Platform.OS === "ios" ? "padding" : undefined}
      >
        <ScrollView
          style={styles.container}
          contentContainerStyle={styles.content}
          keyboardShouldPersistTaps="handled"
        >
          {/* Payment Settings */}
          <View style={styles.section}>
            <View style={styles.sectionHeader}>
              <Ionicons name="card-outline" size={16} color={theme.green400} />
              <Text style={styles.sectionHeaderText}>Payment Settings</Text>
            </View>

            {loading ? (
              <ActivityIndicator color={theme.blue500} style={{ marginVertical: 20 }} />
            ) : (
              <>
                <View style={{ marginBottom: 4 }}>
                  <Text style={styles.fieldLabel}>Session Fee (VND)</Text>
                  <TextInput
                    style={styles.input}
                    value={settings.sessionFee ? settings.sessionFee.toLocaleString("en") : ""}
                    onChangeText={(v) =>
                      updateField("sessionFee", parseInt(v.replace(/[^0-9]/g, "")) || 0)
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
                      style={selectedBankLabel ? styles.bankSelectText : styles.bankSelectPlaceholder}
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

                <View style={styles.autoApprovalBox}>
                  <Text style={styles.autoApprovalTitle}>Automatic payment approval</Text>
                  <View style={styles.gridRow}>
                    <View style={styles.gridCol}>
                      <Text style={styles.fieldLabel}>Phone</Text>
                      <TextInput
                        style={styles.input}
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
                        style={styles.input}
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

                {payError ? <Text style={styles.errorText}>{payError}</Text> : null}

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

          {/* Push Notifications */}
          <View style={styles.section}>
            <View style={styles.sectionHeader}>
              <Ionicons name="notifications-outline" size={16} color={theme.blue400} />
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
                onValueChange={(next) => void handleTogglePush(next)}
                disabled={pushToggling}
                trackColor={{ false: theme.borderLight, true: theme.blue500 }}
                thumbColor="#ffffff"
              />
            </View>
          </View>

          {/* Sound */}
          <View style={styles.section}>
            <View style={styles.sectionHeader}>
              <Ionicons name="volume-high-outline" size={16} color={theme.blue400} />
              <Text style={styles.sectionHeaderText}>Notification Sound</Text>
            </View>
            <Text style={styles.soundHint}>
              Sound when a payment arrives or is confirmed.
            </Text>
            <View style={styles.soundRow}>
              <TouchableOpacity
                style={styles.soundDropdown}
                onPress={() => setSoundModalOpen(true)}
                activeOpacity={0.7}
              >
                <Text style={styles.soundDropdownText} numberOfLines={1}>
                  {selectedSoundLabel}
                </Text>
                <Ionicons name="chevron-down" size={18} color={theme.dimmed} />
              </TouchableOpacity>
              <TouchableOpacity
                style={styles.soundPlayBtn}
                onPress={handlePlayPreview}
                activeOpacity={0.7}
              >
                <Ionicons name="play" size={20} color={theme.blue500} />
              </TouchableOpacity>
            </View>
          </View>
        </ScrollView>
      </KeyboardAvoidingView>

      {/* Bank picker modal */}
      <Modal visible={bankModalOpen} animationType="slide" transparent onRequestClose={() => setBankModalOpen(false)}>
        <View style={styles.modalOverlay}>
          <Pressable style={StyleSheet.absoluteFillObject} onPress={() => setBankModalOpen(false)} />
          <View style={styles.modalCard}>
            <Text style={styles.modalTitle}>Select bank</Text>
            <TextInput
              style={styles.modalSearch}
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
                  style={styles.modalItem}
                  onPress={() => {
                    updateField("bankName", item.bin);
                    setBankModalOpen(false);
                    setBankSearch("");
                  }}
                >
                  <Text style={styles.modalItemText}>{item.name}</Text>
                </TouchableOpacity>
              )}
            />
            <TouchableOpacity style={styles.modalClose} onPress={() => setBankModalOpen(false)}>
              <Text style={styles.modalCloseText}>Close</Text>
            </TouchableOpacity>
          </View>
        </View>
      </Modal>

      {/* Sound picker modal */}
      <Modal visible={soundModalOpen} animationType="slide" transparent onRequestClose={() => setSoundModalOpen(false)}>
        <View style={styles.modalOverlay}>
          <Pressable style={StyleSheet.absoluteFillObject} onPress={() => setSoundModalOpen(false)} />
          <View style={styles.modalCard}>
            <Text style={styles.modalTitle}>Notification Sound</Text>
            <FlatList
              data={SOUND_OPTIONS}
              keyExtractor={(item) => item.id}
              renderItem={({ item }) => (
                <TouchableOpacity
                  style={styles.modalItem}
                  onPress={() => handleSelectSound(item.id)}
                >
                  <Text style={[styles.modalItemText, item.id === soundId && styles.modalItemActive]}>
                    {item.name}
                  </Text>
                </TouchableOpacity>
              )}
            />
            <TouchableOpacity style={styles.modalClose} onPress={() => setSoundModalOpen(false)}>
              <Text style={styles.modalCloseText}>Close</Text>
            </TouchableOpacity>
          </View>
        </View>
      </Modal>
    </>
  );
}
