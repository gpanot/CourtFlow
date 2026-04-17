import React from "react";
import { View, Text, TouchableOpacity, StyleSheet } from "react-native";
import { Ionicons } from "@expo/vector-icons";

interface Props {
  title: string;
  subtitle?: string;
  buttonText?: string;
  onPress: () => void;
}

export function SuccessView({
  title,
  subtitle,
  buttonText = "Done",
  onPress,
}: Props) {
  return (
    <View style={styles.container}>
      <View style={styles.circle}>
        <Ionicons name="checkmark" size={56} color="#22c55e" />
      </View>
      <Text style={styles.title}>{title}</Text>
      {subtitle ? <Text style={styles.subtitle}>{subtitle}</Text> : null}
      <TouchableOpacity style={styles.btn} onPress={onPress}>
        <Text style={styles.btnText}>{buttonText}</Text>
      </TouchableOpacity>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    alignItems: "center",
    paddingTop: 48,
    gap: 16,
  },
  circle: {
    width: 108,
    height: 108,
    borderRadius: 54,
    backgroundColor: "#22c55e20",
    justifyContent: "center",
    alignItems: "center",
  },
  title: {
    fontSize: 28,
    fontWeight: "700",
    color: "#fff",
  },
  subtitle: {
    fontSize: 15,
    color: "#a3a3a3",
    textAlign: "center",
  },
  btn: {
    backgroundColor: "#3b82f6",
    borderRadius: 14,
    paddingHorizontal: 40,
    height: 52,
    justifyContent: "center",
    alignItems: "center",
    marginTop: 12,
  },
  btnText: {
    color: "#fff",
    fontSize: 17,
    fontWeight: "600",
  },
});
