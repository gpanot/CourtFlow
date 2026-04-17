import React, { useCallback, useRef, useState } from "react";
import {
  View,
  Text,
  TouchableOpacity,
  StyleSheet,
  Modal,
  Pressable,
} from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import {
  TABLET_ESCAPE_TAP_COUNT,
  TABLET_ESCAPE_TAP_WINDOW_MS,
  TABLET_KIOSK_PIN,
} from "../lib/tablet-kiosk";

const KEYS = ["1", "2", "3", "4", "5", "6", "7", "8", "9", "", "0", "del"] as const;

type PinPadProps = {
  onVerified: () => void;
  onCancel: () => void;
};

function PinPad({ onVerified, onCancel }: PinPadProps) {
  const insets = useSafeAreaInsets();
  const [pin, setPin] = useState("");
  const [error, setError] = useState(false);

  const addDigit = (d: string) => {
    setError(false);
    const next = pin + d;
    if (next.length === 4) {
      if (next === TABLET_KIOSK_PIN) {
        onVerified();
      } else {
        setError(true);
        setPin("");
      }
    } else {
      setPin(next);
    }
  };

  const clearPin = () => {
    setPin("");
    setError(false);
  };

  return (
    <View
      style={[
        pinStyles.wrap,
        { paddingTop: insets.top + 24, paddingBottom: insets.bottom + 24 },
      ]}
    >
      <View style={pinStyles.header}>
        <Text style={pinStyles.title}>Staff Setup</Text>
        <Text style={pinStyles.subtitle}>
          Enter PIN to configure this tablet
        </Text>
      </View>

      <View style={pinStyles.dotsRow}>
        {[0, 1, 2, 3].map((i) => (
          <View
            key={i}
            style={[
              pinStyles.dot,
              error
                ? pinStyles.dotError
                : i < pin.length
                  ? pinStyles.dotFilled
                  : pinStyles.dotEmpty,
            ]}
          />
        ))}
      </View>

      {error ? (
        <Text style={pinStyles.errorText}>Wrong PIN — try again</Text>
      ) : (
        <View style={pinStyles.errorSpacer} />
      )}

      <View style={pinStyles.grid}>
        {KEYS.map((key) =>
          key === "" ? (
            <View key="empty" style={pinStyles.keyCell} />
          ) : key === "del" ? (
            <Pressable
              key="del"
              style={({ pressed }) => [
                pinStyles.key,
                pressed && pinStyles.keyPressed,
              ]}
              onPress={clearPin}
            >
              <Ionicons name="backspace-outline" size={22} color="#d4d4d4" />
            </Pressable>
          ) : (
            <Pressable
              key={key}
              style={({ pressed }) => [
                pinStyles.key,
                pressed && pinStyles.keyPressed,
              ]}
              onPress={() => addDigit(key)}
            >
              <Text style={pinStyles.keyText}>{key}</Text>
            </Pressable>
          )
        )}
      </View>

      <TouchableOpacity onPress={onCancel} style={pinStyles.cancelBtn}>
        <Text style={pinStyles.cancelText}>Cancel</Text>
      </TouchableOpacity>
    </View>
  );
}

type TabletStaffEscapeProps = {
  onVerified: () => void;
};

/**
 * PWA parity: bottom-right ⋯ — staff taps 5× quickly (within 3s), then PIN `0000`
 * to return to tablet mode selection.
 */
export function TabletStaffEscape({ onVerified }: TabletStaffEscapeProps) {
  const insets = useSafeAreaInsets();
  const [showPin, setShowPin] = useState(false);
  const escapeTapsRef = useRef<number[]>([]);

  const handleEscapeTap = useCallback(() => {
    const now = Date.now();
    escapeTapsRef.current = [
      ...escapeTapsRef.current.filter(
        (t) => now - t < TABLET_ESCAPE_TAP_WINDOW_MS
      ),
      now,
    ];
    if (escapeTapsRef.current.length >= TABLET_ESCAPE_TAP_COUNT) {
      escapeTapsRef.current = [];
      setShowPin(true);
    }
  }, []);

  const handleVerified = useCallback(() => {
    setShowPin(false);
    onVerified();
  }, [onVerified]);

  return (
    <>
      <View
        pointerEvents="box-none"
        style={[overlayStyles.root, { zIndex: 50 }]}
      >
        <TouchableOpacity
          style={[
            overlayStyles.trigger,
            {
              bottom: Math.max(insets.bottom, 12) + 12,
              right: 12,
            },
          ]}
          onPress={handleEscapeTap}
          activeOpacity={0.75}
          accessibilityLabel="Staff: tap five times quickly to change tablet mode"
          accessibilityHint="Opens PIN entry after five quick taps"
        >
          <Ionicons name="ellipsis-horizontal" size={20} color="#737373" />
        </TouchableOpacity>
      </View>

      <Modal
        visible={showPin}
        animationType="fade"
        presentationStyle="fullScreen"
        onRequestClose={() => setShowPin(false)}
      >
        <PinPad
          onVerified={handleVerified}
          onCancel={() => setShowPin(false)}
        />
      </Modal>
    </>
  );
}

const overlayStyles = StyleSheet.create({
  root: {
    ...StyleSheet.absoluteFillObject,
  },
  trigger: {
    position: "absolute",
    width: 40,
    height: 40,
    borderRadius: 20,
    borderWidth: 1,
    borderColor: "rgba(64,64,64,0.85)",
    backgroundColor: "rgba(0,0,0,0.62)",
    justifyContent: "center",
    alignItems: "center",
    elevation: 10,
  },
});

const pinStyles = StyleSheet.create({
  wrap: {
    flex: 1,
    backgroundColor: "#000",
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: 24,
    gap: 20,
  },
  header: { alignItems: "center", marginBottom: 8 },
  title: {
    fontSize: 28,
    fontWeight: "700",
    color: "#fff",
    textAlign: "center",
  },
  subtitle: {
    marginTop: 8,
    fontSize: 17,
    color: "#a3a3a3",
    textAlign: "center",
    lineHeight: 24,
  },
  dotsRow: { flexDirection: "row", gap: 12, marginTop: 8 },
  dot: {
    width: 14,
    height: 14,
    borderRadius: 7,
  },
  dotEmpty: { backgroundColor: "#404040" },
  dotFilled: { backgroundColor: "#22c55e" },
  dotError: { backgroundColor: "#ef4444" },
  errorText: { fontSize: 14, color: "#f87171", minHeight: 20 },
  errorSpacer: { minHeight: 20 },
  grid: {
    flexDirection: "row",
    flexWrap: "wrap",
    width: 240,
    gap: 12,
    justifyContent: "center",
  },
  keyCell: { width: 72, height: 56 },
  key: {
    width: 72,
    height: 56,
    borderRadius: 16,
    backgroundColor: "#262626",
    justifyContent: "center",
    alignItems: "center",
  },
  keyPressed: { backgroundColor: "#404040" },
  keyText: { fontSize: 24, fontWeight: "700", color: "#fff" },
  cancelBtn: { marginTop: 16, padding: 12 },
  cancelText: { fontSize: 15, color: "#737373" },
});
