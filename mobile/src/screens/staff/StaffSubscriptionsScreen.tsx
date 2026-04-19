import React, {
  useCallback,
  useEffect,
  useLayoutEffect,
  useMemo,
  useState,
} from "react";
import {
  View,
  Text,
  ScrollView,
  TouchableOpacity,
  StyleSheet,
  ActivityIndicator,
  TextInput,
  Modal,
  Alert,
  KeyboardAvoidingView,
  Platform,
  Switch,
} from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { useNavigation } from "@react-navigation/native";
import type { NativeStackNavigationProp } from "@react-navigation/native-stack";
import { api } from "../../lib/api-client";
import { useAuthStore } from "../../stores/auth-store";
import { useAppColors } from "../../theme/use-app-colors";
import type { AppColors } from "../../theme/palettes";
import type { StaffStackParamList } from "../../navigation/types";
import { SubscribersList } from "../../components/SubscribersList";
import type { VenuePaymentSettings } from "../../types/api";

type Tab = "packages" | "subscribers";

interface PackageRow {
  id: string;
  name: string;
  sessions: number | null;
  durationDays: number;
  price: number;
  perks: string | null;
  isActive: boolean;
  _count: { subscriptions: number };
  discountPct?: number | null;
  isBestChoice?: boolean;
}

function formatVND(n: number) {
  return new Intl.NumberFormat("vi-VN").format(n) + " VND";
}

/**
 * Format a number in the compact Vietnamese style: 320.000 or 1.540.000
 * We just use vi-VN locale which uses dots as thousands separator.
 */
function roundPrice(raw: number): number {
  // Round to nearest 10,000 VND
  return Math.round(raw / 10000) * 10000;
}

/**
 * Calculate discount % based on sessions × sessionFee (or days × sessionFee for unlimited).
 * Returns an integer 1–99, or null if it can't be computed.
 */
function calcDiscount(
  price: number,
  sessionFee: number,
  sessions: number | null,
  days: number,
  unlimited: boolean
): number | null {
  if (!sessionFee || !price) return null;
  const full = unlimited ? sessionFee * days : sessionFee * (sessions ?? 0);
  if (full <= 0) return null;
  const pct = Math.round((1 - price / full) * 100);
  return pct > 0 && pct <= 99 ? pct : null;
}

/**
 * Build the auto-hint text shown below the Discount field, e.g.
 *   "auto: 90.000 × 5 = 450.000"
 */
function discountHintText(
  sessionFee: number,
  sessions: number | null,
  days: number,
  unlimited: boolean
): string | null {
  if (!sessionFee) return null;
  const qty = unlimited ? days : (sessions ?? 0);
  if (!qty) return null;
  const total = sessionFee * qty;
  const fmtFee = sessionFee.toLocaleString("vi-VN");
  const fmtTotal = total.toLocaleString("vi-VN");
  const label = unlimited ? "days" : "sessions";
  return `auto: ${fmtFee} × ${qty} ${label} = ${fmtTotal}`;
}

function createStyles(t: AppColors) {
  return StyleSheet.create({
    screen: { flex: 1, backgroundColor: t.bg },
    headerTabs: {
      flexDirection: "row",
      gap: 4,
      paddingHorizontal: 16,
      paddingVertical: 10,
      borderBottomWidth: 1,
      borderBottomColor: t.border,
      backgroundColor: t.bg,
    },
    tab: {
      flex: 1,
      paddingVertical: 10,
      borderRadius: 8,
      alignItems: "center",
    },
    tabOn: { backgroundColor: "rgba(147,51,234,0.2)" },
    tabText: { fontSize: 13, fontWeight: "600", color: t.muted },
    tabTextOn: { color: t.purple400 },
    body: { padding: 16, paddingBottom: 48 },
    banner: {
      borderRadius: 10,
      borderWidth: 1,
      borderColor: "rgba(22,163,74,0.35)",
      backgroundColor: "rgba(22,163,74,0.12)",
      padding: 12,
      marginBottom: 12,
    },
    bannerText: { color: t.green400, fontSize: 13 },
    empty: { textAlign: "center", color: t.muted, marginTop: 40, fontSize: 15 },

    // ── Package card ────────────────────────────────────────────────────────
    pkgCard: {
      borderRadius: 12,
      borderWidth: 1,
      borderColor: t.border,
      backgroundColor: t.card,
      padding: 14,
      marginBottom: 10,
    },
    pkgHeaderRow: {
      flexDirection: "row",
      alignItems: "center",
      gap: 8,
      flexWrap: "wrap",
    },
    pkgTitle: { fontSize: 16, fontWeight: "700", color: t.text, flex: 1 },
    bestChoiceTag: {
      paddingHorizontal: 8,
      paddingVertical: 2,
      borderRadius: 12,
      backgroundColor: "#c026d3",
    },
    bestChoiceTagText: { fontSize: 10, fontWeight: "700", color: "#fff" },
    discountTag: {
      paddingHorizontal: 8,
      paddingVertical: 2,
      borderRadius: 12,
      backgroundColor: "rgba(22,163,74,0.18)",
    },
    discountTagText: { fontSize: 10, fontWeight: "700", color: "#4ade80" },
    pkgMeta: { fontSize: 13, color: t.muted, marginTop: 4 },
    pkgRow: {
      flexDirection: "row",
      justifyContent: "flex-end",
      gap: 8,
      marginTop: 10,
    },
    btnGhost: {
      paddingHorizontal: 12,
      paddingVertical: 8,
      borderRadius: 8,
      borderWidth: 1,
      borderColor: t.border,
    },
    btnGhostText: { color: t.textSecondary, fontSize: 13, fontWeight: "600" },
    btnDanger: {
      paddingHorizontal: 12,
      paddingVertical: 8,
      borderRadius: 8,
      borderWidth: 1,
      borderColor: t.red500,
    },
    btnDangerText: { color: t.red400, fontSize: 13, fontWeight: "600" },
    primaryBtn: {
      flexDirection: "row",
      alignItems: "center",
      justifyContent: "center",
      gap: 8,
      backgroundColor: "#9333ea",
      paddingVertical: 12,
      borderRadius: 10,
      marginBottom: 10,
    },
    primaryBtnText: { color: "#fff", fontWeight: "700", fontSize: 14 },
    linkBtn: { alignItems: "center", paddingVertical: 8 },
    linkText: { color: t.muted, fontSize: 13 },

    // ── Form modal ──────────────────────────────────────────────────────────
    modalOverlay: { flex: 1, backgroundColor: "rgba(0,0,0,0.55)" },
    modalCard: {
      backgroundColor: t.bg,
      borderTopLeftRadius: 16,
      borderTopRightRadius: 16,
      borderWidth: 1,
      borderColor: t.border,
      padding: 20,
      marginTop: "auto" as unknown as number,
    },
    modalTitle: {
      fontSize: 17,
      fontWeight: "700",
      color: t.text,
      marginBottom: 14,
    },
    label: { fontSize: 12, color: t.muted, marginBottom: 4 },

    // ── Package name + Best Choice inline row ───────────────────────────────
    nameRow: {
      flexDirection: "row",
      alignItems: "flex-end",
      gap: 10,
      marginBottom: 12,
    },
    nameInputWrap: { flex: 1 },
    nameInput: {
      borderWidth: 1,
      borderColor: t.border,
      borderRadius: 8,
      paddingHorizontal: 10,
      height: 40,
      color: t.text,
      backgroundColor: t.inputBg,
    },
    bestChoiceBtn: {
      flexDirection: "row",
      alignItems: "center",
      gap: 5,
      height: 40,
      paddingHorizontal: 10,
      borderRadius: 8,
      borderWidth: 1,
      borderColor: t.border,
      backgroundColor: t.inputBg,
    },
    bestChoiceBtnActive: {
      borderColor: "#c026d3",
      backgroundColor: "rgba(192,38,211,0.12)",
    },
    bestChoiceBtnText: {
      fontSize: 12,
      fontWeight: "600",
      color: t.muted,
    },
    bestChoiceBtnTextActive: { color: "#c026d3" },

    // ── Sessions row ───────────────────────────────────────────────────────
    row: { flexDirection: "row", alignItems: "center", gap: 10, marginBottom: 12 },
    input: {
      borderWidth: 1,
      borderColor: t.border,
      borderRadius: 8,
      paddingHorizontal: 10,
      height: 40,
      color: t.text,
      marginBottom: 12,
      backgroundColor: t.inputBg,
    },
    checkLabel: { color: t.textSecondary, fontSize: 14 },

    // ── Price + Discount aligned row ───────────────────────────────────────
    priceDiscountRow: {
      flexDirection: "row",
      gap: 10,
      marginBottom: 12,
    },
    priceWrap: { flex: 2 },
    discountWrap: { flex: 1 },
    fieldInput: {
      borderWidth: 1,
      borderColor: t.border,
      borderRadius: 8,
      paddingHorizontal: 10,
      height: 40,
      color: t.text,
      backgroundColor: t.inputBg,
    },
    discountHint: {
      fontSize: 10,
      color: t.subtle,
      marginTop: 4,
      lineHeight: 14,
    },

    modalActions: { flexDirection: "row", gap: 10, marginTop: 8 },
    flex1: { flex: 1 },

    // ── CourtPay flow toggle card ──────────────────────────────────────────
    toggleCard: {
      borderRadius: 12,
      borderWidth: 1,
      borderColor: t.border,
      backgroundColor: t.card,
      padding: 14,
      marginBottom: 14,
      flexDirection: "row",
      alignItems: "center",
      gap: 12,
    },
    toggleTextWrap: { flex: 1 },
    toggleTitle: { fontSize: 14, fontWeight: "600", color: t.text },
    toggleDesc: { fontSize: 12, color: t.muted, marginTop: 2, lineHeight: 16 },
  });
}

export function StaffSubscriptionsScreen() {
  const navigation =
    useNavigation<NativeStackNavigationProp<StaffStackParamList>>();
  const venueId = useAuthStore((s) => s.venueId);
  const theme = useAppColors();
  const styles = useMemo(() => createStyles(theme), [theme]);

  const [tab, setTab] = useState<Tab>("packages");
  const [packages, setPackages] = useState<PackageRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [defaultsBanner, setDefaultsBanner] = useState("");
  const [creatingDefaults, setCreatingDefaults] = useState(false);
  const [showForm, setShowForm] = useState(false);
  const [editing, setEditing] = useState<PackageRow | null>(null);

  // Session fee for discount calculation
  const [sessionFee, setSessionFee] = useState<number>(0);
  // Whether packages are shown in the CourtPay check-in flow
  const [showSubscriptionsInFlow, setShowSubscriptionsInFlow] = useState(true);
  const [toggleSaving, setToggleSaving] = useState(false);

  // Form fields
  const [formName, setFormName] = useState("");
  const [formSessions, setFormSessions] = useState("");
  const [formUnlimited, setFormUnlimited] = useState(false);
  const [formDays, setFormDays] = useState("30");
  const [formPrice, setFormPrice] = useState("");
  const [formPerks, setFormPerks] = useState("");
  const [formDiscountPct, setFormDiscountPct] = useState("");
  const [formDiscountManual, setFormDiscountManual] = useState(false);
  const [formBestChoice, setFormBestChoice] = useState(false);
  const [formSaving, setFormSaving] = useState(false);

  useLayoutEffect(() => {
    navigation.setOptions({
      title: "Subscriptions",
      headerStyle: { backgroundColor: theme.bg },
      headerTintColor: theme.text,
      headerTitleStyle: { color: theme.text, fontWeight: "700" },
    });
  }, [navigation, theme]);

  const fetchPackages = useCallback(async () => {
    if (!venueId) return;
    const data = await api.get<{ packages: PackageRow[] }>(
      `/api/courtpay/staff/packages?venueId=${venueId}`
    );
    setPackages(data.packages ?? []);
  }, [venueId]);

  const fetchSessionFee = useCallback(async () => {
    if (!venueId) return;
    try {
      const data = await api.get<VenuePaymentSettings>(
        `/api/staff/venue-payment-settings?venueId=${venueId}`
      );
      setSessionFee(data.sessionFee ?? 0);
      setShowSubscriptionsInFlow(data.showSubscriptionsInFlow !== false);
    } catch {
      // non-fatal
    }
  }, [venueId]);

  const handleToggleSubscriptionsInFlow = useCallback(async (value: boolean) => {
    if (!venueId) return;
    setShowSubscriptionsInFlow(value);
    setToggleSaving(true);
    try {
      await api.patch("/api/staff/venue-payment-settings", {
        venueId,
        showSubscriptionsInFlow: value,
      });
    } catch {
      // Revert on failure
      setShowSubscriptionsInFlow(!value);
      Alert.alert("Error", "Could not save setting. Please try again.");
    } finally {
      setToggleSaving(false);
    }
  }, [venueId]);

  useEffect(() => {
    if (!venueId) {
      setLoading(false);
      return;
    }
    setLoading(true);
    Promise.all([fetchPackages(), fetchSessionFee()]).finally(() =>
      setLoading(false)
    );
  }, [venueId, fetchPackages, fetchSessionFee]);

  // ── Auto-calculate discount ──────────────────────────────────────────────
  // Recompute whenever price, sessions, days, or unlimited flag change,
  // unless the user has manually typed a discount value.
  useEffect(() => {
    if (formDiscountManual) return;
    const price = Number(formPrice) || 0;
    const sessions = formUnlimited ? null : Number(formSessions) || null;
    const days = Number(formDays) || 0;
    const pct = calcDiscount(price, sessionFee, sessions, days, formUnlimited);
    setFormDiscountPct(pct != null ? String(pct) : "");
  }, [formPrice, formSessions, formDays, formUnlimited, sessionFee, formDiscountManual]);

  const openCreate = () => {
    setEditing(null);
    setFormName("");
    setFormSessions("");
    setFormUnlimited(false);
    setFormDays("30");
    setFormPrice("");
    setFormPerks("");
    setFormDiscountPct("");
    setFormDiscountManual(false);
    setFormBestChoice(false);
    setShowForm(true);
  };

  const openEdit = (pkg: PackageRow) => {
    setEditing(pkg);
    setFormName(pkg.name);
    setFormSessions(
      pkg.sessions === null || pkg.sessions === undefined
        ? ""
        : String(pkg.sessions)
    );
    setFormUnlimited(pkg.sessions === null);
    setFormDays(String(pkg.durationDays || 30));
    setFormPrice(pkg.price ? String(pkg.price) : "");
    setFormPerks(pkg.perks || "");
    setFormDiscountPct(pkg.discountPct != null ? String(pkg.discountPct) : "");
    setFormDiscountManual(pkg.discountPct != null);
    setFormBestChoice(pkg.isBestChoice ?? false);
    setShowForm(true);
  };

  const createDefaults = async () => {
    if (!venueId) {
      Alert.alert("Venue", "Select a venue from the staff dashboard first.");
      return;
    }
    // Guard: session fee must be set
    if (!sessionFee || sessionFee <= 0) {
      Alert.alert(
        "No Session Price set up",
        "There is no Session Price set up, go to Payment Settings first.",
        [
          { text: "Cancel", style: "cancel" },
          {
            text: "Open Payment Settings",
            onPress: () => navigation.navigate("StaffPaymentSettings"),
          },
        ]
      );
      return;
    }

    setCreatingDefaults(true);
    try {
      // Build 3 default packages from the session fee:
      //   Starter  : 5 sessions,  5% off
      //   Regular  : 10 sessions, 10% off
      //   Unlimited: unlimited,   20% off (price based on 30 days)
      const starterPrice = roundPrice(sessionFee * 5 * (1 - 0.05));
      const regularPrice = roundPrice(sessionFee * 10 * (1 - 0.10));
      const unlimitedPrice = roundPrice(sessionFee * 30 * (1 - 0.20));

      const defaultPackages = [
        {
          name: "Starter",
          sessions: 5,
          durationDays: 60,
          price: starterPrice,
          perks: "",
          discountPct: 5,
          isBestChoice: false,
        },
        {
          name: "Regular",
          sessions: 10,
          durationDays: 90,
          price: regularPrice,
          perks: "",
          discountPct: 10,
          isBestChoice: true,
        },
        {
          name: "Unlimited",
          sessions: null,
          durationDays: 30,
          price: unlimitedPrice,
          perks: "",
          discountPct: 20,
          isBestChoice: false,
        },
      ];

      for (const pkg of defaultPackages) {
        await api.post("/api/courtpay/staff/packages", { venueId, ...pkg });
      }

      setDefaultsBanner(
        `3 packages created — prices based on ${formatVND(sessionFee)} session fee`
      );
      await fetchPackages();
      setTimeout(() => setDefaultsBanner(""), 6000);
    } catch (e) {
      Alert.alert("Error", e instanceof Error ? e.message : "Failed");
    } finally {
      setCreatingDefaults(false);
    }
  };

  const submitForm = async () => {
    if (!venueId) return;
    if (!formName.trim()) {
      Alert.alert("Validation", "Package name is required");
      return;
    }
    if (!formDays || Number(formDays) < 1) {
      Alert.alert("Validation", "Valid duration (days) is required");
      return;
    }
    if (!formUnlimited && (!formSessions || Number(formSessions) < 1)) {
      Alert.alert("Validation", "Sessions required, or enable Unlimited");
      return;
    }
    const discountPctNum = formDiscountPct.trim()
      ? Math.min(99, Math.max(0, Math.round(Number(formDiscountPct))))
      : null;

    setFormSaving(true);
    try {
      const body = {
        venueId,
        name: formName.trim(),
        sessions: formUnlimited ? null : Number(formSessions),
        durationDays: Number(formDays),
        price: Number(formPrice) || 0,
        perks: formPerks.trim() || "",
        discountPct: discountPctNum,
        isBestChoice: formBestChoice,
      };
      if (editing) {
        await api.put(`/api/courtpay/staff/packages/${editing.id}`, {
          name: body.name,
          sessions: body.sessions,
          durationDays: body.durationDays,
          price: body.price,
          perks: body.perks,
          discountPct: body.discountPct,
          isBestChoice: body.isBestChoice,
        });
      } else {
        await api.post("/api/courtpay/staff/packages", body);
      }
      setShowForm(false);
      setEditing(null);
      await fetchPackages();
    } catch (e) {
      Alert.alert("Error", e instanceof Error ? e.message : "Save failed");
    } finally {
      setFormSaving(false);
    }
  };

  const deletePackage = (pkg: PackageRow) => {
    const count = pkg._count?.subscriptions || 0;
    const msg =
      count > 0
        ? `Delete ${pkg.name}? ${count} active subscriber(s) keep their plan until expiry.`
        : `Delete ${pkg.name}?`;
    Alert.alert("Delete package", msg, [
      { text: "Cancel", style: "cancel" },
      {
        text: "Delete",
        style: "destructive",
        onPress: async () => {
          try {
            await api.delete(`/api/courtpay/staff/packages/${pkg.id}`);
            await fetchPackages();
          } catch (e) {
            Alert.alert("Error", e instanceof Error ? e.message : "Failed");
          }
        },
      },
    ]);
  };

  const activePackages = packages.filter((p) => p.isActive);

  // ── Hint text for discount field ─────────────────────────────────────────
  const formSessionsNum = formUnlimited ? null : Number(formSessions) || null;
  const hint = discountHintText(
    sessionFee,
    formSessionsNum,
    Number(formDays) || 0,
    formUnlimited
  );

  return (
    <View style={styles.screen}>
      {/* ── Tabs ─────────────────────────────────────────────────────────── */}
      <View style={styles.headerTabs}>
        <TouchableOpacity
          style={[styles.tab, tab === "packages" && styles.tabOn]}
          onPress={() => setTab("packages")}
        >
          <Text style={[styles.tabText, tab === "packages" && styles.tabTextOn]}>
            Packages
          </Text>
        </TouchableOpacity>
        <TouchableOpacity
          style={[styles.tab, tab === "subscribers" && styles.tabOn]}
          onPress={() => setTab("subscribers")}
        >
          <Text
            style={[styles.tabText, tab === "subscribers" && styles.tabTextOn]}
          >
            Subscribers
          </Text>
        </TouchableOpacity>
      </View>

      {loading ? (
        <View style={{ paddingTop: 40 }}>
          <ActivityIndicator color={theme.purple400} />
        </View>
      ) : (
        <ScrollView contentContainerStyle={styles.body}>
          {defaultsBanner ? (
            <View style={styles.banner}>
              <Text style={styles.bannerText}>{defaultsBanner}</Text>
            </View>
          ) : null}

          {tab === "packages" ? (
            <>
              {/* ── CourtPay flow toggle ──────────────────────────────── */}
              <View style={styles.toggleCard}>
                <View style={styles.toggleTextWrap}>
                  <Text style={styles.toggleTitle}>Show in CourtPay check-in</Text>
                  <Text style={styles.toggleDesc}>
                    When off, players go directly to single-session payment and skip the packages screen.
                  </Text>
                </View>
                <Switch
                  value={showSubscriptionsInFlow}
                  onValueChange={(v) => void handleToggleSubscriptionsInFlow(v)}
                  disabled={toggleSaving}
                  trackColor={{ false: theme.borderLight, true: theme.purple400 }}
                  thumbColor="#ffffff"
                />
              </View>

              {activePackages.length === 0 ? (
                <View>
                  <Text style={styles.empty}>No packages yet</Text>
                  <TouchableOpacity
                    style={styles.primaryBtn}
                    onPress={createDefaults}
                    disabled={creatingDefaults}
                  >
                    {creatingDefaults ? (
                      <ActivityIndicator color="#fff" />
                    ) : (
                      <>
                        <Ionicons name="sparkles" size={18} color="#fff" />
                        <Text style={styles.primaryBtnText}>
                          Create packages for me
                        </Text>
                      </>
                    )}
                  </TouchableOpacity>
                  <TouchableOpacity style={styles.linkBtn} onPress={openCreate}>
                    <Text style={styles.linkText}>or create custom package</Text>
                  </TouchableOpacity>
                </View>
              ) : (
                <>
                  <TouchableOpacity
                    style={[styles.primaryBtn, { marginBottom: 14 }]}
                    onPress={openCreate}
                  >
                    <Ionicons name="add" size={18} color="#fff" />
                    <Text style={styles.primaryBtnText}>Add package</Text>
                  </TouchableOpacity>
                  {packages.map((pkg) => (
                    <View key={pkg.id} style={styles.pkgCard}>
                      <View style={styles.pkgHeaderRow}>
                        <Text style={styles.pkgTitle}>{pkg.name}</Text>
                        {pkg.isBestChoice && (
                          <View style={styles.bestChoiceTag}>
                            <Text style={styles.bestChoiceTagText}>Best Choice</Text>
                          </View>
                        )}
                        {pkg.discountPct != null && pkg.discountPct > 0 && (
                          <View style={styles.discountTag}>
                            <Text style={styles.discountTagText}>
                              Save {pkg.discountPct}%
                            </Text>
                          </View>
                        )}
                      </View>
                      <Text style={styles.pkgMeta}>
                        {pkg.sessions === null
                          ? "Unlimited sessions"
                          : `${pkg.sessions} sessions`}{" "}
                        · {pkg.durationDays} days · {formatVND(pkg.price)}
                      </Text>
                      <Text style={[styles.pkgMeta, { fontSize: 12 }]}>
                        Active subs: {pkg._count?.subscriptions ?? 0}
                      </Text>
                      <View style={styles.pkgRow}>
                        <TouchableOpacity
                          style={styles.btnGhost}
                          onPress={() => openEdit(pkg)}
                        >
                          <Text style={styles.btnGhostText}>Edit</Text>
                        </TouchableOpacity>
                        <TouchableOpacity
                          style={styles.btnDanger}
                          onPress={() => deletePackage(pkg)}
                        >
                          <Text style={styles.btnDangerText}>Delete</Text>
                        </TouchableOpacity>
                      </View>
                    </View>
                  ))}
                </>
              )}
            </>
          ) : (
            <SubscribersList showSearch />
          )}
        </ScrollView>
      )}

      {/* ── Create / Edit Modal ───────────────────────────────────────────── */}
      <Modal visible={showForm} animationType="slide" transparent>
        <KeyboardAvoidingView
          style={styles.modalOverlay}
          behavior={Platform.OS === "ios" ? "padding" : "height"}
        >
          <View style={styles.modalCard}>
            <ScrollView
              keyboardShouldPersistTaps="handled"
              showsVerticalScrollIndicator={false}
              contentContainerStyle={{ paddingBottom: 24 }}
            >
              <Text style={styles.modalTitle}>
                {editing ? "Edit package" : "Create package"}
              </Text>

              {/* ── Package name + Best Choice (inline) ─────────────────── */}
              <Text style={styles.label}>Package name</Text>
              <View style={styles.nameRow}>
                <View style={styles.nameInputWrap}>
                  <TextInput
                    style={styles.nameInput}
                    value={formName}
                    onChangeText={setFormName}
                    placeholder="e.g. Monthly Pass"
                    placeholderTextColor={theme.dimmed}
                  />
                </View>
                <TouchableOpacity
                  style={[
                    styles.bestChoiceBtn,
                    formBestChoice && styles.bestChoiceBtnActive,
                  ]}
                  onPress={() => setFormBestChoice((v) => !v)}
                  activeOpacity={0.7}
                >
                  <Ionicons
                    name={formBestChoice ? "star" : "star-outline"}
                    size={14}
                    color={formBestChoice ? "#c026d3" : theme.muted}
                  />
                  <Text
                    style={[
                      styles.bestChoiceBtnText,
                      formBestChoice && styles.bestChoiceBtnTextActive,
                    ]}
                  >
                    Best Choice
                  </Text>
                </TouchableOpacity>
              </View>

              {/* ── Sessions ──────────────────────────────────────────── */}
              <Text style={styles.label}>Sessions included</Text>
              <View style={styles.row}>
                {!formUnlimited ? (
                  <TextInput
                    style={[styles.input, { flex: 1, marginBottom: 0 }]}
                    value={formSessions}
                    onChangeText={(v) => {
                      setFormSessions(v.replace(/[^0-9]/g, ""));
                      setFormDiscountManual(false);
                    }}
                    keyboardType="number-pad"
                    placeholder="10"
                    placeholderTextColor={theme.dimmed}
                  />
                ) : null}
                <TouchableOpacity
                  style={styles.row}
                  onPress={() => {
                    setFormUnlimited(!formUnlimited);
                    setFormDiscountManual(false);
                  }}
                >
                  <Ionicons
                    name={formUnlimited ? "checkbox" : "square-outline"}
                    size={22}
                    color={theme.purple400}
                  />
                  <Text style={styles.checkLabel}>Unlimited</Text>
                </TouchableOpacity>
              </View>

              {/* ── Duration ──────────────────────────────────────────── */}
              <Text style={styles.label}>Valid for (days)</Text>
              <TextInput
                style={styles.input}
                value={formDays}
                onChangeText={(v) => {
                  setFormDays(v.replace(/[^0-9]/g, ""));
                  setFormDiscountManual(false);
                }}
                keyboardType="number-pad"
              />

              {/* ── Price + Discount % (properly aligned) ─────────────── */}
              <View style={styles.priceDiscountRow}>
                {/* Price column */}
                <View style={styles.priceWrap}>
                  <Text style={styles.label}>Price (VND)</Text>
                  <TextInput
                    style={styles.fieldInput}
                    value={
                      formPrice
                        ? parseInt(formPrice, 10).toLocaleString("vi-VN")
                        : ""
                    }
                    onChangeText={(v) => {
                      setFormPrice(v.replace(/[^0-9]/g, ""));
                      setFormDiscountManual(false);
                    }}
                    keyboardType="number-pad"
                    placeholder="150.000"
                    placeholderTextColor={theme.dimmed}
                  />
                </View>

                {/* Discount column */}
                <View style={styles.discountWrap}>
                  <Text style={styles.label}>Discount (%)</Text>
                  <TextInput
                    style={styles.fieldInput}
                    value={formDiscountPct}
                    onChangeText={(v) => {
                      const clean = v.replace(/[^0-9]/g, "").slice(0, 2);
                      setFormDiscountPct(clean);
                      setFormDiscountManual(true);
                    }}
                    keyboardType="number-pad"
                    placeholder="0"
                    placeholderTextColor={theme.dimmed}
                    maxLength={2}
                  />
                </View>
              </View>

              {/* Hint under the price/discount row */}
              {hint && !formDiscountManual && (
                <Text style={[styles.discountHint, { marginTop: -8, marginBottom: 12 }]}>
                  {hint}
                </Text>
              )}

              {/* ── Perks ─────────────────────────────────────────────── */}
              <Text style={styles.label}>Perks (optional)</Text>
              <TextInput
                style={[styles.input, { height: 72 }]}
                value={formPerks}
                onChangeText={setFormPerks}
                multiline
              />

              {/* ── Actions ───────────────────────────────────────────── */}
              <View style={styles.modalActions}>
                <TouchableOpacity
                  style={[styles.btnGhost, styles.flex1]}
                  onPress={() => {
                    setShowForm(false);
                    setEditing(null);
                  }}
                >
                  <Text style={[styles.btnGhostText, { textAlign: "center" }]}>
                    Cancel
                  </Text>
                </TouchableOpacity>
                <TouchableOpacity
                  style={[styles.primaryBtn, styles.flex1, { marginBottom: 0 }]}
                  onPress={submitForm}
                  disabled={formSaving}
                >
                  {formSaving ? (
                    <ActivityIndicator color="#fff" />
                  ) : (
                    <Text style={styles.primaryBtnText}>Save</Text>
                  )}
                </TouchableOpacity>
              </View>
            </ScrollView>
          </View>
        </KeyboardAvoidingView>
      </Modal>
    </View>
  );
}
