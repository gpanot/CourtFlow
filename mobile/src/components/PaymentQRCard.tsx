import React from "react";
import { View, Text, Image, StyleSheet, ActivityIndicator } from "react-native";

interface Props {
  qrUrl: string | null;
  amount: number;
  paymentRef: string;
  waiting?: boolean;
  refLabel?: string;
  waitingLabel?: string;
}

export function PaymentQRCard({ qrUrl, amount, paymentRef, waiting, refLabel = "Ref:", waitingLabel = "Waiting for payment..." }: Props) {
  return (
    <View style={styles.container}>
      {qrUrl ? (
        <View style={styles.qrWrap}>
          <Image
            source={{ uri: qrUrl }}
            style={styles.qrImage}
            resizeMode="contain"
          />
        </View>
      ) : null}
      <Text style={styles.amount}>{amount.toLocaleString()} VND</Text>
      <Text style={styles.ref}>{refLabel} {paymentRef}</Text>
      {waiting && (
        <>
          <ActivityIndicator color="#3b82f6" style={{ marginTop: 12 }} />
          <Text style={styles.waitText}>{waitingLabel}</Text>
        </>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    alignItems: "center",
    gap: 8,
  },
  qrWrap: {
    backgroundColor: "#fff",
    borderRadius: 16,
    padding: 16,
    marginBottom: 8,
  },
  qrImage: {
    width: 240,
    height: 240,
  },
  amount: {
    fontSize: 24,
    fontWeight: "700",
    color: "#fff",
  },
  ref: {
    fontSize: 13,
    color: "#737373",
    fontFamily: "monospace",
  },
  waitText: {
    color: "#a3a3a3",
    fontSize: 14,
    marginTop: 4,
  },
});
