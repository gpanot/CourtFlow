import React, { useMemo } from "react";
import { View, Text, StyleSheet, ActivityIndicator } from "react-native";
import QRCode from "react-native-qrcode-svg";
import { buildVietQRPayload } from "../lib/vietqr-payload";

interface Props {
  qrUrl: string | null;
  amount: number;
  paymentRef: string;
  waiting?: boolean;
  refLabel?: string;
  waitingLabel?: string;
  bankBin?: string | null;
  bankAccount?: string | null;
}

export function PaymentQRCard({ qrUrl, amount, paymentRef, waiting, refLabel = "Ref:", waitingLabel = "Waiting for payment...", bankBin, bankAccount }: Props) {
  const qrPayload = useMemo(() => {
    if (bankBin && bankAccount) {
      return buildVietQRPayload({ bankBin, accountNumber: bankAccount, amount, paymentRef });
    }
    return null;
  }, [bankBin, bankAccount, amount, paymentRef]);

  return (
    <View style={styles.container}>
      {qrPayload ? (
        <View style={styles.qrWrap}>
          <QRCode value={qrPayload} size={240} backgroundColor="#ffffff" color="#000000" ecl="M" />
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
