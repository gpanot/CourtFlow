import React from "react";
import {
  View,
  Text,
  TouchableOpacity,
  FlatList,
  StyleSheet,
  ActivityIndicator,
} from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import type { Venue } from "../types/api";
import { C } from "../theme/colors";

interface Props {
  venues: Venue[];
  loading: boolean;
  onSelect: (venue: Venue) => void;
  title?: string;
  onBack?: () => void;
}

export function VenueSelectList({
  venues,
  loading,
  onSelect,
  title = "Select Venue",
  onBack,
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
              {item.code ? (
                <Text style={styles.venueCode}>{item.code}</Text>
              ) : null}
            </View>
            <Ionicons name="chevron-forward" size={18} color={C.subtle} />
          </TouchableOpacity>
        )}
        ListEmptyComponent={
          <Text style={styles.empty}>No venues assigned to your account.</Text>
        }
      />
    </View>
  );
}

const styles = StyleSheet.create({
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
