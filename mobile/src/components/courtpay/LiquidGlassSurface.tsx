import React, { type ReactNode } from "react";
import {
  View,
  StyleSheet,
  Platform,
  type StyleProp,
  type ViewStyle,
} from "react-native";
import { BlurView } from "expo-blur";

export type LiquidGlassAccent = "none" | "fuchsia" | "amber";

type Props = {
  children: ReactNode;
  style?: StyleProp<ViewStyle>;
  /** iOS: typical 28–55; Android blur is heavier, default bumped. */
  intensity?: number;
  accent?: LiquidGlassAccent;
};

export function LiquidGlassSurface({
  children,
  style,
  intensity = Platform.OS === "ios" ? 48 : 80,
  accent = "none",
}: Props) {
  return (
    <View style={[styles.shell, style]}>
      <BlurView
        tint="dark"
        intensity={intensity}
        style={StyleSheet.absoluteFill}
      />
      {accent === "fuchsia" ? (
        <View style={styles.accentFuchsia} pointerEvents="none" />
      ) : null}
      {accent === "amber" ? (
        <View style={styles.accentAmber} pointerEvents="none" />
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
  accentFuchsia: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: "rgba(192, 38, 211, 0.11)",
    zIndex: 0,
  },
  accentAmber: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: "rgba(245, 158, 11, 0.09)",
    zIndex: 0,
  },
});
