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
import { C } from "../../theme/colors";
import type { CourtsState } from "../../types/api";
import type { TabletStackScreenProps } from "../../navigation/types";
import { TABLET_KIOSK_PIN } from "../../lib/tablet-kiosk";

type Phase = "select" | "locked" | "pin_entry";

export function TabletModeSelectScreen({
  navigation,
}: TabletStackScreenProps<"TabletModeSelect">) {
  const insets = useSafeAreaInsets();
  const venueId = useAuthStore((s) => s.venueId);
  const [phase, setPhase] = useState<Phase>("select");
  const [loading, setLoading] = useState(false);
  const [pinInput, setPinInput] = useState("");

  const checkSessionAndNavigate = async (
    mode: "SelfCheckIn" | "CourtPayCheckIn"
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
      <View style={[styles.container, { paddingTop: insets.top + 40 }]}>
        <View style={styles.pinContainer}>
          <Ionicons name="lock-closed" size={44} color={C.blue500} />
          <Text style={styles.pinTitle}>Enter PIN to unlock</Text>
          <TextInput
            style={styles.pinInput}
            value={pinInput}
            onChangeText={setPinInput}
            keyboardType="numeric"
            maxLength={4}
            secureTextEntry
            placeholder="____"
            placeholderTextColor={C.subtle}
            textAlign="center"
            onSubmitEditing={handlePinSubmit}
            autoFocus
          />
          <TouchableOpacity
            style={styles.primaryBtn}
            onPress={handlePinSubmit}
            activeOpacity={0.7}
          >
            <Text style={styles.primaryBtnText}>Unlock</Text>
          </TouchableOpacity>
        </View>
      </View>
    );
  }

  return (
    <View style={[styles.container, { paddingTop: insets.top + 40 }]}>
      <View style={styles.header}>
        <Text style={styles.title}>Select Tablet Mode</Text>
        <Text style={styles.subtitle}>
          Choose how this device will be used
        </Text>
      </View>

      <View style={styles.cards}>
        <TouchableOpacity
          style={styles.card}
          onPress={() => checkSessionAndNavigate("CourtPayCheckIn")}
          disabled={loading}
          activeOpacity={0.7}
        >
          <View style={styles.cardIconFuchsia}>
            <Ionicons name="card-outline" size={32} color="#c026d3" />
          </View>
          <Text style={styles.cardTitle}>CourtPay Check-in</Text>
          <Text style={styles.cardDesc}>
            Payment-first check-in with subscription support
          </Text>
        </TouchableOpacity>
      </View>

      {loading && (
        <ActivityIndicator
          size="large"
          color={C.blue500}
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
        <Ionicons name="arrow-back" size={16} color={C.muted} />
        <Text style={styles.backText}>Back to Venues</Text>
      </TouchableOpacity>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: C.bg,
    paddingHorizontal: 20,
  },
  header: { marginBottom: 32, alignItems: "center" },
  title: { fontSize: 26, fontWeight: "700", color: C.text },
  subtitle: { fontSize: 14, color: C.muted, marginTop: 6 },
  cards: { gap: 14 },
  card: {
    backgroundColor: C.card,
    borderRadius: 16,
    padding: 24,
    borderWidth: 1,
    borderColor: C.border,
    alignItems: "center",
  },
  cardIconFuchsia: {
    width: 64,
    height: 64,
    borderRadius: 16,
    backgroundColor: "rgba(192,38,211,0.13)",
    justifyContent: "center",
    alignItems: "center",
    marginBottom: 14,
  },
  cardTitle: { fontSize: 19, fontWeight: "700", color: C.text, marginBottom: 4 },
  cardDesc: { fontSize: 14, color: C.muted, textAlign: "center", lineHeight: 20 },
  backBtn: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
    marginTop: 28,
    padding: 14,
  },
  backText: { color: C.muted, fontSize: 14 },
  pinContainer: {
    flex: 1,
    justifyContent: "center",
    alignItems: "center",
    gap: 18,
  },
  pinTitle: { fontSize: 19, fontWeight: "600", color: C.text },
  pinInput: {
    backgroundColor: C.card,
    borderRadius: 12,
    width: 160,
    height: 52,
    fontSize: 26,
    color: C.text,
    letterSpacing: 12,
    borderWidth: 1,
    borderColor: C.border,
  },
  primaryBtn: {
    backgroundColor: C.blue600,
    borderRadius: 10,
    paddingHorizontal: 36,
    height: 44,
    justifyContent: "center",
    alignItems: "center",
  },
  primaryBtnText: { color: "#fff", fontSize: 15, fontWeight: "600" },
});
