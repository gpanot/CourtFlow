import React, { useEffect, useMemo, useRef } from "react";
import {
  View,
  Text,
  TouchableOpacity,
  StyleSheet,
  ActivityIndicator,
  Platform,
  useWindowDimensions,
  Animated,
  Easing,
} from "react-native";
import QRCode from "react-native-qrcode-svg";
import { buildVietQRPayload } from "../../lib/vietqr-payload";
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
  /** Used for client-side QR generation (no CDN round-trip). */
  bankBin?: string | null;
  bankAccount?: string | null;
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
  /** When true (package purchase), the +/- party counter is locked at 1 — packages are individual. */
  isPackage?: boolean;
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
  isPackage = false,
  onPartyCountChange,
  onCash,
  onCancel,
}: Props) {
  const { t } = useTabletKioskLocale();
  const theme = useAppColors();
  const insets = useSafeAreaInsets();
  const { height: windowHeight } = useWindowDimensions();
  const staffStyles = useMemo(() => createStaffStyles(theme), [theme]);

  const compact = windowHeight < 720;

  /**
   * Compute QR size dynamically so ALL content fits without scrolling.
   *
   * Budget = window height minus safe areas.
   * Fixed content heights (title + hint + counter + amount + ref + waiting + cash + cancel):
   *   24 + 16 + 56 + 34 + 16 + 20 + 36 + 21 = 223
   * Gaps: 7 gaps × 10px = 70 (compact: 8px = 56)
   * Inner padding top+bottom (from insets computed separately, here just base):
   *   base padding 16 (compact: 8)
   * QR wrap padding: 24 (12 × 2)
   */
  const qrSize = useMemo(() => {
    const safeHeight = windowHeight - insets.top - insets.bottom;
    const fixedContent = 223;
    const gaps = compact ? 56 : 70;
    const innerPad = compact ? 8 + 8 : 8 + 16; // top+bottom base
    const qrPad = 24;
    const available = safeHeight - fixedContent - gaps - innerPad - qrPad;
    const clamped = Math.max(150, Math.min(220, available));
    return Math.floor(clamped);
  }, [windowHeight, insets.top, insets.bottom, compact]);

  const kioskSafeStyle = useMemo(
    () => ({
      width: "100%" as const,
      maxWidth: 440,
      alignSelf: "center" as const,
    }),
    []
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

  const sublabel = isPackage
    ? t("payPartyIndividual")
    : partyCount >= COURTPAY_SESSION_PARTY_MAX
      ? t("payPartyMaxPeople")
      : partyCount === 1
        ? t("payPartyPerson")
        : t("payPartyPeople");

  const minusDisabled = isPackage || partyCount <= 1 || partyAdjusting;
  const plusDisabled = isPackage || partyCount >= COURTPAY_SESSION_PARTY_MAX || partyAdjusting;

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

  const qrPayload = useMemo(() => {
    if (pending.bankBin && pending.bankAccount) {
      return buildVietQRPayload({
        bankBin: pending.bankBin,
        accountNumber: pending.bankAccount,
        amount: pending.amount,
        paymentRef: pending.paymentRef,
      });
    }
    return null;
  }, [pending.bankBin, pending.bankAccount, pending.amount, pending.paymentRef]);

  const qrBlock = qrPayload ? (
    <View
      style={[
        styles.qrWrap,
        variant === "staff" && staffStyles.qrWrap,
        pending.skillLevel ? COURTPAY_LEVEL_QR_BORDER[pending.skillLevel] : null,
      ]}
    >
      <QRCode
        value={qrPayload}
        size={qrSize}
        backgroundColor="#ffffff"
        color="#000000"
        ecl="M"
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

  const staffInner = (
    <View style={[staffStyles.inner, compact && staffStyles.innerCompact]}>
      <Text style={staffStyles.formTitle}>{title}</Text>
      <Text style={staffStyles.payScanHint}>{t("payScanQR")}</Text>
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
      <LiquidGlassSurface
        style={[styles.payWaitGlass, kioskSafeStyle]}
        tintColor={kioskTheme.glassTint}
        mode={kioskTheme.themeMode}
      >
        <View
          style={[
            styles.payWaitGlassInner,
            compact && styles.payWaitGlassInnerCompact,
            {
              paddingTop: insets.top + (compact ? 4 : 8),
              paddingBottom: insets.bottom + (compact ? 4 : 8),
            },
          ]}
        >
          <Text
            style={[
              styles.formTitle,
              kioskTheme?.isLight && styles.formTitleLight,
            ]}
          >
            {title}
          </Text>
          <Text
            style={[
              styles.payScanHint,
              kioskTheme?.isLight && styles.payScanHintLight,
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
      </LiquidGlassSurface>
    );
  }

  return (
    <View style={[staffStyles.outer, staffSafeStyle]}>
      {staffInner}
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
    paddingVertical: 0,
    paddingHorizontal: 20,
    alignItems: "center",
    gap: 10,
  },
  payWaitGlassInnerCompact: {
    paddingHorizontal: 16,
    gap: 8,
  },
  formTitle: { fontSize: 19, fontWeight: "800", color: "#fff", textAlign: "center" },
  formTitleLight: { color: "#0f172a" },
  payScanHint: { fontSize: 12, color: "#a3a3a3", textAlign: "center", paddingHorizontal: 8 },
  payScanHintLight: { color: "#64748b" },
  counterCard: {
    flexDirection: "row",
    alignItems: "center",
    width: "100%",
    maxWidth: 320,
    backgroundColor: "#fff",
    borderRadius: 12,
    paddingVertical: 8,
    paddingHorizontal: 8,
  },
  counterSideBtn: {
    width: 40,
    height: 40,
    borderRadius: 10,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "#f4f4f5",
  },
  counterSideBtnDisabled: { opacity: 0.5 },
  counterCenter: { flex: 1, alignItems: "center" },
  counterNumber: { fontSize: 30, fontWeight: "800", color: "#2563eb" },
  counterHint: { fontSize: 11, color: "#737373", marginTop: 1 },
  qrWrap: {
    backgroundColor: "#fff",
    borderRadius: 14,
    padding: 12,
    shadowColor: "#000",
    shadowOpacity: 0.2,
    shadowRadius: 8,
    shadowOffset: { width: 0, height: 3 },
  },
  amount: { fontSize: 28, fontWeight: "700", color: "transparent" },
  ref: { fontSize: 12, color: "#737373", fontFamily: Platform.OS === "ios" ? "Menlo" : "monospace" },
  refLight: { color: "#64748b" },
  payWaitingRow: { flexDirection: "row", alignItems: "center", gap: 8 },
  payPulseDot: { width: 10, height: 10, borderRadius: 5, backgroundColor: "transparent" },
  waitText: { color: "#a3a3a3", fontSize: 13 },
  waitTextLight: { color: "#475569" },
  cashBtn: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
    backgroundColor: "rgba(217,119,6,0.12)",
    height: 36,
    borderRadius: 10,
    paddingHorizontal: 14,
    borderWidth: 1,
    borderColor: "rgba(217,119,6,0.30)",
  },
  cashText: { color: "#fbbf24", fontSize: 14, fontWeight: "600" },
  cashTextLight: { color: "#b45309" },
  cancelBtn: { paddingVertical: 4 },
  cancelText: { fontSize: 13, color: "#a3a3a3", textDecorationLine: "underline" },
  cancelTextLight: { color: "#64748b" },
  disabledOpacity: { opacity: 0.55 },
});
