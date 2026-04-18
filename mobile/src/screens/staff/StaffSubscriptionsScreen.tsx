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
} from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { useNavigation } from "@react-navigation/native";
import type { NativeStackNavigationProp } from "@react-navigation/native-stack";
import { api } from "../../lib/api-client";
import { useAuthStore } from "../../stores/auth-store";
import { useAppColors } from "../../theme/use-app-colors";
import type { AppColors } from "../../theme/palettes";
import type { StaffStackParamList } from "../../navigation/types";

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
}

interface SubscriberRow {
  id: string;
  playerName: string;
  playerPhone: string;
  packageName: string;
  status: string;
  sessionsRemaining: number | null;
  totalSessions: number | null;
  usageCount: number;
  activatedAt: string;
  expiresAt: string;
}

function formatVND(n: number) {
  return new Intl.NumberFormat("vi-VN").format(n) + " VND";
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
    pkgCard: {
      borderRadius: 12,
      borderWidth: 1,
      borderColor: t.border,
      backgroundColor: t.card,
      padding: 14,
      marginBottom: 10,
    },
    pkgTitle: { fontSize: 16, fontWeight: "700", color: t.text },
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
    search: {
      borderWidth: 1,
      borderColor: t.border,
      borderRadius: 10,
      paddingHorizontal: 12,
      height: 42,
      color: t.text,
      marginBottom: 12,
      backgroundColor: t.inputBg,
    },
    subCard: {
      borderRadius: 10,
      borderWidth: 1,
      borderColor: t.border,
      backgroundColor: t.card,
      padding: 12,
      marginBottom: 8,
    },
    subName: { fontSize: 15, fontWeight: "600", color: t.text },
    subPhone: { fontSize: 12, color: t.muted, marginTop: 2 },
    subPkg: { fontSize: 12, color: t.purple400, marginTop: 4 },
    subStatus: { fontSize: 11, color: t.subtle, marginTop: 4 },
    modalOverlay: {
      flex: 1,
      backgroundColor: "rgba(0,0,0,0.55)",
    },
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
    row: { flexDirection: "row", alignItems: "center", gap: 10, marginBottom: 12 },
    checkLabel: { color: t.textSecondary, fontSize: 14 },
    modalActions: { flexDirection: "row", gap: 10, marginTop: 8 },
    flex1: { flex: 1 },
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
  const [subscribers, setSubscribers] = useState<SubscriberRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [defaultsBanner, setDefaultsBanner] = useState("");
  const [creatingDefaults, setCreatingDefaults] = useState(false);
  const [showForm, setShowForm] = useState(false);
  const [editing, setEditing] = useState<PackageRow | null>(null);

  const [formName, setFormName] = useState("");
  const [formSessions, setFormSessions] = useState("");
  const [formUnlimited, setFormUnlimited] = useState(false);
  const [formDays, setFormDays] = useState("30");
  const [formPrice, setFormPrice] = useState("");
  const [formPerks, setFormPerks] = useState("");
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

  const fetchSubscribers = useCallback(async () => {
    if (!venueId) return;
    const params = new URLSearchParams({ venueId });
    if (search.trim()) params.set("search", search.trim());
    const raw = await api.get<{
      subscribers: Array<{
        id: string;
        status: string;
        sessionsRemaining: number | null;
        activatedAt: string;
        expiresAt: string;
        player: { name: string; phone: string };
        package: { name: string; sessions: number | null };
        _count?: { usages: number };
      }>;
    }>(`/api/courtpay/staff/subscribers?${params.toString()}`);
    const list = (raw.subscribers ?? []).map((s) => ({
      id: s.id,
      playerName: s.player.name,
      playerPhone: s.player.phone,
      packageName: s.package.name,
      status: s.status,
      sessionsRemaining: s.sessionsRemaining,
      totalSessions: s.package.sessions,
      usageCount: s._count?.usages ?? 0,
      activatedAt: s.activatedAt,
      expiresAt: s.expiresAt,
    }));
    setSubscribers(list);
  }, [venueId, search]);

  useEffect(() => {
    if (!venueId) {
      setLoading(false);
      return;
    }
    setLoading(true);
    Promise.all([fetchPackages(), fetchSubscribers()]).finally(() =>
      setLoading(false)
    );
  }, [venueId, fetchPackages, fetchSubscribers]);

  const openCreate = () => {
    setEditing(null);
    setFormName("");
    setFormSessions("");
    setFormUnlimited(false);
    setFormDays("30");
    setFormPrice("");
    setFormPerks("");
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
    setShowForm(true);
  };

  const createDefaults = async () => {
    if (!venueId) {
      Alert.alert("Venue", "Select a venue from the staff dashboard first.");
      return;
    }
    setCreatingDefaults(true);
    try {
      await api.post("/api/courtpay/staff/packages/create-defaults", {
        venueId,
      });
      setDefaultsBanner("3 packages created — set your prices");
      await fetchPackages();
      setTimeout(() => setDefaultsBanner(""), 5000);
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
    setFormSaving(true);
    try {
      const body = {
        venueId,
        name: formName.trim(),
        sessions: formUnlimited ? null : Number(formSessions),
        durationDays: Number(formDays),
        price: Number(formPrice) || 0,
        perks: formPerks.trim() || "",
      };
      if (editing) {
        await api.put(`/api/courtpay/staff/packages/${editing.id}`, {
          name: body.name,
          sessions: body.sessions,
          durationDays: body.durationDays,
          price: body.price,
          perks: body.perks,
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

  return (
    <View style={styles.screen}>
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
                      <Text style={styles.pkgTitle}>{pkg.name}</Text>
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
            <>
              <TextInput
                style={styles.search}
                placeholder="Search by name or phone..."
                placeholderTextColor={theme.dimmed}
                value={search}
                onChangeText={setSearch}
              />
              {subscribers.length === 0 ? (
                <Text style={styles.empty}>
                  {search.trim() ? "No subscribers found" : "No subscribers yet"}
                </Text>
              ) : (
                subscribers.map((s) => (
                  <View key={s.id} style={styles.subCard}>
                    <Text style={styles.subName}>{s.playerName}</Text>
                    <Text style={styles.subPhone}>{s.playerPhone}</Text>
                    <Text style={styles.subPkg}>{s.packageName}</Text>
                    <Text style={styles.subStatus}>
                      {s.status}
                      {s.totalSessions === null
                        ? " · Unlimited"
                        : ` · ${s.sessionsRemaining ?? 0}/${s.totalSessions ?? 0} left`}
                      {" · "}
                      {s.usageCount} used
                    </Text>
                  </View>
                ))
              )}
            </>
          )}
        </ScrollView>
      )}

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
              <Text style={styles.label}>Package name</Text>
              <TextInput
                style={styles.input}
                value={formName}
                onChangeText={setFormName}
                placeholder="e.g. Monthly Pass"
                placeholderTextColor={theme.dimmed}
              />
              <Text style={styles.label}>Sessions included</Text>
              <View style={styles.row}>
                {!formUnlimited ? (
                  <TextInput
                    style={[styles.input, { flex: 1, marginBottom: 0 }]}
                    value={formSessions}
                    onChangeText={setFormSessions}
                    keyboardType="number-pad"
                    placeholder="10"
                    placeholderTextColor={theme.dimmed}
                  />
                ) : null}
                <TouchableOpacity
                  style={styles.row}
                  onPress={() => setFormUnlimited(!formUnlimited)}
                >
                  <Ionicons
                    name={formUnlimited ? "checkbox" : "square-outline"}
                    size={22}
                    color={theme.purple400}
                  />
                  <Text style={styles.checkLabel}>Unlimited</Text>
                </TouchableOpacity>
              </View>
              <Text style={styles.label}>Valid for (days)</Text>
              <TextInput
                style={styles.input}
                value={formDays}
                onChangeText={setFormDays}
                keyboardType="number-pad"
              />
              <Text style={styles.label}>Price (VND)</Text>
              <TextInput
                style={styles.input}
                value={
                  formPrice
                    ? parseInt(formPrice, 10).toLocaleString("vi-VN")
                    : ""
                }
                onChangeText={(v) => setFormPrice(v.replace(/[^0-9]/g, ""))}
                keyboardType="number-pad"
                placeholder="150,000"
                placeholderTextColor={theme.dimmed}
              />
              <Text style={styles.label}>Perks (optional)</Text>
              <TextInput
                style={[styles.input, { height: 72 }]}
                value={formPerks}
                onChangeText={setFormPerks}
                multiline
              />
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
