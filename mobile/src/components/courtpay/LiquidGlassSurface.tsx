import React, { type ReactNode } from "react";
import {
  View,
  StyleSheet,
  Platform,
  type StyleProp,
  type ViewStyle,
} from "react-native";
import { BlurView } from "expo-blur";

export type LiquidGlassAccent = "none" | "fuchsia" | "green" | "amber";

type Props = {
  children: ReactNode;
  style?: StyleProp<ViewStyle>;
  /** iOS: typical 28–55; Android blur is heavier, default bumped. */
  intensity?: number;
  accent?: LiquidGlassAccent;
  /** Dynamic tint color — overrides named `accent` when provided. */
  tintColor?: string;
};

export function LiquidGlassSurface({
  children,
  style,
  intensity = Platform.OS === "ios" ? 48 : 80,
  accent = "none",
  tintColor,
}: Props) {
  const resolvedTint: string | null =
    tintColor ?? (
      accent === "fuchsia" ? "rgba(192, 38, 211, 0.11)" :
      accent === "green"   ? "rgba(34, 197, 94, 0.10)" :
      accent === "amber"   ? "rgba(245, 158, 11, 0.09)" :
      null
    );

  return (
    <View style={[styles.shell, style]}>
      <BlurView
        tint="dark"
        intensity={intensity}
        style={StyleSheet.absoluteFill}
      />
      {resolvedTint ? (
        <View style={[styles.accentOverlay, { backgroundColor: resolvedTint }]} pointerEvents="none" />
      ) : null}
      <View style={styles.specular} pointerEvents="none" />
      <View style={styles.content}>{children}</View>
    </View>
  );
}

const styles = StyleSheet.create({
  shell: {
    overflow: "hidden",
    position: "relative",
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.14)",
    ...(Platform.OS === "ios"
      ? ({ borderCurve: "continuous" } as ViewStyle)
      : null),
  },
  content: {
    position: "relative",
    zIndex: 2,
    width: "100%",
    minWidth: 0,
  },
  specular: {
    position: "absolute",
    top: 0,
    left: "12%",
    right: "12%",
    height: StyleSheet.hairlineWidth * 2,
    borderRadius: 2,
    backgroundColor: "rgba(255,255,255,0.28)",
    zIndex: 1,
  },
  accentOverlay: {
    ...StyleSheet.absoluteFillObject,
    zIndex: 0,
  },
});
