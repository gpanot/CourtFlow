import { View, StyleSheet, Platform, type ViewStyle } from "react-native";

/**
 * Ambient depth behind CourtPay glass surfaces — soft color wells, no blur (performance).
 */
export function CourtPayLiquidBackdrop() {
  return (
    <View style={StyleSheet.absoluteFill} pointerEvents="none">
      <View style={styles.base} />
      <View style={[styles.orb, styles.orbViolet]} />
      <View style={[styles.orb, styles.orbFuchsia]} />
      <View style={[styles.orb, styles.orbBlue]} />
      <View style={styles.vignette} />
    </View>
  );
}

const orbBase: ViewStyle = {
  position: "absolute",
  borderRadius: 9999,
};

const styles = StyleSheet.create({
  base: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: "#030108",
  },
  orb: {
    ...orbBase,
  },
  orbViolet: {
    width: 440,
    height: 440,
    top: -140,
    left: -100,
    backgroundColor: "rgba(124, 58, 237, 0.22)",
    opacity: 0.9,
  },
  orbFuchsia: {
    width: 380,
    height: 380,
    bottom: -120,
    right: -80,
    backgroundColor: "rgba(192, 38, 211, 0.2)",
    opacity: 0.85,
  },
  orbBlue: {
    width: 320,
    height: 320,
    top: "36%",
    left: "18%",
    backgroundColor: "rgba(59, 130, 246, 0.08)",
    opacity: 0.9,
  },
  vignette: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: "rgba(0, 0, 0, 0.35)",
    ...(Platform.OS === "ios"
      ? ({ borderCurve: "continuous" } as ViewStyle)
      : null),
  },
});
