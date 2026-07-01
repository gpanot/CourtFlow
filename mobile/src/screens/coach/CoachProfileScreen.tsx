import React, { useCallback, useEffect, useState } from "react";
import {
  ActivityIndicator,
  Alert,
  Image,
  KeyboardAvoidingView,
  Platform,
  ScrollView,
  StyleSheet,
  Switch,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { CommonActions, useNavigation } from "@react-navigation/native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useAuthStore } from "../../stores/auth-store";
import { api } from "../../lib/api-client";
import { pickCoachPhoto, prepareCoachPhoto, uploadCoachPhoto } from "../../lib/coach-photo-upload";
import { resolveMediaUrl } from "../../lib/media-url";
import { logoutUnregisterStaffPush } from "../../hooks/useStaffPushRegistration";
import { useAppColors } from "../../theme/use-app-colors";
import { useThemeStore } from "../../stores/theme-store";
import { useTabletKioskLocale } from "../../hooks/useTabletKioskLocale";
import type { AppColors } from "../../theme/palettes";

// ─── Types ────────────────────────────────────────────────────────────────────

interface CoachProfile {
  id: string;
  name: string;
  email: string | null;
  coachBio: string | null;
  coachPhoto: string | null;
  coachDupr: string | null;
  coachGender: string | null;
  coachLanguages: string[];
  coachSpecialties: string[];
  coachFocusLevels: string[];
  coachYearsExperience: string | null;
  coachGroupSizes: string[];
}

// ─── Constants ────────────────────────────────────────────────────────────────

const LANGUAGES = ["English", "Vietnamese", "Thai", "Japanese", "Korean"];
const SPECIALTIES = ["Pickleball", "Tennis", "Badminton", "Ping Pong"];
const FOCUS_LEVELS = ["Beginner", "Advanced", "Pro"];
const YEARS_OPTIONS = ["<2", "2-5", "5+"];
const GROUP_SIZES = ["1-1", "2", "3", "4", "4+"];
const GENDERS = ["Male", "Female", "Other"];

const toggleMulti = (arr: string[], v: string) =>
  arr.includes(v) ? arr.filter((x) => x !== v) : [...arr, v];
const toggleSingle = (cur: string, v: string) => (cur === v ? "" : v);

// ─── Pill Toggle ──────────────────────────────────────────────────────────────

function PillGroup({
  options,
  selected,
  onToggle,
  theme,
  isDark,
}: {
  options: string[];
  selected: string[];
  onToggle: (v: string) => void;
  theme: AppColors;
  isDark: boolean;
}) {
  const accent = isDark ? "#2dd4bf" : theme.green600;
  const accentBg = isDark ? "rgba(20,184,166,0.15)" : "rgba(22,163,74,0.12)";
  return (
    <View style={styles.pillRow}>
      {options.map((opt) => {
        const active = selected.includes(opt);
        return (
          <TouchableOpacity
            key={opt}
            onPress={() => onToggle(opt)}
            activeOpacity={0.7}
            style={[
              styles.pill,
              {
                borderColor: active ? accent : theme.border,
                backgroundColor: active ? accentBg : "transparent",
              },
            ]}
          >
            <Text style={[styles.pillText, { color: active ? accent : theme.muted }]}>{opt}</Text>
          </TouchableOpacity>
        );
      })}
    </View>
  );
}

// ─── Main Screen ──────────────────────────────────────────────────────────────

export function CoachProfileScreen() {
  const theme = useAppColors();
  const themeMode = useThemeStore((s) => s.mode);
  const setThemeMode = useThemeStore((s) => s.setMode);
  const toggleTheme = useThemeStore((s) => s.toggleMode);
  const isDark = themeMode === "dark";
  const accent = isDark ? "#14b8a6" : theme.green600;
  const accentLight = isDark ? "#2dd4bf" : theme.green500;
  const { t } = useTabletKioskLocale();
  const insets = useSafeAreaInsets();
  const navigation = useNavigation();
  const clearAuth = useAuthStore((s) => s.clearAuth);
  const pushEnabled = useAuthStore((s) => s.pushNotificationsEnabled);
  const setAuth = useAuthStore((s) => s.setAuth);
  const [togglingPush, setTogglingPush] = useState(false);

  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [uploadingPhoto, setUploadingPhoto] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [profile, setProfile] = useState<CoachProfile | null>(null);

  // Editable fields
  const [email, setEmail] = useState("");
  const [emailConfirm, setEmailConfirm] = useState("");
  const [bio, setBio] = useState("");
  const [photo, setPhoto] = useState("");
  const [dupr, setDupr] = useState("");
  const [gender, setGender] = useState("");
  const [languages, setLanguages] = useState<string[]>([]);
  const [specialties, setSpecialties] = useState<string[]>([]);
  const [focusLevels, setFocusLevels] = useState<string[]>([]);
  const [yearsExp, setYearsExp] = useState("");
  const [groupSizes, setGroupSizes] = useState<string[]>([]);

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      try {
        const data = await api.get<CoachProfile>("/api/admin/coach-portal/profile");
        if (!cancelled) {
          setProfile(data);
          setEmail(data.email ?? "");
          setEmailConfirm(data.email ?? "");
          setBio(data.coachBio ?? "");
          setPhoto(data.coachPhoto ?? "");
          setDupr(data.coachDupr ?? "");
          setGender(data.coachGender ?? "");
          setLanguages(data.coachLanguages ?? []);
          setSpecialties(data.coachSpecialties ?? []);
          setFocusLevels(data.coachFocusLevels ?? []);
          setYearsExp(data.coachYearsExperience ?? "");
          setGroupSizes(data.coachGroupSizes ?? []);
        }
      } catch { /* ignore */ }
      finally { if (!cancelled) setLoading(false); }
    })();
    return () => { cancelled = true; };
  }, []);

  const handleSave = useCallback(async () => {
    setErr(null);
    const trimmedEmail = email.trim();
    const trimmedConfirm = emailConfirm.trim();
    if (trimmedEmail && trimmedEmail !== trimmedConfirm) {
      setErr("Email addresses don't match. Please double-check both fields.");
      return;
    }
    if (trimmedEmail && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(trimmedEmail)) {
      setErr("Please enter a valid email address.");
      return;
    }
    setSaving(true);
    setSaved(false);
    try {
      await api.patch("/api/admin/coach-portal/profile", {
        email: trimmedEmail || null,
        coachBio: bio || null,
        coachPhoto: photo || null,
        coachDupr: dupr || null,
        coachGender: gender || null,
        coachLanguages: languages,
        coachSpecialties: specialties,
        coachFocusLevels: focusLevels,
        coachYearsExperience: yearsExp || null,
        coachGroupSizes: groupSizes,
      });
      setSaved(true);
      setTimeout(() => setSaved(false), 2500);
    } catch (e) {
      setErr(e instanceof Error ? e.message : "Failed to save");
    } finally {
      setSaving(false);
    }
  }, [email, emailConfirm, bio, photo, dupr, gender, languages, specialties, focusLevels, yearsExp, groupSizes]);

  const handlePickPhoto = useCallback(async (source: "camera" | "library") => {
    setErr(null);
    try {
      const pickedUri = await pickCoachPhoto(source);
      if (!pickedUri) return;

      setUploadingPhoto(true);
      const preparedUri = await prepareCoachPhoto(pickedUri);
      const coachPhoto = await uploadCoachPhoto(preparedUri);
      setPhoto(coachPhoto);
    } catch (e) {
      const msg = e instanceof Error ? e.message : "Failed to upload photo";
      setErr(msg);
      Alert.alert("Error", msg);
    } finally {
      setUploadingPhoto(false);
    }
  }, []);

  const handleChangePhoto = useCallback(() => {
    Alert.alert(
      t("coachPortalProfileChangePhoto"),
      undefined,
      [
        {
          text: t("coachPortalProfileTakePhoto"),
          onPress: () => void handlePickPhoto("camera"),
        },
        {
          text: t("coachPortalProfileChooseLibrary"),
          onPress: () => void handlePickPhoto("library"),
        },
        { text: t("cancel"), style: "cancel" },
      ]
    );
  }, [t, handlePickPhoto]);

  const handleRemovePhoto = useCallback(() => {
    Alert.alert(t("coachPortalProfileRemovePhoto"), t("coachPortalProfileRemovePhotoConfirm"), [
      { text: t("cancel"), style: "cancel" },
      {
        text: t("coachPortalProfileRemovePhoto"),
        style: "destructive",
        onPress: () => setPhoto(""),
      },
    ]);
  }, [t]);

  const handleSignOut = useCallback(() => {
    Alert.alert(t("coachPortalSignOut"), t("coachPortalSignOutConfirm"), [
      { text: t("cancel"), style: "cancel" },
      {
        text: t("coachPortalSignOut"),
        style: "destructive",
        onPress: () => {
          void (async () => {
            await logoutUnregisterStaffPush();
            clearAuth();
            navigation.dispatch(
              CommonActions.reset({ index: 0, routes: [{ name: "StaffLogin" as never }] })
            );
          })();
        },
      },
    ]);
  }, [t, clearAuth, navigation]);

  const handleTogglePush = useCallback(async (value: boolean) => {
    setTogglingPush(true);
    try {
      await api.post("/api/staff/push/preferences", { pushNotificationsEnabled: value });
      setAuth({ pushNotificationsEnabled: value });
    } catch {
      // revert on failure (no-op; state unchanged)
    } finally {
      setTogglingPush(false);
    }
  }, [setAuth]);

  const emailMismatch = email.length > 0 && emailConfirm.length > 0 && email !== emailConfirm;
  const emailMatch = email.length > 0 && emailConfirm.length > 0 && email === emailConfirm;

  return (
    <View style={[styles.container, { backgroundColor: theme.bg }]}>
      {/* Header */}
      <View style={[styles.header, { paddingTop: insets.top + 8, borderBottomColor: theme.border, backgroundColor: theme.bg }]}>
        <View style={styles.headerRow}>
          <View style={styles.headerLeft}>
            <TouchableOpacity
              style={[styles.backBtn, { borderColor: theme.border, backgroundColor: theme.card }]}
              onPress={() => navigation.goBack()}
              activeOpacity={0.7}
            >
              <Ionicons name="chevron-back" size={20} color={theme.textSecondary} />
            </TouchableOpacity>
            <Text style={[styles.headerTitle, { color: theme.text }]}>{t("coachPortalMyProfile")}</Text>
          </View>
          <TouchableOpacity
            style={[styles.themeBtn, { borderColor: theme.border, backgroundColor: theme.card }]}
            onPress={toggleTheme}
            activeOpacity={0.7}
            accessibilityLabel={isDark ? t("profileAppearanceLight") : t("profileAppearanceDark")}
          >
            <Ionicons
              name={isDark ? "sunny-outline" : "moon-outline"}
              size={20}
              color={theme.amber400}
            />
          </TouchableOpacity>
        </View>
      </View>

      <KeyboardAvoidingView
        style={{ flex: 1 }}
        behavior={Platform.OS === "ios" ? "padding" : undefined}
      >
        {loading ? (
          <View style={styles.centered}><ActivityIndicator color={theme.blue400} /></View>
        ) : (
          <>
            <ScrollView
              style={{ flex: 1 }}
              contentContainerStyle={[styles.scrollContent, { paddingBottom: 120 }]}
              keyboardShouldPersistTaps="handled"
              showsVerticalScrollIndicator={false}
            >
              {/* Avatar */}
              <View style={styles.avatarSection}>
                <View style={styles.avatarOuter}>
                  <View style={[styles.avatarWrap, { borderColor: theme.borderLight }]}>
                    {resolveMediaUrl(photo)
                      ? <Image source={{ uri: resolveMediaUrl(photo)! }} style={styles.avatarImg} />
                      : (
                        <View style={[styles.avatarPlaceholder, { backgroundColor: theme.cardSurface }]}>
                          <Ionicons name="person" size={40} color={theme.subtle} />
                        </View>
                      )}
                    {uploadingPhoto && (
                      <View style={styles.avatarUploadOverlay}>
                        <ActivityIndicator color="#fff" />
                      </View>
                    )}
                  </View>
                  <TouchableOpacity
                    style={[styles.cameraBtn, { backgroundColor: accent, borderColor: theme.bg }]}
                    onPress={handleChangePhoto}
                    disabled={uploadingPhoto}
                    activeOpacity={0.8}
                  >
                    <Ionicons name="camera" size={16} color="#fff" />
                  </TouchableOpacity>
                </View>
                <Text style={[styles.profileName, { color: theme.text }]}>{profile?.name}</Text>
                {photo ? (
                  <TouchableOpacity onPress={handleRemovePhoto} activeOpacity={0.7} style={styles.removePhotoBtn}>
                    <Ionicons name="trash-outline" size={13} color={theme.red400} />
                    <Text style={[styles.removePhotoText, { color: theme.red400 }]}>{t("coachPortalProfileRemovePhoto")}</Text>
                  </TouchableOpacity>
                ) : null}
              </View>

              <View style={[styles.divider, { backgroundColor: theme.border }]} />

              {/* Email */}
              <View style={styles.section}>
                <Text style={[styles.fieldLabel, { color: theme.textSecondary }]}>{t("coachPortalProfileEmail")}</Text>
                <Text style={[styles.fieldSub, { color: theme.subtle }]}>{t("coachPortalProfileEmailSub")}</Text>
                <TextInput
                  style={[
                    styles.input,
                    {
                      borderColor: emailMismatch ? "#f97316" : theme.borderLight,
                      backgroundColor: theme.card,
                      color: theme.text,
                    },
                  ]}
                  value={email}
                  onChangeText={setEmail}
                  placeholder={t("coachPortalProfileEmailPlaceholder")}
                  placeholderTextColor={theme.dimmed}
                  keyboardType="email-address"
                  autoCapitalize="none"
                  autoComplete="email"
                />
                {email.length > 0 && (
                  <View style={{ marginTop: 8, gap: 4 }}>
                    <TextInput
                      style={[
                        styles.input,
                        {
                          borderColor: emailMismatch ? "#f97316" : emailMatch ? (isDark ? "rgba(45,212,191,0.5)" : "rgba(22,163,74,0.45)") : theme.borderLight,
                          backgroundColor: theme.card,
                          color: theme.text,
                        },
                      ]}
                      value={emailConfirm}
                      onChangeText={setEmailConfirm}
                      placeholder={t("coachPortalProfileEmailConfirm")}
                      placeholderTextColor={theme.dimmed}
                      keyboardType="email-address"
                      autoCapitalize="none"
                      autoComplete="off"
                    />
                    {emailMismatch && (
                      <Text style={styles.emailError}>{t("coachPortalProfileEmailMismatch")}</Text>
                    )}
                    {emailMatch && (
                      <Text style={[styles.emailOk, { color: accentLight }]}>{t("coachPortalProfileEmailMatch")}</Text>
                    )}
                  </View>
                )}
              </View>

              <View style={[styles.divider, { backgroundColor: theme.border }]} />

              {/* DUPR */}
              <View style={styles.section}>
                <Text style={[styles.fieldLabel, { color: theme.textSecondary }]}>{t("coachPortalProfileDupr")}</Text>
                <TextInput
                  style={[styles.input, { borderColor: theme.borderLight, backgroundColor: theme.card, color: theme.text }]}
                  value={dupr}
                  onChangeText={setDupr}
                  placeholder={t("coachPortalProfileDuprPlaceholder")}
                  placeholderTextColor={theme.dimmed}
                />
              </View>

              {/* Bio */}
              <View style={styles.section}>
                <Text style={[styles.fieldLabel, { color: theme.textSecondary }]}>{t("coachPortalProfileBio")}</Text>
                <TextInput
                  style={[styles.textarea, { borderColor: theme.borderLight, backgroundColor: theme.card, color: theme.text }]}
                  value={bio}
                  onChangeText={setBio}
                  placeholder={t("coachPortalProfileBioPlaceholder")}
                  placeholderTextColor={theme.dimmed}
                  multiline
                  numberOfLines={4}
                  textAlignVertical="top"
                />
              </View>

              <View style={[styles.divider, { backgroundColor: theme.border }]} />

              {/* Gender */}
              <View style={styles.section}>
                <Text style={[styles.fieldLabel, { color: theme.textSecondary }]}>{t("coachPortalProfileGender")}</Text>
                <PillGroup
                  options={GENDERS}
                  selected={gender ? [gender] : []}
                  onToggle={(v) => setGender(toggleSingle(gender, v))}
                  theme={theme}
                  isDark={isDark}
                />
              </View>

              {/* Languages */}
              <View style={styles.section}>
                <Text style={[styles.fieldLabel, { color: theme.textSecondary }]}>{t("coachPortalProfileLanguages")}</Text>
                <PillGroup
                  options={LANGUAGES}
                  selected={languages}
                  onToggle={(v) => setLanguages(toggleMulti(languages, v))}
                  theme={theme}
                  isDark={isDark}
                />
              </View>

              {/* Specialties */}
              <View style={styles.section}>
                <Text style={[styles.fieldLabel, { color: theme.textSecondary }]}>{t("coachPortalProfileSpecialties")}</Text>
                <PillGroup
                  options={SPECIALTIES}
                  selected={specialties}
                  onToggle={(v) => setSpecialties(toggleMulti(specialties, v))}
                  theme={theme}
                  isDark={isDark}
                />
              </View>

              {/* Focus Level */}
              <View style={styles.section}>
                <Text style={[styles.fieldLabel, { color: theme.textSecondary }]}>{t("coachPortalProfileFocusLevel")}</Text>
                <PillGroup
                  options={FOCUS_LEVELS}
                  selected={focusLevels}
                  onToggle={(v) => setFocusLevels(toggleMulti(focusLevels, v))}
                  theme={theme}
                  isDark={isDark}
                />
              </View>

              {/* Years */}
              <View style={styles.section}>
                <Text style={[styles.fieldLabel, { color: theme.textSecondary }]}>{t("coachPortalProfileYearsExp")}</Text>
                <PillGroup
                  options={YEARS_OPTIONS}
                  selected={yearsExp ? [yearsExp] : []}
                  onToggle={(v) => setYearsExp(toggleSingle(yearsExp, v))}
                  theme={theme}
                  isDark={isDark}
                />
              </View>

              {/* Group Size */}
              <View style={styles.section}>
                <Text style={[styles.fieldLabel, { color: theme.textSecondary }]}>{t("coachPortalProfileGroupSize")}</Text>
                <PillGroup
                  options={GROUP_SIZES}
                  selected={groupSizes}
                  onToggle={(v) => setGroupSizes(toggleMulti(groupSizes, v))}
                  theme={theme}
                  isDark={isDark}
                />
              </View>

              <View style={[styles.divider, { backgroundColor: theme.border }]} />

              {/* Appearance / dark mode */}
              <View style={[styles.pushRow, { backgroundColor: theme.card, borderColor: theme.border }]}>
                <View style={styles.pushText}>
                  <Text style={[styles.fieldLabel, { color: theme.text }]}>{t("profileAppearance")}</Text>
                  <Text style={[styles.fieldSub, { color: theme.subtle, marginTop: 2 }]}>
                    {isDark ? t("profileAppearanceDark") : t("profileAppearanceLight")}
                  </Text>
                </View>
                <Switch
                  value={isDark}
                  onValueChange={(v) => setThemeMode(v ? "dark" : "light")}
                  trackColor={{ false: theme.borderLight, true: accent }}
                  thumbColor="#fff"
                />
              </View>

              <View style={[styles.divider, { backgroundColor: theme.border }]} />

              {/* Push Notifications toggle */}
              <View style={[styles.pushRow, { backgroundColor: theme.card, borderColor: theme.border }]}>
                <View style={styles.pushText}>
                  <Text style={[styles.fieldLabel, { color: theme.text }]}>{t("coachPortalPushTitle")}</Text>
                  <Text style={[styles.fieldSub, { color: theme.subtle, marginTop: 2 }]}>{t("coachPortalPushSubtitle")}</Text>
                </View>
                <Switch
                  value={pushEnabled}
                  onValueChange={(v) => { void handleTogglePush(v); }}
                  disabled={togglingPush}
                  trackColor={{ false: theme.border, true: accent }}
                  thumbColor="#fff"
                />
              </View>

              <View style={[styles.divider, { backgroundColor: theme.border }]} />

              <TouchableOpacity
                style={[styles.signOutBtn, { borderColor: "rgba(239,68,68,0.2)", backgroundColor: "rgba(239,68,68,0.1)" }]}
                onPress={handleSignOut}
                activeOpacity={0.7}
              >
                <Ionicons name="log-out-outline" size={18} color={theme.red400} />
                <Text style={[styles.signOutText, { color: theme.red400 }]}>{t("coachPortalSignOut")}</Text>
              </TouchableOpacity>
            </ScrollView>

            {/* Sticky footer */}
            <View style={[styles.footer, { borderTopColor: theme.border, backgroundColor: theme.bg, paddingBottom: insets.bottom + 12 }]}>
              {err && <Text style={styles.errText}>{err}</Text>}
              <TouchableOpacity
                style={[styles.saveBtn, { backgroundColor: saved ? theme.green600 : accent, opacity: saving ? 0.6 : 1 }]}
                onPress={handleSave}
                disabled={saving}
                activeOpacity={0.8}
              >
                {saving
                  ? <ActivityIndicator color="#fff" />
                  : <><Ionicons name="save-outline" size={18} color="#fff" style={{ marginRight: 8 }} />
                    <Text style={styles.saveBtnText}>{saved ? "Saved!" : t("coachPortalProfileSave")}</Text></>}
              </TouchableOpacity>
            </View>
          </>
        )}
      </KeyboardAvoidingView>
    </View>
  );
}

// ─── Styles ───────────────────────────────────────────────────────────────────

const styles = StyleSheet.create({
  container: { flex: 1 },

  header: {
    borderBottomWidth: 1,
    paddingHorizontal: 16,
    paddingBottom: 12,
  },
  headerRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 12,
  },
  headerLeft: { flexDirection: "row", alignItems: "center", gap: 12, flex: 1 },
  themeBtn: {
    width: 36,
    height: 36,
    borderRadius: 10,
    borderWidth: 1,
    justifyContent: "center",
    alignItems: "center",
  },
  backBtn: {
    width: 36,
    height: 36,
    borderRadius: 10,
    borderWidth: 1,
    justifyContent: "center",
    alignItems: "center",
  },
  headerTitle: { fontSize: 16, fontWeight: "700" },

  centered: { flex: 1, justifyContent: "center", alignItems: "center" },

  scrollContent: { padding: 20, gap: 0 },

  avatarSection: { alignItems: "center", gap: 10, marginBottom: 24 },
  avatarOuter: { position: "relative" },
  avatarWrap: {
    width: 96,
    height: 96,
    borderRadius: 48,
    overflow: "hidden",
    borderWidth: 2,
  },
  avatarImg: { width: 96, height: 96 },
  avatarPlaceholder: { width: 96, height: 96, justifyContent: "center", alignItems: "center" },
  avatarUploadOverlay: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: "rgba(0,0,0,0.55)",
    justifyContent: "center",
    alignItems: "center",
  },
  cameraBtn: {
    position: "absolute",
    right: -2,
    bottom: -2,
    width: 32,
    height: 32,
    borderRadius: 16,
    borderWidth: 2,
    justifyContent: "center",
    alignItems: "center",
  },
  profileName: { fontSize: 16, fontWeight: "700" },
  removePhotoBtn: { flexDirection: "row", alignItems: "center", gap: 4 },
  removePhotoText: { fontSize: 12 },

  divider: { height: 1, marginVertical: 16 },

  section: { gap: 8, marginBottom: 16 },
  fieldLabel: { fontSize: 14, fontWeight: "600" },
  fieldSub: { fontSize: 12, marginTop: -4 },

  input: {
    borderWidth: 1,
    borderRadius: 14,
    paddingHorizontal: 16,
    paddingVertical: 12,
    fontSize: 14,
  },
  textarea: {
    borderWidth: 1,
    borderRadius: 14,
    paddingHorizontal: 16,
    paddingVertical: 12,
    fontSize: 14,
    minHeight: 90,
  },

  emailError: { color: "#f97316", fontSize: 12, paddingLeft: 4 },
  emailOk: { fontSize: 12, paddingLeft: 4 },

  pillRow: { flexDirection: "row", flexWrap: "wrap", gap: 8 },
  pill: {
    borderWidth: 1,
    borderRadius: 20,
    paddingHorizontal: 14,
    paddingVertical: 7,
  },
  pillText: { fontSize: 13, fontWeight: "500" },

  footer: {
    borderTopWidth: 1,
    paddingHorizontal: 16,
    paddingTop: 12,
  },
  errText: { color: "#f87171", fontSize: 12, textAlign: "center", marginBottom: 8 },
  saveBtn: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    borderRadius: 16,
    paddingVertical: 15,
  },
  saveBtnText: { color: "#fff", fontSize: 15, fontWeight: "700" },

  pushRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    borderWidth: 1,
    borderRadius: 16,
    paddingHorizontal: 16,
    paddingVertical: 14,
    marginBottom: 4,
  },
  pushText: { flex: 1, paddingRight: 12 },

  signOutBtn: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
    borderWidth: 1,
    borderRadius: 16,
    paddingVertical: 14,
    marginBottom: 8,
  },
  signOutText: { fontSize: 14, fontWeight: "600" },
});
