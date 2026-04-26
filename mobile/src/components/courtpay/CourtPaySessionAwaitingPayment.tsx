import React, { useEffect, useMemo, useRef } from "react";
import {
  View,
  Text,
  TouchableOpacity,
  StyleSheet,
  ActivityIndicator,
  Image,
  Platform,
  useWindowDimensions,
  Animated,
  Easing,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Ionicons } from "@expo/vector-icons";
import { LiquidGlassSurface } from "./LiquidGlassSurface";
import { useTabletKioskLocale } from "../../hooks/useTabletKioskLocale";
import { useAppColors } from "../../theme/use-app-colors";
import type { AppColors } from "../../theme/palettes";
import {
  COURTPAY_LEVEL_QR_BORDER,
  type CourtPaySkillLevelUI,
} from "../../lib/courtpay-skill-level-ui";

export const COURTPAY_SESSION_PARTY_MAX = 4;

export interface CourtPaySessionAwaitingPaymentData {
  qrUrl: string | null;
  amount: number;
  paymentRef: string;
  skillLevel?: CourtPaySkillLevelUI;
}

export interface CourtPaySessionAwaitingKioskTheme {
  isLight: boolean;
  themeMode: "light" | "dark";
  amountColor: string;
  pulseDotColor: string;
  glassTint: string;
}

type Props = {
  variant: "kiosk" | "staff";
  /** Kiosk accent / glass — required when variant is "kiosk" */
  kioskTheme?: CourtPaySessionAwaitingKioskTheme;
  playerName: string;
  pending: CourtPaySessionAwaitingPaymentData;
  partyCount: number;
  partyAdjusting?: boolean;
  cashLoading?: boolean;
  onPartyCountChange: (next: number) => void | Promise<void>;
  onCash: () => void;
  onCancel: () => void;
};

function formatVND(amount: number) {
  return new Intl.NumberFormat("vi-VN").format(amount);
}

export function CourtPaySessionAwaitingPayment({
  variant,
  kioskTheme,
  playerName,
  pending,
  partyCount,
  partyAdjusting = false,
  cashLoading = false,
  onPartyCountChange,
  onCash,
  onCancel,
}: Props) {
  const { t } = useTabletKioskLocale();
  const theme = useAppColors();
  const insets = useSafeAreaInsets();
  const { height: windowHeight } = useWindowDimensions();
  const staffStyles = useMemo(() => createStaffStyles(theme), [theme]);

  /** Short phones: less vertical padding + smaller QR so content clears status + home areas. */
  const compact = windowHeight < 720;
  const qrSize = compact ? 210 : 260;

  const kioskSafeStyle = useMemo(
    () => ({
      width: "100%" as const,
      maxWidth: 440,
      alignSelf: "center" as const,
      paddingTop: insets.top + (compact ? 6 : 10),
      paddingBottom: insets.bottom + (compact ? 12 : 16),
      paddingLeft: insets.left,
      paddingRight: insets.right,
    }),
    [insets.top, insets.bottom, insets.left, insets.right, compact]
  );

  const staffSafeStyle = useMemo(
    () => ({
      paddingBottom: insets.bottom + 10,
      paddingLeft: insets.left,
      paddingRight: insets.right,
    }),
    [insets.bottom, insets.left, insets.right]
  );

  const pulseOpacity = useRef(new Animated.Value(1)).current;
  useEffect(() => {
    const loop = Animated.loop(
      Animated.sequence([
        Animated.timing(pulseOpacity, {
          toValue: 0.2,
          duration: 700,
          easing: Easing.inOut(Easing.quad),
          useNativeDriver: true,
        }),
        Animated.timing(pulseOpacity, {
          toValue: 1,
          duration: 700,
          easing: Easing.inOut(Easing.quad),
          useNativeDriver: true,
        }),
      ])
    );
    loop.start();
    return () => {
      loop.stop();
      pulseOpacity.setValue(1);
    };
  }, [pulseOpacity]);

  const title = playerName.trim()
    ? t("payTitle", { name: playerName.trim() })
    : t("payReturningTitle");

  const sublabel =
    partyCount >= COURTPAY_SESSION_PARTY_MAX
      ? t("payPartyMaxPeople")
      : partyCount === 1
        ? t("payPartyPerson")
        : t("payPartyPeople");

  const minusDisabled = partyCount <= 1 || partyAdjusting;
  const plusDisabled = partyCount >= COURTPAY_SESSION_PARTY_MAX || partyAdjusting;

  const counter = (
    <View
      style={[
        styles.counterCard,
        variant === "staff" && staffStyles.counterCard,
      ]}
    >
      <TouchableOpacity
        style={[
          styles.counterSideBtn,
          minusDisabled && styles.counterSideBtnDisabled,
          variant === "staff" && staffStyles.counterSideBtn,
          variant === "staff" && minusDisabled && staffStyles.counterSideBtnDisabled,
        ]}
        onPress={() => void onPartyCountChange(partyCount - 1)}
        disabled={minusDisabled}
        activeOpacity={0.7}
      >
        <Ionicons
          name="remove"
          size={22}
          color={minusDisabled ? (variant === "staff" ? theme.subtle : "#a3a3a3") : "#2563eb"}
        />
      </TouchableOpacity>
      <View style={styles.counterCenter}>
        <Text
          style={[
            styles.counterNumber,
            variant === "staff" && staffStyles.counterNumber,
          ]}
        >
          {partyCount}
        </Text>
        <Text
          style={[
            styles.counterHint,
            variant === "staff" && staffStyles.counterHint,
          ]}
        >
          {sublabel}
        </Text>
      </View>
      <TouchableOpacity
        style={[
          styles.counterSideBtn,
          plusDisabled && styles.counterSideBtnDisabled,
          variant === "staff" && staffStyles.counterSideBtn,
          variant === "staff" && plusDisabled && staffStyles.counterSideBtnDisabled,
        ]}
        onPress={() => void onPartyCountChange(partyCount + 1)}
        disabled={plusDisabled}
        activeOpacity={0.7}
      >
        <Ionicons
          name="add"
          size={22}
          color={plusDisabled ? (variant === "staff" ? theme.subtle : "#a3a3a3") : "#2563eb"}
        />
      </TouchableOpacity>
    </View>
  );

  const qrBlock = pending.qrUrl ? (
    <View
      style={[
        styles.qrWrap,
        variant === "staff" && staffStyles.qrWrap,
        pending.skillLevel ? COURTPAY_LEVEL_QR_BORDER[pending.skillLevel] : null,
      ]}
    >
      <Image
        source={{ uri: pending.qrUrl }}
        style={[styles.qrImage, { width: qrSize, height: qrSize }]}
        resizeMode="contain"
      />
    </View>
  ) : null;

  const amountEl = (
    <Text
      style={[
        styles.amount,
        variant === "kiosk" && kioskTheme
          ? { color: kioskTheme.amountColor }
          : staffStyles.amount,
      ]}
    >
      {formatVND(pending.amount)} VND
    </Text>
  );

  const refEl = (
    <Text
      style={[
        styles.ref,
        variant === "kiosk" && kioskTheme?.isLight && styles.refLight,
        variant === "staff" && staffStyles.ref,
      ]}
    >
      {pending.paymentRef}
    </Text>
  );

  const waitingRow = (
    <View style={styles.payWaitingRow}>
      <Animated.View
        style={[
          styles.payPulseDot,
          variant === "kiosk" && kioskTheme
            ? { backgroundColor: kioskTheme.pulseDotColor }
            : { backgroundColor: theme.green500 },
          { opacity: pulseOpacity },
        ]}
      />
      <Text
        style={[
          styles.waitText,
          variant === "kiosk" && kioskTheme?.isLight && styles.waitTextLight,
          variant === "staff" && staffStyles.waitText,
        ]}
      >
        {t("payWaitingForStaff")}
      </Text>
    </View>
  );

  const cashBtn = (
    <TouchableOpacity
      style={[
        styles.cashBtn,
        variant === "staff" && staffStyles.cashBtn,
        (cashLoading || partyAdjusting) && styles.disabledOpacity,
      ]}
      onPress={onCash}
      disabled={cashLoading || partyAdjusting}
      activeOpacity={0.85}
    >
      {cashLoading ? (
        <ActivityIndicator color={variant === "staff" ? theme.amber400 : "#fbbf24"} />
      ) : (
        <>
          <Ionicons
            name="wallet-outline"
            size={18}
            color={variant === "staff" ? theme.amber400 : "#fbbf24"}
          />
          <Text
            style={[
              styles.cashText,
              variant === "kiosk" && kioskTheme?.isLight && styles.cashTextLight,
              variant === "staff" && staffStyles.cashText,
            ]}
          >
            {t("payByCash")}
          </Text>
        </>
      )}
    </TouchableOpacity>
  );

  const cancelBtn = (
    <TouchableOpacity
      style={[styles.cancelBtn, variant === "staff" && staffStyles.cancelBtn]}
      onPress={onCancel}
      activeOpacity={0.7}
    >
      <Text
        style={[
          styles.cancelText,
          variant === "kiosk" && kioskTheme?.isLight && styles.cancelTextLight,
          variant === "staff" && staffStyles.cancelText,
        ]}
      >
        {t("cancel")}
      </Text>
    </TouchableOpacity>
  );

  const innerPadStyle =
    variant === "kiosk"
      ? [
          styles.payWaitGlassInner,
          compact && styles.payWaitGlassInnerCompact,
        ]
      : [staffStyles.inner, compact && staffStyles.innerCompact];

  const inner = (
    <View style={innerPadStyle}>
      <Text
        style={[
          styles.formTitle,
          variant === "kiosk" && kioskTheme?.isLight && styles.formTitleLight,
          variant === "staff" && staffStyles.formTitle,
        ]}
      >
        {title}
      </Text>
      <Text
        style={[
          styles.payScanHint,
          variant === "kiosk" && kioskTheme?.isLight && styles.payScanHintLight,
          variant === "staff" && staffStyles.payScanHint,
        ]}
      >
        {t("payScanQR")}
      </Text>
      {counter}
      {qrBlock}
      {amountEl}
      {refEl}
      {waitingRow}
      {cashBtn}
      {cancelBtn}
    </View>
  );

  if (variant === "kiosk" && kioskTheme) {
    return (
      <View style={kioskSafeStyle}>
        <LiquidGlassSurface
          style={styles.payWaitGlass}
          tintColor={kioskTheme.glassTint}
          mode={kioskTheme.themeMode}
        >
          {inner}
        </LiquidGlassSurface>
      </View>
    );
  }

  return (
    <View style={[staffStyles.outer, staffSafeStyle]}>
      {inner}
    </View>
  );
}

function createStaffStyles(t: AppColors) {
  return StyleSheet.create({
    outer: {
      width: "100%",
      borderRadius: 14,
      borderWidth: 1,
      borderColor: t.border,
      backgroundColor: t.card,
      overflow: "hidden",
    },
    inner: { paddingVertical: 20, paddingHorizontal: 16, alignItems: "center", gap: 14 },
    innerCompact: { paddingVertical: 14, gap: 10 },
    formTitle: { fontSize: 20, fontWeight: "800", color: t.text, textAlign: "center" },
    payScanHint: { fontSize: 13, color: t.muted, textAlign: "center", paddingHorizontal: 8 },
    counterCard: {
      flexDirection: "row",
      alignItems: "center",
      width: "100%",
      maxWidth: 320,
      backgroundColor: t.bg,
      borderRadius: 14,
      paddingVertical: 12,
      paddingHorizontal: 10,
      borderWidth: 1,
      borderColor: t.border,
    },
    counterSideBtn: {
      width: 44,
      height: 44,
      borderRadius: 10,
      alignItems: "center",
      justifyContent: "center",
      backgroundColor: t.card,
      borderWidth: 1,
      borderColor: t.border,
    },
    counterSideBtnDisabled: { opacity: 0.45 },
    counterNumber: { fontSize: 32, fontWeight: "800", color: t.blue600, textAlign: "center" },
    counterHint: { fontSize: 12, color: t.muted, textAlign: "center", marginTop: 2 },
    qrWrap: {
      backgroundColor: "#fff",
      borderRadius: 16,
      padding: 14,
      borderWidth: 1,
      borderColor: t.border,
    },
    amount: { fontSize: 28, fontWeight: "800", color: t.green600 },
    ref: { fontSize: 13, color: t.muted, fontFamily: Platform.OS === "ios" ? "Menlo" : "monospace" },
    waitText: { color: t.muted, fontSize: 14 },
    cashBtn: {
      flexDirection: "row",
      alignItems: "center",
      justifyContent: "center",
      gap: 8,
      backgroundColor: "rgba(245,158,11,0.15)",
      height: 44,
      borderRadius: 12,
      paddingHorizontal: 16,
      width: "100%",
      maxWidth: 320,
      borderWidth: 1,
      borderColor: "rgba(217,119,6,0.35)",
    },
    cashText: { color: t.amber400, fontSize: 16, fontWeight: "600" },
    cancelBtn: { paddingVertical: 8 },
    cancelText: { fontSize: 15, color: t.muted, textDecorationLine: "underline" },
  });
}

const styles = StyleSheet.create({
  payWaitGlass: {
    width: "100%",
    maxWidth: 440,
    borderRadius: 26,
    alignSelf: "center",
    ...(Platform.OS === "ios" ? ({ borderCurve: "continuous" } as const) : null),
  },
  payWaitGlassInner: {
    paddingVertical: 24,
    paddingHorizontal: 20,
    alignItems: "center",
    gap: 16,
  },
  payWaitGlassInnerCompact: {
    paddingVertical: 14,
    paddingHorizontal: 16,
    gap: 10,
  },
  formTitle: { fontSize: 22, fontWeight: "800", color: "#fff", textAlign: "center" },
  formTitleLight: { color: "#0f172a" },
  payScanHint: { fontSize: 14, color: "#a3a3a3", textAlign: "center", paddingHorizontal: 8 },
  payScanHintLight: { color: "#64748b" },
  counterCard: {
    flexDirection: "row",
    alignItems: "center",
    width: "100%",
    maxWidth: 320,
    backgroundColor: "#fff",
    borderRadius: 16,
    paddingVertical: 14,
    paddingHorizontal: 12,
  },
  counterSideBtn: {
    width: 48,
    height: 48,
    borderRadius: 12,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "#f4f4f5",
  },
  counterSideBtnDisabled: { opacity: 0.5 },
  counterCenter: { flex: 1, alignItems: "center" },
  counterNumber: { fontSize: 36, fontWeight: "800", color: "#2563eb" },
  counterHint: { fontSize: 12, color: "#737373", marginTop: 2 },
  qrWrap: {
    backgroundColor: "#fff",
    borderRadius: 20,
    padding: 20,
    shadowColor: "#000",
    shadowOpacity: 0.2,
    shadowRadius: 12,
    shadowOffset: { width: 0, height: 4 },
  },
  qrImage: { width: 260, height: 260, maxWidth: "100%" },
  amount: { fontSize: 36, fontWeight: "700", color: "transparent" },
  ref: { fontSize: 14, color: "#737373", fontFamily: Platform.OS === "ios" ? "Menlo" : "monospace" },
  refLight: { color: "#64748b" },
  payWaitingRow: { flexDirection: "row", alignItems: "center", gap: 10 },
  payPulseDot: { width: 12, height: 12, borderRadius: 6, backgroundColor: "transparent" },
  waitText: { color: "#a3a3a3", fontSize: 15 },
  waitTextLight: { color: "#475569" },
  cashBtn: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
    backgroundColor: "rgba(217,119,6,0.12)",
    height: 40,
    borderRadius: 12,
    paddingHorizontal: 14,
    borderWidth: 1,
    borderColor: "rgba(217,119,6,0.30)",
  },
  cashText: { color: "#fbbf24", fontSize: 16, fontWeight: "600" },
  cashTextLight: { color: "#b45309" },
  cancelBtn: { paddingVertical: 8 },
  cancelText: { fontSize: 15, color: "#a3a3a3", textDecorationLine: "underline" },
  cancelTextLight: { color: "#64748b" },
  disabledOpacity: { opacity: 0.55 },
});
