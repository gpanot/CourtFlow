import React, { useState } from "react";
import {
  View,
  Text,
  TouchableOpacity,
  StyleSheet,
  Alert,
  ActivityIndicator,
  TextInput,
} from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { StackActions } from "@react-navigation/native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { api } from "../../lib/api-client";
import { useAuthStore } from "../../stores/auth-store";
import { useThemeStore, ACCENT_MAP, type CourtPayAccent } from "../../stores/theme-store";
import { useAppColors } from "../../theme/use-app-colors";
import type { CourtsState } from "../../types/api";
import type { TabletStackScreenProps } from "../../navigation/types";
import { TABLET_KIOSK_PIN } from "../../lib/tablet-kiosk";

type Phase = "select" | "locked" | "pin_entry";

export function TabletModeSelectScreen({
  navigation,
}: TabletStackScreenProps<"TabletModeSelect">) {
  const insets = useSafeAreaInsets();
  const venueId = useAuthStore((s) => s.venueId);
  const themeMode = useThemeStore((s) => s.mode);
  const toggleTheme = useThemeStore((s) => s.toggleMode);
  const accent = useThemeStore((s) => s.accent);
  const setAccent = useThemeStore((s) => s.setAccent);
  const t = useAppColors();
  const [phase, setPhase] = useState<Phase>("select");
  const [loading, setLoading] = useState(false);
  const [pinInput, setPinInput] = useState("");

  const checkSessionAndNavigate = async (
    mode: "CourtPayCheckIn"
  ) => {
    if (!venueId) return;
    setLoading(true);
    try {
      const data = await api.get<CourtsState>(
        `/api/courts/state?venueId=${venueId}`
      );
      if (!data.session || data.session.status !== "open") {
        Alert.alert(
          "No Active Session",
          "Please open a session from the Staff Dashboard before using tablet mode."
        );
        return;
      }
      navigation.navigate(mode);
    } catch {
      Alert.alert("Error", "Could not verify session status.");
    } finally {
      setLoading(false);
    }
  };

  const handlePinSubmit = () => {
    if (pinInput === TABLET_KIOSK_PIN) {
      setPinInput("");
      setPhase("select");
    } else {
      Alert.alert("Wrong PIN", "Please try again.");
      setPinInput("");
    }
  };

  if (phase === "pin_entry") {
    return (
      <View style={[styles.container, { paddingTop: insets.top + 40, backgroundColor: t.bg }]}>
        <View style={styles.pinContainer}>
          <Ionicons name="lock-closed" size={44} color={t.blue500} />
          <Text style={[styles.pinTitle, { color: t.text }]}>Enter PIN to unlock</Text>
          <TextInput
            style={[styles.pinInput, { backgroundColor: t.card, color: t.text, borderColor: t.border }]}
            value={pinInput}
            onChangeText={setPinInput}
            keyboardType="numeric"
            maxLength={4}
            secureTextEntry
            placeholder="____"
            placeholderTextColor={t.subtle}
            textAlign="center"
            onSubmitEditing={handlePinSubmit}
            autoFocus
          />
          <TouchableOpacity
            style={[styles.primaryBtn, { backgroundColor: t.blue600 }]}
            onPress={handlePinSubmit}
            activeOpacity={0.7}
          >
            <Text style={styles.primaryBtnText}>Unlock</Text>
          </TouchableOpacity>
        </View>
      </View>
    );
  }

  const isLight = themeMode === "light";

  return (
    <View style={[styles.container, { paddingTop: insets.top + 40, backgroundColor: t.bg }]}>
      <View style={styles.header}>
        <Text style={[styles.title, { color: t.text }]}>Select Tablet Mode</Text>
        <Text style={[styles.subtitle, { color: t.muted }]}>
          Choose how this device will be used
        </Text>
      </View>

      <View style={styles.cards}>
        <TouchableOpacity
          style={[styles.card, { backgroundColor: t.card, borderColor: t.border }]}
          onPress={() => checkSessionAndNavigate("CourtPayCheckIn")}
          disabled={loading}
          activeOpacity={0.7}
        >
          <View style={styles.cardIconGreen}>
            <Ionicons name="card-outline" size={32} color="#22c55e" />
          </View>
          <Text style={[styles.cardTitle, { color: t.text }]}>CourtPay Check-in</Text>
          <Text style={[styles.cardDesc, { color: t.muted }]}>
            Payment-first check-in with subscription support
          </Text>
        </TouchableOpacity>
      </View>

      {/* Dark / Light mode toggle */}
      <TouchableOpacity
        style={[styles.themeRow, { backgroundColor: t.card, borderColor: t.border }]}
        onPress={toggleTheme}
        activeOpacity={0.7}
      >
        <View style={[styles.themeIconWrap, { backgroundColor: isLight ? "rgba(15,23,42,0.08)" : "rgba(255,255,255,0.1)" }]}>
          <Ionicons
            name={isLight ? "sunny" : "moon"}
            size={18}
            color={isLight ? "#f59e0b" : "#facc15"}
          />
        </View>
        <View style={styles.themeTextCol}>
          <Text style={[styles.themeLabel, { color: t.text }]}>
            {isLight ? "Light Mode" : "Dark Mode"}
          </Text>
          <Text style={[styles.themeHint, { color: t.muted }]}>
            Applies to CourtPay kiosk screens
          </Text>
        </View>
        <View style={[styles.themeToggleTrack, isLight ? styles.themeToggleTrackLight : styles.themeToggleTrackDark]}>
          <View style={[styles.themeToggleThumb, isLight ? styles.themeToggleThumbLight : styles.themeToggleThumbDark]} />
        </View>
      </TouchableOpacity>

      {/* Accent color picker */}
      <View style={[styles.accentRow, { backgroundColor: t.card, borderColor: t.border }]}>
        <Text style={[styles.accentLabel, { color: t.text }]}>Accent Color</Text>
        <View style={styles.accentSwatches}>
          {(["green", "fuchsia", "blue", "amber"] as CourtPayAccent[]).map((a) => (
            <TouchableOpacity
              key={a}
              onPress={() => setAccent(a)}
              activeOpacity={0.75}
              style={[
                styles.swatch,
                { backgroundColor: ACCENT_MAP[a].primary },
                accent === a && styles.swatchActive,
              ]}
            >
              {accent === a && (
                <Ionicons name="checkmark" size={14} color="#fff" />
              )}
            </TouchableOpacity>
          ))}
        </View>
      </View>

      {loading && (
        <ActivityIndicator
          size="large"
          color={t.blue500}
          style={{ marginTop: 20 }}
        />
      )}

      <TouchableOpacity
        style={styles.backBtn}
        onPress={() => {
          const state = navigation.getState();
          if (state && state.index > 0) {
            navigation.dispatch(StackActions.popToTop());
          } else {
            navigation.navigate("TabletVenueSelect");
          }
        }}
        activeOpacity={0.7}
      >
        <Ionicons name="arrow-back" size={16} color={t.muted} />
        <Text style={[styles.backText, { color: t.muted }]}>Back to Venues</Text>
      </TouchableOpacity>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    paddingHorizontal: 20,
  },
  header: { marginBottom: 32, alignItems: "center" },
  title: { fontSize: 26, fontWeight: "700" },
  subtitle: { fontSize: 14, marginTop: 6 },
  cards: { gap: 14 },
  card: {
    borderRadius: 16,
    padding: 24,
    borderWidth: 1,
    alignItems: "center",
  },
  cardIconGreen: {
    width: 64,
    height: 64,
    borderRadius: 16,
    backgroundColor: "rgba(34,197,94,0.13)",
    justifyContent: "center",
    alignItems: "center",
    marginBottom: 14,
  },
  cardTitle: { fontSize: 19, fontWeight: "700", marginBottom: 4 },
  cardDesc: { fontSize: 14, textAlign: "center", lineHeight: 20 },

  // ── Theme toggle row ──
  themeRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    marginTop: 20,
    borderRadius: 14,
    paddingVertical: 14,
    paddingHorizontal: 16,
    borderWidth: 1,
  },
  themeIconWrap: {
    width: 36,
    height: 36,
    borderRadius: 10,
    alignItems: "center",
    justifyContent: "center",
  },
  themeTextCol: { flex: 1, gap: 2 },
  themeLabel: { fontSize: 15, fontWeight: "600" },
  themeHint: { fontSize: 12 },
  themeToggleTrack: {
    width: 44,
    height: 26,
    borderRadius: 13,
    justifyContent: "center",
    paddingHorizontal: 3,
  },
  themeToggleTrackDark: {
    backgroundColor: "rgba(255,255,255,0.16)",
  },
  themeToggleTrackLight: {
    backgroundColor: "rgba(34,197,94,0.35)",
  },
  themeToggleThumb: {
    width: 20,
    height: 20,
    borderRadius: 10,
  },
  themeToggleThumbDark: {
    backgroundColor: "#a3a3a3",
    alignSelf: "flex-start",
  },
  themeToggleThumbLight: {
    backgroundColor: "#fff",
    alignSelf: "flex-end",
  },

  // ── Accent color picker ──
  accentRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    marginTop: 12,
    borderRadius: 14,
    paddingVertical: 14,
    paddingHorizontal: 16,
    borderWidth: 1,
  },
  accentLabel: { fontSize: 15, fontWeight: "600" },
  accentSwatches: {
    flexDirection: "row",
    gap: 10,
  },
  swatch: {
    width: 32,
    height: 32,
    borderRadius: 16,
    alignItems: "center",
    justifyContent: "center",
  },
  swatchActive: {
    borderWidth: 2.5,
    borderColor: "#fff",
    shadowColor: "#000",
    shadowOpacity: 0.3,
    shadowRadius: 4,
    shadowOffset: { width: 0, height: 2 },
    elevation: 4,
  },

  backBtn: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
    marginTop: 28,
    padding: 14,
  },
  backText: { fontSize: 14 },
  pinContainer: {
    flex: 1,
    justifyContent: "center",
    alignItems: "center",
    gap: 18,
  },
  pinTitle: { fontSize: 19, fontWeight: "600" },
  pinInput: {
    borderRadius: 12,
    width: 160,
    height: 52,
    fontSize: 26,
    letterSpacing: 12,
    borderWidth: 1,
  },
  primaryBtn: {
    borderRadius: 10,
    paddingHorizontal: 36,
    height: 44,
    justifyContent: "center",
    alignItems: "center",
  },
  primaryBtnText: { color: "#fff", fontSize: 15, fontWeight: "600" },
});
