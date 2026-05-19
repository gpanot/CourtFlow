import React from "react";
import { View, Text, StyleSheet } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { useAppColors } from "../theme/use-app-colors";

export function BillingBlockedBanner() {
  const theme = useAppColors();
  const styles = React.useMemo(
    () =>
      StyleSheet.create({
        container: {
          alignItems: "center",
          justifyContent: "center",
          gap: 12,
          borderWidth: 1,
          borderColor: "rgba(180, 130, 30, 0.3)",
          backgroundColor: "rgba(120, 80, 10, 0.12)",
          borderRadius: 12,
          paddingHorizontal: 24,
          paddingVertical: 48,
          marginHorizontal: 16,
          marginTop: 24,
        },
        title: {
          fontSize: 14,
          fontWeight: "600",
          color: theme.amber400,
          textAlign: "center",
        },
        message: {
          fontSize: 13,
          color: theme.muted,
          textAlign: "center",
          lineHeight: 20,
          maxWidth: 300,
        },
        hint: {
          fontSize: 12,
          color: theme.subtle,
          textAlign: "center",
        },
        hintBold: {
          fontWeight: "600",
          color: theme.text,
        },
      }),
    [theme]
  );

  return (
    <View style={styles.container}>
      <Ionicons name="warning" size={36} color={theme.amber400} />
      <Text style={styles.title}>Unpaid billing</Text>
      <Text style={styles.message}>
        You have unpaid bills so you can&apos;t see the content of this page.
        Pay the bill to get full access.
      </Text>
      <Text style={styles.hint}>
        Go to <Text style={styles.hintBold}>Boss Dashboard</Text> &gt;{" "}
        <Text style={styles.hintBold}>Billing</Text>
      </Text>
    </View>
  );
}
