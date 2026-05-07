/**
 * StaffPaymentCard — shared payment row card used in:
 *   - PaymentTabScreen  (variant="compact": avatar ring left, meta column right, dots menu)
 *   - SessionDetailScreen (variant="full": face photo stacked at top)
 */
import React from "react";
import { View, Text, Image, TouchableOpacity, StyleSheet } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { useAppColors } from "../../theme/use-app-colors";
import type { AppColors } from "../../theme/palettes";
import { resolveMediaUrl } from "../../lib/media-url";
import type { PendingPayment } from "../../types/api";
import {
  COURTPAY_LEVEL_QR_BORDER,
  parseCourtPaySkillLevel,
} from "../../lib/courtpay-skill-level-ui";

// ---------------------------------------------------------------------------
// Helpers (exported so screens can also use them for CSV export etc.)
// ---------------------------------------------------------------------------

export function getDisplayPlayer(p: PendingPayment): {
  name: string;
  skillLevel: string;
} {
  if (p.player?.name?.trim())
    return { name: p.player.name, skillLevel: p.player.skillLevel ?? "—" };
  if (p.checkInPlayer?.name?.trim())
    return { name: p.checkInPlayer.name, skillLevel: p.checkInPlayer.skillLevel ?? "—" };
  return { name: "Unknown", skillLevel: "—" };
}

export function getFacePreviewUri(p: PendingPayment): string | null {
  const rawPlayer = p.player?.facePhotoPath?.trim();
  if (rawPlayer) return resolveMediaUrl(rawPlayer);
  const rawCourtPay = p.facePhotoUrl?.trim();
  if (rawCourtPay) return resolveMediaUrl(rawCourtPay);
  return null;
}

export function getFlowTag(p: PendingPayment): "CourtPay" | "Self" {
  return p.checkInPlayerId ? "CourtPay" : "Self";
}

export function getMethodBadge(paymentMethod: string): {
  label: string;
  kind: "cash" | "qr" | "subscription";
} {
  if (paymentMethod === "cash") return { label: "CASH", kind: "cash" };
  if (paymentMethod === "subscription") return { label: "SUB", kind: "subscription" };
  return { label: "QR", kind: "qr" };
}

/** Skill-level coloured border for the avatar ring (matches CourtPay kiosk colours). */
export function paymentSkillRingStyle(p: PendingPayment) {
  const raw = p.player?.skillLevel ?? p.checkInPlayer?.skillLevel ?? undefined;
  const lvl = parseCourtPaySkillLevel(raw);
  return lvl ? COURTPAY_LEVEL_QR_BORDER[lvl] : null;
}

export function formatVND(amount: number): string {
  return amount.toLocaleString("vi-VN") + " VND";
}

export function formatDateTime(dateStr: string | null | undefined): string {
  if (!dateStr) return "—";
  const d = new Date(dateStr);
  if (Number.isNaN(d.getTime())) return "—";
  return d.toLocaleString("en-GB", {
    day: "2-digit",
    month: "short",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

// ---------------------------------------------------------------------------
// Shared card styles factory
// ---------------------------------------------------------------------------

export function createCardStyles(t: AppColors) {
  return StyleSheet.create({
    // --- card containers ---
    cardFull: {
      backgroundColor: t.card,
      borderRadius: 12,
      paddingHorizontal: 10,
      paddingVertical: 9,
      borderWidth: 1,
      borderColor: t.border,
      gap: 6,
    },
    cardCompact: {
      backgroundColor: t.card,
      borderRadius: 12,
      paddingHorizontal: 10,
      paddingVertical: 9,
      borderWidth: 1,
      borderColor: t.border,
      gap: 6,
    },
    indexBadge: {
      position: "absolute",
      bottom: 6,
      right: 8,
      backgroundColor: t.cardSurface,
      borderRadius: 6,
      paddingHorizontal: 5,
      paddingVertical: 1,
      borderWidth: 1,
      borderColor: t.border,
    },
    indexBadgeText: {
      fontSize: 10,
      fontWeight: "600",
      color: t.subtle,
    },
    cardCancelled: { borderColor: "rgba(239,68,68,0.4)", opacity: 0.75 },
    cardGroupPayer: { borderColor: "rgba(99,102,241,0.6)", borderWidth: 1.5 },
    cardGroupMember: { borderColor: "rgba(99,102,241,0.35)", borderWidth: 1.5 },

    // --- compact layout ---
    paidRow: { flexDirection: "row", gap: 10, alignItems: "flex-start" },
    paidMetaCol: { flex: 1, minWidth: 0, gap: 4 },
    paidTopRow: {
      flexDirection: "row",
      justifyContent: "space-between",
      alignItems: "flex-start",
      gap: 8,
    },
    paidAvatarRing: {
      width: 50,
      height: 50,
      borderRadius: 25,
      justifyContent: "center",
      alignItems: "center",
      alignSelf: "flex-start",
    },
    paidAvatarRingDefault: { borderWidth: 1, borderColor: t.border },
    paidAvatarTouch: {
      width: 44,
      height: 44,
      borderRadius: 22,
      overflow: "hidden",
      backgroundColor: t.bg,
    },
    paidAvatarImg: { width: 44, height: 44 },
    paidExpandedPreviewWrap: {
      alignSelf: "stretch",
      borderRadius: 12,
      overflow: "hidden",
      borderWidth: 1,
      borderColor: t.border,
      backgroundColor: t.bg,
      marginBottom: 4,
    },
    paidExpandedPreviewImg: { width: "100%", height: 180 },

    // --- full variant avatar (slightly larger than compact) ---
    fullAvatarRing: {
      width: 56,
      height: 56,
      borderRadius: 28,
      justifyContent: "center",
      alignItems: "center",
      alignSelf: "flex-start",
    },
    fullAvatarTouch: {
      width: 50,
      height: 50,
      borderRadius: 25,
      overflow: "hidden",
      backgroundColor: t.bg,
    },
    fullAvatarImg: { width: 50, height: 50 },

    // --- badges ---
    nameRow: { flexDirection: "row", flexWrap: "wrap", alignItems: "center", gap: 6 },
    cardName: { fontSize: 15, fontWeight: "700", color: t.text, flexShrink: 1 },
    badge: { paddingHorizontal: 6, paddingVertical: 2, borderRadius: 6 },
    badgeCash: { backgroundColor: "rgba(245,158,11,0.2)" },
    badgeCashText: { fontSize: 10, fontWeight: "700", color: t.amber400 },
    badgeQr: { backgroundColor: "rgba(37,99,235,0.2)" },
    badgeQrText: { fontSize: 10, fontWeight: "700", color: t.blue400 },
    badgeSub: { backgroundColor: "rgba(168,85,247,0.2)" },
    badgeSubText: { fontSize: 10, fontWeight: "700", color: t.purple400 },
    badgeFlow: { backgroundColor: "rgba(217,70,239,0.2)" },
    badgeFlowText: { fontSize: 10, fontWeight: "700", color: t.fuchsia300 },
    badgeReclub: { backgroundColor: "rgba(20,184,166,0.2)" },
    badgeReclubText: { fontSize: 10, fontWeight: "700", color: "#2dd4bf" },
    badgeApr: { backgroundColor: "rgba(22,163,74,0.2)" },
    badgeAprText: { fontSize: 10, fontWeight: "700", color: t.green400 },
    badgeCancelledTag: { backgroundColor: "rgba(239,68,68,0.2)" },
    badgeCancelledTagText: { fontSize: 10, fontWeight: "700", color: t.red500 },

    // --- meta lines ---
    metaLine: { fontSize: 12, color: t.muted },
    dateLine: { fontSize: 11, color: t.subtle },
    skillMuted: { fontSize: 12, color: t.subtle, marginTop: 1 },
    groupLine: { fontSize: 13, color: t.blue600, fontWeight: "700", marginTop: 4 },
    paidByLine: { fontSize: 13, color: t.purple400, fontWeight: "700", marginTop: 4 },
    subLeftLine: { fontSize: 12, color: t.green400, marginTop: 2, fontWeight: "600" },
    cancelReasonLine: { fontSize: 11, color: t.red500, fontWeight: "600" },
    cancelledAmount: { fontSize: 13, fontWeight: "700", color: t.red400, marginTop: 2 },
    amountInline: { fontSize: 13, fontWeight: "700", color: t.text },
    paidByInline: { fontSize: 12, fontWeight: "600", color: t.purple400 },

    // --- group member card ---
    cardMember: { backgroundColor: t.card, borderRadius: 10, paddingHorizontal: 10, paddingVertical: 9, borderWidth: 1, borderColor: t.border, gap: 6 },
    memberChevronBtn: { flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 4, paddingHorizontal: 8, paddingVertical: 4, borderRadius: 10, backgroundColor: "rgba(99,102,241,0.15)", marginTop: 4, alignSelf: "flex-start" },
    memberChevronText: { fontSize: 12, fontWeight: "700", color: "#818cf8" },
    avatarChevronWrap: { alignItems: "center", gap: 4 },

    // --- dots menu button ---
    dotsBtn: { padding: 4, borderRadius: 8 },
  });
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export interface StaffPaymentCardProps {
  item: PendingPayment;
  /** Key prefix for expanded photo tracking (e.g. "paid" → `paid-${id}`, "" → `${id}`). */
  expandedPhotoPrefix?: string;
  expandedPhotoId: string | null;
  onToggleExpand: (key: string) => void;
  /** Show the 3-dot overflow menu button (PaymentTabScreen). Provide a callback to receive y-position. */
  onMenuPress?: (itemId: string, y: number) => void;
  /** Show "group paid by X" line (PaymentTabScreen). */
  showGroupPaidBy?: boolean;
  /** Show "Skill: X" line (SessionDetailScreen). */
  showSkill?: boolean;
  /** Show negative cancelled amount line (PaymentTabScreen). */
  showCancelledAmount?: boolean;
  /**
   * "compact" — left avatar ring + right meta column (PaymentTabScreen)
   * "full"    — face photo stacked at top (SessionDetailScreen)
   */
  variant?: "compact" | "full";
  /** i18n formatter for type/sub labels. Pass pre-formatted strings. */
  typeLabel: string;
  subLeftText?: string | null;
  /** 1-based position index shown as a badge in the bottom-right corner. */
  index?: number;
  /** Number of group members under this payer — shows expand chevron when > 0. */
  groupMemberCount?: number;
  /** Whether the group is currently expanded. */
  groupExpanded?: boolean;
  /** Called when the user taps the expand/collapse chevron. */
  onGroupToggle?: () => void;
  /** Render as a group member (indented, muted background). */
  isMember?: boolean;
}

export function StaffPaymentCard({
  item,
  expandedPhotoPrefix = "",
  expandedPhotoId,
  onToggleExpand,
  onMenuPress,
  showGroupPaidBy = false,
  showSkill = false,
  showCancelledAmount = false,
  variant = "full",
  typeLabel,
  subLeftText,
  index,
  groupMemberCount,
  groupExpanded,
  onGroupToggle,
  isMember = false,
}: StaffPaymentCardProps) {
  const theme = useAppColors();
  const styles = React.useMemo(() => createCardStyles(theme), [theme]);

  const player = getDisplayPlayer(item);
  const faceUri = getFacePreviewUri(item);
  const methodBadge = getMethodBadge(item.paymentMethod);
  const isCancelled = item.status === "cancelled" || !!item.cancelReason;
  const skillRing = paymentSkillRingStyle(item);

  const expandKey = expandedPhotoPrefix ? `${expandedPhotoPrefix}-${item.id}` : item.id;
  const expanded = expandedPhotoId === expandKey;

  // --- shared badge row ---
  const badgeRow = (
    <View style={styles.nameRow}>
      <View
        style={[
          styles.badge,
          methodBadge.kind === "cash"
            ? styles.badgeCash
            : methodBadge.kind === "subscription"
              ? styles.badgeSub
              : styles.badgeQr,
        ]}
      >
        <Text
          style={
            methodBadge.kind === "cash"
              ? styles.badgeCashText
              : methodBadge.kind === "subscription"
                ? styles.badgeSubText
                : styles.badgeQrText
          }
        >
          {methodBadge.label}
        </Text>
      </View>
      <View style={[styles.badge, styles.badgeFlow]}>
        <Text style={styles.badgeFlowText}>{getFlowTag(item)}</Text>
      </View>
      {item.player?.reclubUserId ? (
        <View style={[styles.badge, styles.badgeReclub]}>
          <Text style={styles.badgeReclubText}>RECLUB</Text>
        </View>
      ) : null}
      <View style={[styles.badge, styles.badgeApr]}>
        <Text style={styles.badgeAprText}>
          {item.confirmedBy === "sepay" ? "SEPAY" : "MANUAL"}
        </Text>
      </View>
      {isCancelled ? (
        <View style={[styles.badge, styles.badgeCancelledTag]}>
          <Text style={styles.badgeCancelledTagText}>CANCELLED</Text>
        </View>
      ) : null}
    </View>
  );

  // --- shared meta lines (below badge row) ---
  const metaLines = (
    <>
      {isCancelled && item.cancelReason ? (
        <Text style={styles.cancelReasonLine}>{item.cancelReason}</Text>
      ) : null}
      {showSkill ? (
        <Text style={styles.skillMuted}>Skill: {player.skillLevel}</Text>
      ) : null}
      <Text style={styles.metaLine}>
        {typeLabel}
        {item.groupPaidByPaymentId ? (
          <Text style={styles.paidByInline}> · Paid by: {item.groupPaidByName ?? "group"}</Text>
        ) : (
          <Text> · <Text style={styles.amountInline}>{formatVND(item.amount)}</Text></Text>
        )}
      </Text>
      {(item.partyCount ?? 1) > 1 ? (
        <Text style={styles.groupLine}>Group of {item.partyCount}</Text>
      ) : null}
      <Text style={styles.dateLine}>
        {formatDateTime(item.confirmedAt)}
        {item.confirmedOnDevice ? ` · ${item.confirmedOnDevice}` : ""}
      </Text>
      {subLeftText ? <Text style={styles.subLeftLine}>{subLeftText}</Text> : null}
      {showCancelledAmount && isCancelled ? (
        <Text style={styles.cancelledAmount}>
          -{formatVND(item.amount)} ({item.cancelReason})
        </Text>
      ) : null}
    </>
  );

  // -------------------------------------------------------------------------
  // COMPACT variant (PaymentTabScreen)
  // -------------------------------------------------------------------------
  const isGroupPayer = (groupMemberCount ?? 0) > 0;
  const groupBorderStyle = isGroupPayer
    ? styles.cardGroupPayer
    : isMember
      ? styles.cardGroupMember
      : null;

  if (variant === "compact") {
    const cardContent = (
      <>
        {/* Expanded photo above row */}
        {faceUri && expanded ? (
          <TouchableOpacity
            style={styles.paidExpandedPreviewWrap}
            onPress={() => onToggleExpand(expandKey)}
            activeOpacity={0.9}
          >
            <Image
              source={{ uri: faceUri }}
              style={styles.paidExpandedPreviewImg}
              resizeMode="cover"
            />
          </TouchableOpacity>
        ) : null}

        <View style={styles.paidRow}>
          {/* Avatar + chevron pill stacked below */}
          <View style={styles.avatarChevronWrap}>
            {faceUri ? (
              <View style={[styles.paidAvatarRing, skillRing ?? styles.paidAvatarRingDefault]}>
                <TouchableOpacity
                  style={styles.paidAvatarTouch}
                  onPress={() => onToggleExpand(expandKey)}
                  activeOpacity={0.85}
                >
                  <Image
                    source={{ uri: faceUri }}
                    style={styles.paidAvatarImg}
                    resizeMode="cover"
                  />
                </TouchableOpacity>
              </View>
            ) : null}
            {isGroupPayer && onGroupToggle ? (
              <View style={styles.memberChevronBtn}>
                <Ionicons
                  name={groupExpanded ? "chevron-up" : "chevron-down"}
                  size={13}
                  color="#818cf8"
                />
                <Text style={styles.memberChevronText}>{groupMemberCount}</Text>
              </View>
            ) : null}
          </View>

          {/* Meta column */}
          <View style={styles.paidMetaCol}>
            {/* Name + dots button */}
            <View style={styles.paidTopRow}>
              <Text style={styles.cardName} numberOfLines={1}>
                {player.name}
              </Text>
              {onMenuPress ? (
                <TouchableOpacity
                  style={styles.dotsBtn}
                  onPress={(e) => {
                    const target = e.currentTarget as unknown as {
                      measure?: (
                        cb: (x: number, y: number, w: number, h: number, px: number, py: number) => void
                      ) => void;
                    };
                    if (target.measure) {
                      target.measure((_x, _y, _w, h, _px, py) => {
                        onMenuPress(item.id, py + h);
                      });
                    } else {
                      onMenuPress(item.id, 200);
                    }
                  }}
                  activeOpacity={0.6}
                >
                  <Ionicons name="ellipsis-vertical" size={18} color={theme.muted} />
                </TouchableOpacity>
              ) : null}
            </View>

            {badgeRow}
            {metaLines}
          </View>
        </View>
        {index != null && (
          <View style={styles.indexBadge}>
            <Text style={styles.indexBadgeText}>{index}</Text>
          </View>
        )}
      </>
    );

    if (isGroupPayer && onGroupToggle) {
      return (
        <TouchableOpacity
          style={[isMember ? styles.cardMember : styles.cardCompact, isCancelled && styles.cardCancelled, groupBorderStyle, { position: "relative" }]}
          onPress={onGroupToggle}
          activeOpacity={0.85}
        >
          {cardContent}
        </TouchableOpacity>
      );
    }

    return (
      <View style={[isMember ? styles.cardMember : styles.cardCompact, isCancelled && styles.cardCancelled, groupBorderStyle, { position: "relative" }]}>
        {cardContent}
      </View>
    );
  }

  // -------------------------------------------------------------------------
  // FULL variant (SessionDetailScreen) — compact horizontal row, same as
  // compact but no dots menu and larger avatar; expanded photo goes above row.
  // -------------------------------------------------------------------------
  return (
    <View style={[styles.cardFull, isCancelled && styles.cardCancelled, { position: "relative" }]}>
      {/* Expanded photo above the row */}
      {faceUri && expanded ? (
        <TouchableOpacity
          style={styles.paidExpandedPreviewWrap}
          onPress={() => onToggleExpand(expandKey)}
          activeOpacity={0.9}
        >
          <Image
            source={{ uri: faceUri }}
            style={styles.paidExpandedPreviewImg}
            resizeMode="cover"
          />
        </TouchableOpacity>
      ) : null}

      <View style={styles.paidRow}>
        {/* Avatar — tap to expand */}
        {faceUri ? (
          <View style={[styles.fullAvatarRing, skillRing ?? styles.paidAvatarRingDefault]}>
            <TouchableOpacity
              style={styles.fullAvatarTouch}
              onPress={() => onToggleExpand(expandKey)}
              activeOpacity={0.85}
            >
              <Image
                source={{ uri: faceUri }}
                style={styles.fullAvatarImg}
                resizeMode="cover"
              />
            </TouchableOpacity>
          </View>
        ) : null}

        {/* Meta column */}
        <View style={styles.paidMetaCol}>
          <Text style={styles.cardName} numberOfLines={1}>
            {player.name}
          </Text>
          {badgeRow}
          {metaLines}
        </View>
      </View>

      {index != null && (
        <View style={styles.indexBadge}>
          <Text style={styles.indexBadgeText}>{index}</Text>
        </View>
      )}
    </View>
  );
}
