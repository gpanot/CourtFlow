import React, { useEffect, useRef } from "react";
import {
  View,
  Text,
  TouchableOpacity,
  FlatList,
  StyleSheet,
  ActivityIndicator,
  Animated,
  Easing,
} from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import type { Venue } from "../types/api";
import { C } from "../theme/colors";

/** Optional per-venue session status to show indicator dots */
export type VenueSessionStatus = "open" | "closed" | "unknown";

interface Props {
  venues: Venue[];
  loading: boolean;
  onSelect: (venue: Venue) => void;
  title?: string;
  onBack?: () => void;
  /** Map of venueId → session status for showing coloured dots */
  sessionStatuses?: Record<string, VenueSessionStatus>;
}

// ── Blinking dot for open sessions ───────────────────────────────────────────
function BlinkingGreenDot() {
  const opacity = useRef(new Animated.Value(1)).current;

  useEffect(() => {
    const anim = Animated.loop(
      Animated.sequence([
        Animated.timing(opacity, {
          toValue: 0.15,
          duration: 700,
          easing: Easing.inOut(Easing.ease),
          useNativeDriver: true,
        }),
        Animated.timing(opacity, {
          toValue: 1,
          duration: 700,
          easing: Easing.inOut(Easing.ease),
          useNativeDriver: true,
        }),
      ])
    );
    anim.start();
    return () => anim.stop();
  }, [opacity]);

  return (
    <Animated.View style={[styles.statusDot, styles.statusDotGreen, { opacity }]} />
  );
}

// ── Static red dot for closed/no session ─────────────────────────────────────
function RedDot() {
  return <View style={[styles.statusDot, styles.statusDotRed]} />;
}

// ── Venue row with optional session dot ──────────────────────────────────────
function VenueRow({
  item,
  onSelect,
  sessionStatus,
}: {
  item: Venue;
  onSelect: (v: Venue) => void;
  sessionStatus?: VenueSessionStatus;
}) {
  return (
    <TouchableOpacity
      style={styles.card}
      onPress={() => onSelect(item)}
      activeOpacity={0.7}
    >
      <View style={styles.iconWrap}>
        <Ionicons name="location-outline" size={22} color={C.blue500} />
      </View>
      <View style={styles.cardText}>
        <Text style={styles.venueName}>{item.name}</Text>
        {item.code ? <Text style={styles.venueCode}>{item.code}</Text> : null}
      </View>
      {sessionStatus != null && (
        <View style={styles.dotWrap}>
          {sessionStatus === "open" ? <BlinkingGreenDot /> : <RedDot />}
        </View>
      )}
      <Ionicons name="chevron-forward" size={18} color={C.subtle} />
    </TouchableOpacity>
  );
}

export function VenueSelectList({
  venues,
  loading,
  onSelect,
  title = "Select Venue",
  onBack,
  sessionStatuses,
}: Props) {
  const insets = useSafeAreaInsets();

  if (loading) {
    return (
      <View style={styles.center}>
        <ActivityIndicator size="large" color={C.blue500} />
      </View>
    );
  }

  return (
    <View style={[styles.container, { paddingTop: insets.top + 24 }]}>
      <View style={styles.headerRow}>
        {onBack ? (
          <TouchableOpacity
            style={styles.backBtn}
            onPress={onBack}
            hitSlop={10}
            activeOpacity={0.7}
          >
            <Ionicons name="arrow-back" size={22} color={C.subtle} />
          </TouchableOpacity>
        ) : (
          <View style={styles.backBtnPlaceholder} />
        )}
        <Text style={styles.title}>{title}</Text>
      </View>
      <FlatList
        data={venues}
        keyExtractor={(v) => v.id}
        contentContainerStyle={styles.list}
        renderItem={({ item }) => (
          <VenueRow
            item={item}
            onSelect={onSelect}
            sessionStatus={sessionStatuses?.[item.id]}
          />
        )}
        ListEmptyComponent={
          <Text style={styles.empty}>No venues assigned to your account.</Text>
        }
      />
    </View>
  );
}

const styles = StyleSheet.create({
  statusDot: {
    width: 10,
    height: 10,
    borderRadius: 5,
    marginRight: 8,
  },
  statusDotGreen: {
    backgroundColor: "#22c55e",
  },
  statusDotRed: {
    backgroundColor: "#ef4444",
  },
  dotWrap: {
    justifyContent: "center",
    alignItems: "center",
  },
  container: {
    flex: 1,
    backgroundColor: C.bg,
    paddingHorizontal: 20,
  },
  center: {
    flex: 1,
    backgroundColor: C.bg,
    justifyContent: "center",
    alignItems: "center",
  },
  title: {
    flex: 1,
    fontSize: 22,
    fontWeight: "700",
    color: C.text,
    textAlign: "center",
  },
  headerRow: {
    flexDirection: "row",
    alignItems: "center",
    marginBottom: 20,
  },
  backBtn: {
    width: 36,
    height: 36,
    borderRadius: 10,
    alignItems: "center",
    justifyContent: "center",
  },
  backBtnPlaceholder: {
    width: 36,
    height: 36,
  },
  list: {
    gap: 10,
    paddingBottom: 40,
  },
  card: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: C.card,
    borderRadius: 12,
    padding: 16,
    borderWidth: 1,
    borderColor: C.border,
  },
  iconWrap: {
    width: 40,
    height: 40,
    borderRadius: 10,
    backgroundColor: C.bg,
    justifyContent: "center",
    alignItems: "center",
    marginRight: 12,
  },
  cardText: { flex: 1 },
  venueName: { fontSize: 15, fontWeight: "600", color: C.text },
  venueCode: { fontSize: 13, color: C.subtle, marginTop: 2 },
  empty: {
    color: C.subtle,
    textAlign: "center",
    marginTop: 40,
    fontSize: 14,
  },
});
