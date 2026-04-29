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
  KeyboardAvoidingView,
  Platform,
} from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { useNavigation } from "@react-navigation/native";
import type { NativeStackNavigationProp } from "@react-navigation/native-stack";
import { api } from "../../lib/api-client";
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
import type { VenuePaymentSettings } from "../../types/api";
import type { StaffStackParamList } from "../../navigation/types";
import { useTabletKioskLocale } from "../../hooks/useTabletKioskLocale";
import type { CheckInScannerStringKey } from "../../lib/tablet-check-in-strings";

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
  const { t } = useTabletKioskLocale();

  // ── Payment settings state ──
  const [settings, setSettings] = useState<VenuePaymentSettings>({
    sessionFee: 0,
    bankName: "",
    bankAccount: "",
    bankOwnerName: "",
    autoApprovalPhone: "",
    autoApprovalCCCD: "",
  });
  const [savedSettings, setSavedSettings] = useState<VenuePaymentSettings | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [payError, setPayError] = useState("");
  const [bankModalOpen, setBankModalOpen] = useState(false);
  const [bankSearch, setBankSearch] = useState("");

  // ── Sound state ──
  const [soundId, setSoundId] = useState<SoundId>(DEFAULT_SOUND_ID);
  const [soundModalOpen, setSoundModalOpen] = useState(false);

  // ── Load data ──
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
      setSavedSettings(data);
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

  const handleSave = useCallback(async () => {
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
      setSavedSettings({ ...settings });
      setTimeout(() => setSaved(false), 2500);
    } catch (err) {
      setPayError(err instanceof Error ? err.message : "Save failed");
    } finally {
      setSaving(false);
    }
  }, [venueId, settings]);

  // ── Dirty detection & header Save button ──────────────────────────────────
  const isDirty = useMemo(() => {
    if (!savedSettings) return false;
    return (
      settings.sessionFee !== savedSettings.sessionFee ||
      settings.bankName !== savedSettings.bankName ||
      settings.bankAccount !== savedSettings.bankAccount ||
      settings.bankOwnerName !== savedSettings.bankOwnerName ||
      (settings.autoApprovalPhone ?? "") !== (savedSettings.autoApprovalPhone ?? "") ||
      (settings.autoApprovalCCCD ?? "") !== (savedSettings.autoApprovalCCCD ?? "")
    );
  }, [settings, savedSettings]);

  useLayoutEffect(() => {
    navigation.setOptions({
      title: t("staffPaymentSettings"),
      headerStyle: { backgroundColor: theme.bg },
      headerTintColor: theme.text,
      headerTitleStyle: { color: theme.text },
      headerShadowVisible: false,
      headerRight: () =>
        loading ? null : (
          <TouchableOpacity
            onPress={() => void handleSave()}
            disabled={!isDirty || saving}
            activeOpacity={0.8}
            style={{
              paddingHorizontal: 14,
              paddingVertical: 6,
              borderRadius: 8,
              backgroundColor: isDirty ? "#16a34a" : "transparent",
              marginRight: 4,
              minWidth: 64,
              alignItems: "center",
              justifyContent: "center",
            }}
          >
            {saving ? (
              <ActivityIndicator size="small" color={isDirty ? "#fff" : theme.dimmed} />
            ) : (
              <Text
                style={{
                  fontSize: 14,
                  fontWeight: "700",
                  color: isDirty ? "#fff" : theme.dimmed,
                }}
              >
                {saved ? t("paySettingsSaved") : t("paySettingsSave")}
              </Text>
            )}
          </TouchableOpacity>
        ),
    });
  }, [navigation, theme, isDirty, saving, saved, loading, handleSave, t]);

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
              <Text style={styles.sectionHeaderText}>{t("paySettingsTitle")}</Text>
            </View>

            {loading ? (
              <ActivityIndicator color={theme.blue500} style={{ marginVertical: 20 }} />
            ) : (
              <>
                <View style={{ marginBottom: 4 }}>
                  <Text style={styles.fieldLabel}>{t("paySettingsSessionFee")}</Text>
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
                  <Text style={styles.fieldLabel}>{t("paySettingsBank")}</Text>
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
                      {selectedBankLabel || t("paySettingsSelectBank")}
                    </Text>
                    <Ionicons name="chevron-down" size={18} color={theme.dimmed} />
                  </TouchableOpacity>
                </View>

                <View style={styles.gridRow}>
                  <View style={styles.gridCol}>
                    <Text style={styles.fieldLabel}>{t("paySettingsAccountNumber")}</Text>
                    <TextInput
                      style={styles.input}
                      value={settings.bankAccount}
                      onChangeText={(v) => updateField("bankAccount", v)}
                      placeholder={t("paySettingsAccountPlaceholder")}
                      placeholderTextColor={theme.dimmed}
                      keyboardType="numeric"
                    />
                  </View>
                  <View style={styles.gridCol}>
                    <Text style={styles.fieldLabel}>{t("paySettingsAccountHolder")}</Text>
                    <TextInput
                      style={styles.input}
                      value={settings.bankOwnerName}
                      onChangeText={(v) => updateField("bankOwnerName", v)}
                      placeholder={t("paySettingsAccountNamePlaceholder")}
                      placeholderTextColor={theme.dimmed}
                      autoCapitalize="characters"
                    />
                  </View>
                </View>

                <View style={styles.autoApprovalBox}>
                  <Text style={styles.autoApprovalTitle}>{t("paySettingsAutoApproval")}</Text>
                  <View style={styles.gridRow}>
                    <View style={styles.gridCol}>
                      <Text style={styles.fieldLabel}>{t("paySettingsPhone")}</Text>
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
                    <Text style={styles.qrHint}>{t("paySettingsQRPreview")}</Text>
                  </View>
                )}

                {payError ? <Text style={styles.errorText}>{payError}</Text> : null}
              </>
            )}
          </View>

          {/* Sound */}
          <View style={styles.section}>
            <View style={styles.sectionHeader}>
              <Ionicons name="volume-high-outline" size={16} color={theme.blue400} />
              <Text style={styles.sectionHeaderText}>{t("paySettingsNotificationSound")}</Text>
            </View>
            <Text style={styles.soundHint}>{t("paySettingsNotificationSoundHint")}</Text>
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

          {/* Player Discounts */}
          {venueId && (
            <PlayerDiscountsSection venueId={venueId} theme={theme} styles={styles} t={t} />
          )}
        </ScrollView>
      </KeyboardAvoidingView>

      {/* Bank picker modal */}
      <Modal visible={bankModalOpen} animationType="slide" transparent onRequestClose={() => setBankModalOpen(false)}>
        <View style={styles.modalOverlay}>
          <Pressable style={StyleSheet.absoluteFillObject} onPress={() => setBankModalOpen(false)} />
          <View style={styles.modalCard}>
            <Text style={styles.modalTitle}>{t("paySettingsSelectBank")}</Text>
            <TextInput
              style={styles.modalSearch}
              value={bankSearch}
              onChangeText={setBankSearch}
              placeholder={t("paySettingsSearchBank")}
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
              <Text style={styles.modalCloseText}>{t("paySettingsClose")}</Text>
            </TouchableOpacity>
          </View>
        </View>
      </Modal>

      {/* Sound picker modal */}
      <Modal visible={soundModalOpen} animationType="slide" transparent onRequestClose={() => setSoundModalOpen(false)}>
        <View style={styles.modalOverlay}>
          <Pressable style={StyleSheet.absoluteFillObject} onPress={() => setSoundModalOpen(false)} />
          <View style={styles.modalCard}>
            <Text style={styles.modalTitle}>{t("paySettingsNotificationSound")}</Text>
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
              <Text style={styles.modalCloseText}>{t("paySettingsClose")}</Text>
            </TouchableOpacity>
          </View>
        </View>
      </Modal>
    </>
  );
}

/* ─── Player Discounts Section ─────────────────────────────────────────────── */

interface PlayerResult {
  id: string;
  name: string;
  phone: string;
  facePhotoPath: string | null;
  avatarPhotoPath: string | null;
}

interface DiscountRecord {
  id: string;
  playerId: string;
  discountType: "fixed" | "percent";
  customFee: number | null;
  discountPct: number | null;
  note: string | null;
  player: PlayerResult;
}

type TFn = (key: CheckInScannerStringKey, params?: Record<string, string | number>) => string;

function PlayerDiscountsSection({
  venueId,
  theme,
  styles,
  t,
}: {
  venueId: string;
  theme: AppColors;
  styles: ReturnType<typeof createStyles>;
  t: TFn;
}) {
  const [discounts, setDiscounts] = useState<DiscountRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const [modalOpen, setModalOpen] = useState(false);
  const [editingDiscount, setEditingDiscount] = useState<DiscountRecord | null>(null);
  const [venueSessionFee, setVenueSessionFee] = useState(0);

  const fetchDiscounts = useCallback(async () => {
    try {
      const [discData, feeData] = await Promise.all([
        api.get<{ discounts: DiscountRecord[] }>("/api/staff/player-discounts"),
        api.get<{ sessionFee: number }>(`/api/staff/venue-payment-settings?venueId=${venueId}`),
      ]);
      setDiscounts(discData.discounts);
      setVenueSessionFee(feeData.sessionFee || 0);
    } catch { /* silent */ } finally {
      setLoading(false);
    }
  }, [venueId]);

  useEffect(() => { void fetchDiscounts(); }, [fetchDiscounts]);

  const handleDelete = (playerId: string) => {
    Alert.alert(
      t("playerDiscountDelete"),
      t("playerDiscountDeleteConfirm"),
      [
        { text: t("playerDiscountCancel"), style: "cancel" },
        {
          text: t("playerDiscountDelete"),
          style: "destructive",
          onPress: async () => {
            try {
              await api.delete("/api/staff/player-discounts", { playerId });
              setDiscounts((prev) => prev.filter((d) => d.playerId !== playerId));
            } catch { /* silent */ }
          },
        },
      ]
    );
  };

  const handleSaved = (updated: DiscountRecord) => {
    setDiscounts((prev) => {
      const existing = prev.findIndex((d) => d.playerId === updated.playerId);
      if (existing >= 0) {
        const copy = [...prev];
        copy[existing] = updated;
        return copy;
      }
      return [updated, ...prev];
    });
    setModalOpen(false);
    setEditingDiscount(null);
  };

  const calcFinalPrice = (d: DiscountRecord) => {
    if (d.discountType === "fixed" && d.customFee != null) return d.customFee;
    if (d.discountType === "percent" && d.discountPct != null)
      return Math.round(venueSessionFee * (1 - d.discountPct / 100));
    return venueSessionFee;
  };

  if (loading) {
    return (
      <View style={styles.section}>
        <ActivityIndicator color={theme.blue500} style={{ marginVertical: 12 }} />
      </View>
    );
  }

  return (
    <>
      <View style={styles.section}>
        <View style={styles.sectionHeader}>
          <Ionicons name="pricetag-outline" size={16} color="#f59e0b" />
          <Text style={styles.sectionHeaderText}>{t("playerDiscountTitle")}</Text>
        </View>

        {discounts.length === 0 ? (
          <Text style={{ fontSize: 12, color: theme.dimmed }}>{t("playerDiscountEmpty")}</Text>
        ) : (
          discounts.map((d) => (
            <View
              key={d.id}
              style={{
                flexDirection: "row",
                alignItems: "center",
                gap: 10,
                backgroundColor: theme.inputBg,
                borderRadius: 10,
                padding: 10,
                borderWidth: 1,
                borderColor: theme.borderLight,
              }}
            >
              <PlayerAvatarRN player={d.player} size={36} theme={theme} />
              <View style={{ flex: 1, minWidth: 0 }}>
                <Text style={{ fontSize: 13, fontWeight: "600", color: theme.text }} numberOfLines={1}>
                  {d.player.name}
                </Text>
                <Text style={{ fontSize: 11, color: theme.muted }} numberOfLines={1}>
                  {d.discountType === "fixed"
                    ? `${(d.customFee ?? 0).toLocaleString("vi-VN")} VND`
                    : `${d.discountPct}% off (${calcFinalPrice(d).toLocaleString("vi-VN")} VND)`}
                  {d.note ? ` · ${d.note}` : ""}
                </Text>
              </View>
              <TouchableOpacity
                onPress={() => { setEditingDiscount(d); setModalOpen(true); }}
                style={{ padding: 6 }}
              >
                <Ionicons name="pencil" size={16} color={theme.muted} />
              </TouchableOpacity>
              <TouchableOpacity onPress={() => handleDelete(d.playerId)} style={{ padding: 6 }}>
                <Ionicons name="trash-outline" size={16} color={theme.red400} />
              </TouchableOpacity>
            </View>
          ))
        )}

        <TouchableOpacity
          onPress={() => { setEditingDiscount(null); setModalOpen(true); }}
          style={{
            flexDirection: "row",
            alignItems: "center",
            justifyContent: "center",
            gap: 6,
            borderRadius: 10,
            borderWidth: 1,
            borderStyle: "dashed",
            borderColor: theme.borderLight,
            paddingVertical: 10,
          }}
          activeOpacity={0.7}
        >
          <Ionicons name="add" size={16} color={theme.muted} />
          <Text style={{ fontSize: 13, color: theme.muted }}>{t("playerDiscountAdd")}</Text>
        </TouchableOpacity>
      </View>

      {modalOpen && (
        <DiscountModalRN
          editing={editingDiscount}
          venueSessionFee={venueSessionFee}
          theme={theme}
          t={t}
          onClose={() => { setModalOpen(false); setEditingDiscount(null); }}
          onSaved={handleSaved}
        />
      )}
    </>
  );
}

function PlayerAvatarRN({ player, size, theme }: { player: PlayerResult; size: number; theme: AppColors }) {
  const src = player.avatarPhotoPath || player.facePhotoPath;
  if (src) {
    return (
      <Image
        source={{ uri: src }}
        style={{ width: size, height: size, borderRadius: size / 2 }}
      />
    );
  }
  const initials = player.name
    .split(" ")
    .map((w) => w[0])
    .slice(0, 2)
    .join("")
    .toUpperCase();
  const colors = ["#6366f1", "#8b5cf6", "#ec4899", "#f59e0b", "#10b981", "#06b6d4"];
  const bg = colors[player.name.charCodeAt(0) % colors.length];
  return (
    <View
      style={{
        width: size,
        height: size,
        borderRadius: size / 2,
        backgroundColor: bg,
        justifyContent: "center",
        alignItems: "center",
      }}
    >
      <Text style={{ fontSize: size * 0.35, fontWeight: "700", color: "#fff" }}>{initials}</Text>
    </View>
  );
}

function DiscountModalRN({
  editing,
  venueSessionFee,
  theme,
  t,
  onClose,
  onSaved,
}: {
  editing: DiscountRecord | null;
  venueSessionFee: number;
  theme: AppColors;
  t: TFn;
  onClose: () => void;
  onSaved: (d: DiscountRecord) => void;
}) {
  const [step, setStep] = useState<"player" | "discount">(editing ? "discount" : "player");
  const [selectedPlayer, setSelectedPlayer] = useState<PlayerResult | null>(editing?.player ?? null);
  const [searchQuery, setSearchQuery] = useState("");
  const [searchResults, setSearchResults] = useState<PlayerResult[]>([]);
  const [searching, setSearching] = useState(false);

  const [discountType, setDiscountType] = useState<"fixed" | "percent">(editing?.discountType ?? "fixed");
  const [customFee, setCustomFee] = useState(editing?.customFee ? String(editing.customFee) : "");
  const [discountPct, setDiscountPct] = useState(editing?.discountPct ? String(editing.discountPct) : "");
  const [note, setNote] = useState(editing?.note ?? "");
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState("");

  useEffect(() => {
    if (searchQuery.length < 2) { setSearchResults([]); return; }
    const timer = setTimeout(async () => {
      setSearching(true);
      try {
        const data = await api.get<{ players: PlayerResult[] }>(
          `/api/staff/players-search?q=${encodeURIComponent(searchQuery)}`
        );
        setSearchResults(data.players);
      } catch { /* silent */ } finally {
        setSearching(false);
      }
    }, 300);
    return () => clearTimeout(timer);
  }, [searchQuery]);

  const calculatedPrice = useMemo(() => {
    if (discountType === "fixed") return Number(customFee) || 0;
    const pct = Number(discountPct) || 0;
    return Math.round(venueSessionFee * (1 - pct / 100));
  }, [discountType, customFee, discountPct, venueSessionFee]);

  const handleSave = async () => {
    if (!selectedPlayer) return;
    setSaving(true);
    setSaveError("");
    try {
      const data = await api.put<{ discount: DiscountRecord }>("/api/staff/player-discounts", {
        playerId: selectedPlayer.id,
        discountType,
        ...(discountType === "fixed" ? { customFee: Number(customFee) } : {}),
        ...(discountType === "percent" ? { discountPct: Number(discountPct) } : {}),
        note: note.trim() || undefined,
      });
      onSaved(data.discount);
    } catch (e) {
      setSaveError(e instanceof Error ? e.message : t("playerDiscountSaveError"));
    } finally {
      setSaving(false);
    }
  };

  const isValid = discountType === "fixed"
    ? Number(customFee) > 0
    : Number(discountPct) >= 1 && Number(discountPct) <= 99;

  return (
    <Modal visible animationType="slide" transparent onRequestClose={onClose}>
      <KeyboardAvoidingView
        style={{ flex: 1 }}
        behavior={Platform.OS === "ios" ? "padding" : "height"}
      >
        <Pressable
          style={{ flex: 1, backgroundColor: "rgba(0,0,0,0.55)", justifyContent: "flex-end" }}
          onPress={onClose}
        >
          <Pressable
            style={{
              backgroundColor: theme.card,
              borderTopLeftRadius: 16,
              borderTopRightRadius: 16,
              paddingHorizontal: 16,
              paddingTop: 14,
              paddingBottom: 28,
              maxHeight: "80%",
              borderWidth: 1,
              borderColor: theme.border,
            }}
            onPress={(e) => e.stopPropagation()}
          >
            <ScrollView keyboardShouldPersistTaps="handled" showsVerticalScrollIndicator={false}>
              <View style={{ flexDirection: "row", justifyContent: "space-between", alignItems: "center", marginBottom: 14 }}>
                <Text style={{ fontSize: 16, fontWeight: "700", color: theme.text }}>
                  {editing ? t("playerDiscountEditTitle") : t("playerDiscountCreateTitle")}
                </Text>
                <TouchableOpacity onPress={onClose}>
                  <Ionicons name="close" size={22} color={theme.muted} />
                </TouchableOpacity>
              </View>

              {step === "player" && (
                <View>
                  <TextInput
                    value={searchQuery}
                    onChangeText={setSearchQuery}
                    placeholder={t("playerDiscountSearchPlaceholder")}
                    placeholderTextColor={theme.dimmed}
                    autoFocus
                    style={{
                      backgroundColor: theme.inputBg,
                      borderRadius: 8,
                      paddingHorizontal: 12,
                      height: 40,
                      borderWidth: 1,
                      borderColor: theme.borderLight,
                      color: theme.text,
                      marginBottom: 10,
                    }}
                  />
                  {searching && <ActivityIndicator color={theme.blue500} style={{ marginVertical: 12 }} />}
                  {!searching && searchResults.length === 0 && searchQuery.length >= 2 && (
                    <Text style={{ textAlign: "center", fontSize: 13, color: theme.dimmed, marginVertical: 12 }}>
                      {t("playerDiscountNoResults")}
                    </Text>
                  )}
                  {searchResults.map((p) => (
                    <TouchableOpacity
                      key={p.id}
                      onPress={() => { setSelectedPlayer(p); setStep("discount"); }}
                      style={{ flexDirection: "row", alignItems: "center", gap: 10, paddingVertical: 10 }}
                    >
                      <PlayerAvatarRN player={p} size={34} theme={theme} />
                      <View style={{ flex: 1, minWidth: 0 }}>
                        <Text style={{ fontSize: 14, fontWeight: "500", color: theme.text }} numberOfLines={1}>{p.name}</Text>
                        <Text style={{ fontSize: 11, color: theme.dimmed }}>{p.phone}</Text>
                      </View>
                    </TouchableOpacity>
                  ))}
                </View>
              )}

              {step === "discount" && selectedPlayer && (
                <View style={{ gap: 14 }}>
                  <View style={{ flexDirection: "row", alignItems: "center", gap: 10, backgroundColor: theme.inputBg, borderRadius: 10, padding: 10, borderWidth: 1, borderColor: theme.borderLight }}>
                    <PlayerAvatarRN player={selectedPlayer} size={34} theme={theme} />
                    <View style={{ flex: 1, minWidth: 0 }}>
                      <Text style={{ fontSize: 13, fontWeight: "600", color: theme.text }} numberOfLines={1}>{selectedPlayer.name}</Text>
                      <Text style={{ fontSize: 11, color: theme.dimmed }}>{selectedPlayer.phone}</Text>
                    </View>
                    {!editing && (
                      <TouchableOpacity onPress={() => { setStep("player"); setSelectedPlayer(null); }}>
                        <Text style={{ fontSize: 12, color: theme.muted }}>{t("playerDiscountChange")}</Text>
                      </TouchableOpacity>
                    )}
                  </View>

                  <View style={{ flexDirection: "row", gap: 8 }}>
                    <TouchableOpacity
                      onPress={() => setDiscountType("fixed")}
                      style={{
                        flex: 1,
                        borderRadius: 8,
                        paddingVertical: 10,
                        alignItems: "center",
                        backgroundColor: discountType === "fixed" ? theme.green600 : "transparent",
                        borderWidth: discountType === "fixed" ? 0 : 1,
                        borderColor: theme.borderLight,
                      }}
                    >
                      <Text style={{ fontSize: 13, fontWeight: "600", color: discountType === "fixed" ? "#fff" : theme.muted }}>
                        {t("playerDiscountFixed")}
                      </Text>
                    </TouchableOpacity>
                    <TouchableOpacity
                      onPress={() => setDiscountType("percent")}
                      style={{
                        flex: 1,
                        borderRadius: 8,
                        paddingVertical: 10,
                        alignItems: "center",
                        backgroundColor: discountType === "percent" ? theme.green600 : "transparent",
                        borderWidth: discountType === "percent" ? 0 : 1,
                        borderColor: theme.borderLight,
                      }}
                    >
                      <Text style={{ fontSize: 13, fontWeight: "600", color: discountType === "percent" ? "#fff" : theme.muted }}>
                        {t("playerDiscountPercent")}
                      </Text>
                    </TouchableOpacity>
                  </View>

                  {discountType === "fixed" ? (
                    <View>
                      <Text style={{ fontSize: 11, color: theme.muted, marginBottom: 4 }}>{t("playerDiscountCustomFeeLabel")}</Text>
                      <TextInput
                        value={customFee ? Number(customFee).toLocaleString("en") : ""}
                        onChangeText={(v) => setCustomFee(v.replace(/[^0-9]/g, ""))}
                        placeholder="100,000"
                        placeholderTextColor={theme.dimmed}
                        keyboardType="numeric"
                        style={{
                          backgroundColor: theme.inputBg,
                          borderRadius: 8,
                          paddingHorizontal: 10,
                          height: 38,
                          color: theme.text,
                          fontSize: 14,
                          borderWidth: 1,
                          borderColor: theme.borderLight,
                        }}
                      />
                      <Text style={{ fontSize: 11, color: theme.dimmed, marginTop: 4 }}>
                        {t("playerDiscountDefaultFee", { fee: venueSessionFee.toLocaleString("vi-VN") })}
                      </Text>
                    </View>
                  ) : (
                    <View>
                      <Text style={{ fontSize: 11, color: theme.muted, marginBottom: 4 }}>{t("playerDiscountPctLabel")}</Text>
                      <TextInput
                        value={discountPct}
                        onChangeText={(v) => {
                          const clean = v.replace(/[^0-9]/g, "");
                          if (Number(clean) <= 99) setDiscountPct(clean);
                        }}
                        placeholder="20"
                        placeholderTextColor={theme.dimmed}
                        keyboardType="numeric"
                        style={{
                          backgroundColor: theme.inputBg,
                          borderRadius: 8,
                          paddingHorizontal: 10,
                          height: 38,
                          color: theme.text,
                          fontSize: 14,
                          borderWidth: 1,
                          borderColor: theme.borderLight,
                        }}
                      />
                      <Text style={{ fontSize: 11, color: theme.dimmed, marginTop: 4 }}>
                        {t("playerDiscountPctResult", { price: calculatedPrice.toLocaleString("vi-VN") })}
                      </Text>
                    </View>
                  )}

                  <View>
                    <Text style={{ fontSize: 11, color: theme.muted, marginBottom: 4 }}>{t("playerDiscountNoteLabel")}</Text>
                    <TextInput
                      value={note}
                      onChangeText={setNote}
                      placeholder={t("playerDiscountNotePlaceholder")}
                      placeholderTextColor={theme.dimmed}
                      style={{
                        backgroundColor: theme.inputBg,
                        borderRadius: 8,
                        paddingHorizontal: 10,
                        height: 38,
                        color: theme.text,
                        fontSize: 14,
                        borderWidth: 1,
                        borderColor: theme.borderLight,
                      }}
                    />
                  </View>

                  {saveError ? <Text style={{ fontSize: 12, color: theme.red400, textAlign: "center" }}>{saveError}</Text> : null}

                  <TouchableOpacity
                    onPress={() => void handleSave()}
                    disabled={saving || !isValid}
                    style={{
                      flexDirection: "row",
                      alignItems: "center",
                      justifyContent: "center",
                      gap: 6,
                      backgroundColor: theme.green600,
                      height: 42,
                      borderRadius: 10,
                      opacity: saving || !isValid ? 0.5 : 1,
                    }}
                    activeOpacity={0.8}
                  >
                    {saving && <ActivityIndicator size="small" color="#fff" />}
                    <Text style={{ color: "#fff", fontSize: 14, fontWeight: "600" }}>{t("playerDiscountSave")}</Text>
                  </TouchableOpacity>
                </View>
              )}
            </ScrollView>
          </Pressable>
        </Pressable>
      </KeyboardAvoidingView>
    </Modal>
  );
}
