import React from "react";
import {
  View,
  Text,
  TouchableOpacity,
  ScrollView,
  Image,
  StyleSheet,
  Platform,
} from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { LiquidGlassSurface, type LiquidGlassAccent } from "./LiquidGlassSurface";

export type CourtPayStatusVariant = "already_paid" | "existing_user";

interface Props {
  variant: CourtPayStatusVariant;
  playerName?: string;
  /** Pre-translated title to show (e.g. "{{name}} already paid" or "Already paid"). Falls back to built-in English if omitted. */
  playerNameAlreadyPaidLabel?: string;
  /** Pre-translated fallback when playerName is absent (e.g. "Existing player"). */
  noNameFallback?: string;
  subtitle?: string;
  faceBase64?: string | null;
  onPrimaryAction: () => void;
  primaryLabel: string;
  mode?: "light" | "dark";
}

const AMBER_CIRCLE = "rgba(245, 158, 11, 0.15)";
const AMBER_COLOR = "#f59e0b";
const FACE_SIZE = 144;

export function CourtPayStatusCard({
  variant,
  playerName,
  playerNameAlreadyPaidLabel,
  noNameFallback,
  subtitle,
  faceBase64,
  onPrimaryAction,
  primaryLabel,
  mode = "dark",
}: Props) {
  const accent: LiquidGlassAccent = "amber";
  const isLight = mode === "light";

  return (
    <ScrollView
      contentContainerStyle={styles.scroll}
      keyboardShouldPersistTaps="handled"
    >
      <View style={styles.inner}>
        <LiquidGlassSurface style={styles.glass} accent={accent} mode={mode}>
          <View style={styles.glassInner}>
            {faceBase64 ? (
              <View style={styles.faceCircle}>
                <Image
                  source={{ uri: `data:image/jpeg;base64,${faceBase64}` }}
                  style={styles.faceImage}
                  resizeMode="cover"
                />
              </View>
            ) : (
              <View style={styles.iconCircle}>
                <Ionicons
                  name={
                    variant === "already_paid"
                      ? "checkmark-circle-outline"
                      : "person-circle-outline"
                  }
                  size={56}
                  color={AMBER_COLOR}
                />
              </View>
            )}

            <Text style={[styles.title, isLight && styles.titleLight]}>
              {playerName
                ? variant === "already_paid"
                  ? (playerNameAlreadyPaidLabel ?? `${playerName} already paid`)
                  : playerName
                : variant === "already_paid"
                  ? (noNameFallback ?? "Already paid")
                  : (noNameFallback ?? "Existing player")}
            </Text>

            {subtitle ? (
              <Text style={[styles.subtitle, isLight && styles.subtitleLight]}>{subtitle}</Text>
            ) : null}

            <TouchableOpacity
              style={styles.btn}
              onPress={onPrimaryAction}
              activeOpacity={0.85}
            >
              <Text style={styles.btnText}>{primaryLabel}</Text>
            </TouchableOpacity>
          </View>
        </LiquidGlassSurface>
      </View>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  scroll: {
    flexGrow: 1,
    justifyContent: "center",
    paddingVertical: 32,
    paddingHorizontal: 12,
  },
  inner: {
    width: "100%",
    maxWidth: 420,
    alignSelf: "center",
    alignItems: "center",
    gap: 16,
  },
  glass: {
    width: "100%",
    borderRadius: 28,
    ...(Platform.OS === "ios"
      ? ({ borderCurve: "continuous" } as const)
      : null),
  },
  glassInner: {
    paddingVertical: 28,
    paddingHorizontal: 22,
    alignItems: "center",
    gap: 16,
  },
  iconCircle: {
    width: FACE_SIZE,
    height: FACE_SIZE,
    borderRadius: FACE_SIZE / 2,
    backgroundColor: AMBER_CIRCLE,
    justifyContent: "center",
    alignItems: "center",
  },
  faceCircle: {
    width: FACE_SIZE,
    height: FACE_SIZE,
    borderRadius: FACE_SIZE / 2,
    borderWidth: 3,
    borderColor: "rgba(245,158,11,0.5)",
    overflow: "hidden",
    backgroundColor: "#000",
    alignSelf: "center",
  },
  faceImage: {
    width: FACE_SIZE,
    height: FACE_SIZE,
    borderRadius: FACE_SIZE / 2,
  },
  title: {
    fontSize: 26,
    fontWeight: "800",
    color: "#fff",
    textAlign: "center",
  },
  titleLight: {
    color: "#1c1917",
  },
  subtitle: {
    fontSize: 16,
    color: "#a3a3a3",
    textAlign: "center",
    lineHeight: 22,
  },
  subtitleLight: {
    color: "#57534e",
  },
  btn: {
    alignSelf: "stretch",
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "#d97706",
    height: 56,
    borderRadius: 16,
    marginTop: 8,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: "rgba(255,255,255,0.30)",
    borderBottomWidth: 2,
    borderBottomColor: "rgba(0,0,0,0.22)",
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 3 },
    shadowOpacity: 0.25,
    shadowRadius: 6,
    elevation: 4,
  },
  btnText: {
    color: "#fff",
    fontSize: 18,
    fontWeight: "700",
    textShadowColor: "rgba(0,0,0,0.18)",
    textShadowOffset: { width: 0, height: 1 },
    textShadowRadius: 1,
  },
});
