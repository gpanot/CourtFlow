import { View, StyleSheet, Platform, type ViewStyle } from "react-native";
import { ACCENT_MAP, type ThemeMode, type CourtPayAccent } from "../../stores/theme-store";

type Props = {
  mode?: ThemeMode;
  accent?: CourtPayAccent;
};

/**
 * Ambient depth behind CourtPay glass surfaces — soft color wells, no blur (performance).
 * The accent orb color matches the selected CourtPay accent; in light mode opacities are reduced.
 */
export function CourtPayLiquidBackdrop({ mode = "dark", accent = "green" }: Props) {
  const isLight = mode === "light";
  const orbColor = ACCENT_MAP[accent].orbColor;
  const baseColor = isLight ? ACCENT_MAP[accent].backdropBaseLight : ACCENT_MAP[accent].backdropBase;
  const orbOpacity = isLight ? 0.55 : 0.85;
  const orbOpacityDim = isLight ? 0.5 : 0.9;

  return (
    <View style={StyleSheet.absoluteFill} pointerEvents="none">
      <View style={[styles.base, { backgroundColor: baseColor }]} />
      <View
        style={[
          styles.orb,
          styles.orbViolet,
          isLight && styles.orbVioletLight,
        ]}
      />
      {/* Dynamic accent orb */}
      <View
        style={[
          styles.orb,
          styles.orbAccent,
          { backgroundColor: orbColor, opacity: orbOpacity },
        ]}
      />
      <View
        style={[styles.orb, styles.orbBlue, { opacity: orbOpacityDim }]}
      />
      <View
        style={[styles.vignette, isLight && styles.vignetteLight]}
      />
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
  orbVioletLight: {
    backgroundColor: "rgba(124, 58, 237, 0.14)",
    opacity: 0.6,
  },
  orbAccent: {
    width: 380,
    height: 380,
    bottom: -120,
    right: -80,
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
  vignetteLight: {
    backgroundColor: "rgba(255, 255, 255, 0.25)",
  },
});
