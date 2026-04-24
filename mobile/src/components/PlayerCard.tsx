import React from "react";
import {
  View,
  Text,
  TouchableOpacity,
  Image,
  StyleSheet,
} from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { useAppColors } from "../theme/use-app-colors";
import type { AppColors } from "../theme/palettes";
import { resolveMediaUrl } from "../lib/media-url";

export interface PlayerCardRow {
  id: string;
  source: "self" | "courtpay";
  name: string;
  phone: string;
  gender: string | null;
  skillLevel: string | null;
  facePhotoPath: string | null;
  avatarPhotoPath: string | null;
  checkInCount: number;
  avgReturnDays: number | null;
  lastSeenAt: string | null;
  registeredAt: string;
  venueName: string;
}

interface PlayerCardProps {
  player: PlayerCardRow;
  /** Label shown below the stat value on the right. */
  statLabel: string;
  /** Which stat to show on the right column. Defaults to "checkInCount". */
  statKey?: "checkInCount" | "avgReturnDays";
  /** "Last seen" label text. */
  lastSeenLabel: string;
  onPress?: () => void;
}

function formatDateShort(dateStr: string | null | undefined): string {
  if (!dateStr) return "—";
  const d = new Date(dateStr);
  if (Number.isNaN(d.getTime())) return "—";
  return d.toLocaleDateString(undefined, {
    day: "2-digit",
    month: "short",
    year: "numeric",
  });
}

function createStyles(t: AppColors) {
  return StyleSheet.create({
    playerCard: {
      flexDirection: "row",
      alignItems: "center",
      borderRadius: 10,
      borderWidth: 1,
      borderColor: t.border,
      backgroundColor: t.card,
      padding: 10,
      marginBottom: 8,
      gap: 10,
    },
    playerAvatarWrap: {
      width: 46,
      height: 46,
      borderRadius: 23,
      overflow: "hidden",
    },
    playerAvatar: { width: 46, height: 46 },
    playerAvatarFallback: {
      width: 46,
      height: 46,
      borderRadius: 23,
      backgroundColor: "rgba(37,99,235,0.18)",
      alignItems: "center",
      justifyContent: "center",
    },
    playerAvatarInitials: {
      fontSize: 18,
      fontWeight: "700",
      color: t.blue400,
    },
    playerCardMain: { flex: 1, minWidth: 0, gap: 2 },
    playerCardNameRow: {
      flexDirection: "row",
      alignItems: "center",
      gap: 4,
    },
    playerCardName: {
      fontSize: 14,
      fontWeight: "700",
      color: t.text,
      flexShrink: 1,
    },
    playerCardPhone: { fontSize: 12, color: t.muted },
    playerCardTagRow: {
      flexDirection: "row",
      alignItems: "center",
      gap: 4,
      flexWrap: "wrap",
      marginTop: 3,
    },
    playerTagVenue: {
      flexDirection: "row",
      alignItems: "center",
      gap: 2,
      paddingHorizontal: 6,
      paddingVertical: 2,
      borderRadius: 6,
      backgroundColor: "rgba(115,115,115,0.12)",
    },
    playerTagVenueText: { fontSize: 10, color: t.muted },
    playerTagSource: {
      paddingHorizontal: 6,
      paddingVertical: 2,
      borderRadius: 6,
    },
    playerTagSourceCP: { backgroundColor: "rgba(245,158,11,0.18)" },
    playerTagSourceSelf: { backgroundColor: "rgba(37,99,235,0.15)" },
    playerTagSourceText: { fontSize: 10, fontWeight: "700" },
    playerTagSourceTextCP: { color: "#f59e0b" },
    playerTagSourceTextSelf: { color: t.blue400 },
    playerTagSkill: {
      paddingHorizontal: 6,
      paddingVertical: 2,
      borderRadius: 6,
      backgroundColor: "rgba(37,99,235,0.12)",
    },
    playerTagSkillText: { fontSize: 10, color: t.blue400 },
    playerCardLastSeen: { fontSize: 11, color: t.subtle, marginTop: 2 },
    playerCardRight: { alignItems: "center", minWidth: 44 },
    playerCardStatValue: {
      fontSize: 20,
      fontWeight: "700",
      color: t.text,
    },
    playerCardStatLabel: { fontSize: 10, color: t.muted, textAlign: "center" },
    statYellow: { color: "#facc15" },
  });
}

export function PlayerCard({
  player: p,
  statLabel,
  statKey = "checkInCount",
  lastSeenLabel,
  onPress,
}: PlayerCardProps) {
  const theme = useAppColors();
  const styles = createStyles(theme);

  const photoUri = resolveMediaUrl(p.avatarPhotoPath ?? p.facePhotoPath ?? null);
  const initials = p.name.trim().charAt(0).toUpperCase();
  const isCourtPay = p.source === "courtpay";
  const isFemale = p.gender?.toLowerCase() === "female";
  const isMale = p.gender?.toLowerCase() === "male";
  const nameColor = isFemale ? "#f9a8d4" : isMale ? "#93c5fd" : theme.text;

  const statValue = statKey === "avgReturnDays" ? p.avgReturnDays : p.checkInCount;
  const statHighlighted =
    statKey === "avgReturnDays" ? p.avgReturnDays != null : p.checkInCount > 0;

  const inner = (
    <>
      <View style={styles.playerAvatarWrap}>
        {photoUri ? (
          <Image
            source={{ uri: photoUri }}
            style={styles.playerAvatar}
            resizeMode="cover"
          />
        ) : (
          <View style={styles.playerAvatarFallback}>
            <Text style={styles.playerAvatarInitials}>{initials}</Text>
          </View>
        )}
      </View>

      <View style={styles.playerCardMain}>
        <View style={styles.playerCardNameRow}>
          <Text
            style={[styles.playerCardName, { color: nameColor }]}
            numberOfLines={2}
          >
            {p.name}
          </Text>
        </View>
        <Text style={styles.playerCardPhone}>{p.phone}</Text>
        <View style={styles.playerCardTagRow}>
          <View style={styles.playerTagVenue}>
            <Ionicons name="location-outline" size={10} color={theme.muted} />
            <Text style={styles.playerTagVenueText} numberOfLines={1}>
              {p.venueName}
            </Text>
          </View>
          <View
            style={[
              styles.playerTagSource,
              isCourtPay ? styles.playerTagSourceCP : styles.playerTagSourceSelf,
            ]}
          >
            <Text
              style={[
                styles.playerTagSourceText,
                isCourtPay
                  ? styles.playerTagSourceTextCP
                  : styles.playerTagSourceTextSelf,
              ]}
            >
              {isCourtPay ? "CourtPay" : "Self"}
            </Text>
          </View>
          {p.skillLevel && (
            <View style={styles.playerTagSkill}>
              <Text style={styles.playerTagSkillText}>
                {p.skillLevel.charAt(0).toUpperCase() + p.skillLevel.slice(1)}
              </Text>
            </View>
          )}
        </View>
        {p.lastSeenAt && (
          <Text style={styles.playerCardLastSeen}>
            {lastSeenLabel}: {formatDateShort(p.lastSeenAt)}
          </Text>
        )}
      </View>

      <View style={styles.playerCardRight}>
        <Text
          style={[
            styles.playerCardStatValue,
            statHighlighted ? styles.statYellow : undefined,
          ]}
        >
          {statValue != null && statValue !== 0 ? statValue : "—"}
        </Text>
        <Text style={styles.playerCardStatLabel}>{statLabel}</Text>
      </View>
    </>
  );

  if (onPress) {
    return (
      <TouchableOpacity
        style={styles.playerCard}
        activeOpacity={0.75}
        onPress={onPress}
      >
        {inner}
      </TouchableOpacity>
    );
  }

  return <View style={styles.playerCard}>{inner}</View>;
}
