import React from "react";
import { View, Text, StyleSheet } from "react-native";
import { Ionicons } from "@expo/vector-icons";

interface Props {
  icon?: keyof typeof Ionicons.glyphMap;
  title: string;
  subtitle?: string;
}

export function EmptyState({
  icon = "folder-open-outline",
  title,
  subtitle,
}: Props) {
  return (
    <View style={styles.container}>
      <Ionicons name={icon} size={48} color="#262626" />
      <Text style={styles.title}>{title}</Text>
      {subtitle ? <Text style={styles.subtitle}>{subtitle}</Text> : null}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    alignItems: "center",
    paddingVertical: 48,
    gap: 12,
  },
  title: {
    fontSize: 16,
    fontWeight: "600",
    color: "#737373",
    textAlign: "center",
  },
  subtitle: {
    fontSize: 14,
    color: "#475569",
    textAlign: "center",
    maxWidth: 260,
  },
});
