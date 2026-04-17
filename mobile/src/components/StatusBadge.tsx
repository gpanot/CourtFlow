import React from "react";
import { View, Text, StyleSheet } from "react-native";

interface Props {
  label: string;
  variant?: "success" | "warning" | "error" | "neutral" | "info";
}

const COLORS = {
  success: { bg: "#22c55e20", text: "#22c55e" },
  warning: { bg: "#f59e0b20", text: "#f59e0b" },
  error: { bg: "#ef444420", text: "#ef4444" },
  neutral: { bg: "#73737320", text: "#737373" },
  info: { bg: "#3b82f620", text: "#3b82f6" },
};

export function StatusBadge({ label, variant = "neutral" }: Props) {
  const colors = COLORS[variant];
  return (
    <View style={[styles.badge, { backgroundColor: colors.bg }]}>
      <Text style={[styles.text, { color: colors.text }]}>{label}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  badge: {
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 8,
    alignSelf: "flex-start",
  },
  text: {
    fontSize: 12,
    fontWeight: "600",
    textTransform: "capitalize",
  },
});
