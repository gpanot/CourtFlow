/**
 * SubscribersList
 *
 * Reusable component rendering the full CourtPay subscriber list with:
 * - Enhanced subscription cards (name, package, phone, sessions, dates, status badge)
 * - Tap to navigate to BossSubscriptionDetail
 * - Optional search bar (enabled when showSearch={true})
 * - Fetches its own data when `externalData` is not provided
 * - Accepts `externalData` + `externalLoading` for cases where the parent
 *   already owns the data (e.g. Boss Dashboard tab)
 */
import React, { useCallback, useEffect, useMemo, useState } from "react";
import {
  View,
  Text,
  TouchableOpacity,
  StyleSheet,
  ActivityIndicator,
  TextInput,
} from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { useNavigation } from "@react-navigation/native";
import type { NativeStackNavigationProp } from "@react-navigation/native-stack";
import { api } from "../lib/api-client";
import { useAuthStore } from "../stores/auth-store";
import { useAppColors } from "../theme/use-app-colors";
import type { AppColors } from "../theme/palettes";
import type { StaffStackParamList } from "../navigation/types";

export interface SubscriberRow {
  id: string;
  playerName: string;
  playerPhone: string;
  packageName: string;
  status: string;
  sessionsRemaining: number | null;
  totalSessions: number | null;
  usageCount: number;
  activatedAt: string;
  expiresAt: string;
  lastCheckedIn?: string | null;
}

interface Props {
  /** If provided, the component uses this data instead of fetching. */
  externalData?: SubscriberRow[];
  externalLoading?: boolean;
  /** Show the inline search input (useful when the parent has no search). */
  showSearch?: boolean;
  /** Passed as the empty-state text override. */
  emptyLabel?: string;
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
    search: {
      borderWidth: 1,
      borderColor: t.border,
      borderRadius: 10,
      paddingHorizontal: 12,
      height: 42,
      color: t.text,
      marginBottom: 12,
      backgroundColor: t.inputBg,
    },
    empty: { textAlign: "center", color: t.muted, paddingVertical: 32, fontSize: 14 },
    subCard: {
      flexDirection: "row",
      alignItems: "center",
      borderRadius: 10,
      borderWidth: 1,
      borderColor: t.border,
      backgroundColor: t.card,
      padding: 12,
      marginBottom: 8,
    },
    subCardMain: { flex: 1, minWidth: 0, gap: 2 },
    subCardName: { fontSize: 14, fontWeight: "700", color: t.text },
    subCardPkg: { fontSize: 12, fontWeight: "600", color: "#a855f7", marginTop: 1 },
    subCardMeta: { fontSize: 11, color: t.muted },
    subCardBadge: {
      paddingHorizontal: 7,
      paddingVertical: 2,
      borderRadius: 6,
      alignSelf: "flex-start",
      marginTop: 3,
    },
    subCardBadgeActive: { backgroundColor: "rgba(22,163,74,0.18)" },
    subCardBadgeExpired: { backgroundColor: "rgba(239,68,68,0.15)" },
    subCardBadgeActiveText: { fontSize: 10, fontWeight: "700", color: "#4ade80" },
    subCardBadgeExpiredText: { fontSize: 10, fontWeight: "700", color: "#f87171" },
    subCardChevron: { paddingLeft: 8 },
  });
}

export function SubscribersList({
  externalData,
  externalLoading,
  showSearch = false,
  emptyLabel,
}: Props) {
  const navigation =
    useNavigation<NativeStackNavigationProp<StaffStackParamList>>();
  const venueId = useAuthStore((s) => s.venueId);
  const theme = useAppColors();
  const styles = useMemo(() => createStyles(theme), [theme]);

  const [search, setSearch] = useState("");
  const [internalData, setInternalData] = useState<SubscriberRow[]>([]);
  const [internalLoading, setInternalLoading] = useState(false);

  const isSelfManaged = externalData === undefined;

  const fetchSubscribers = useCallback(async () => {
    if (!venueId || !isSelfManaged) return;
    setInternalLoading(true);
    try {
      const params = new URLSearchParams({ venueId });
      if (search.trim()) params.set("search", search.trim());
      const raw = await api.get<{
        subscribers: Array<{
          id: string;
          status: string;
          sessionsRemaining: number | null;
          activatedAt: string;
          expiresAt: string;
          player: { name: string; phone: string };
          package: { name: string; sessions: number | null };
          _count?: { usages: number };
          lastCheckedIn?: string | null;
        }>;
      }>(`/api/courtpay/staff/subscribers?${params.toString()}`);
      setInternalData(
        (raw.subscribers ?? []).map((s) => ({
          id: s.id,
          playerName: s.player.name,
          playerPhone: s.player.phone,
          packageName: s.package.name,
          status: s.status,
          sessionsRemaining: s.sessionsRemaining,
          totalSessions: s.package.sessions,
          usageCount: s._count?.usages ?? 0,
          activatedAt: s.activatedAt,
          expiresAt: s.expiresAt,
          lastCheckedIn: s.lastCheckedIn ?? null,
        }))
      );
    } catch {
      /* ignore */
    } finally {
      setInternalLoading(false);
    }
  }, [venueId, isSelfManaged, search]);

  useEffect(() => {
    void fetchSubscribers();
  }, [fetchSubscribers]);

  const loading = isSelfManaged ? internalLoading : (externalLoading ?? false);
  const data = isSelfManaged ? internalData : (externalData ?? []);

  if (loading) {
    return (
      <View style={{ paddingVertical: 32 }}>
        <ActivityIndicator color={theme.purple400} />
      </View>
    );
  }

  return (
    <>
      {showSearch && (
        <TextInput
          style={styles.search}
          placeholder="Search by name or phone…"
          placeholderTextColor={theme.dimmed}
          value={search}
          onChangeText={setSearch}
          autoCapitalize="none"
        />
      )}

      {data.length === 0 ? (
        <Text style={styles.empty}>
          {emptyLabel ?? (search.trim() ? "No subscribers found" : "No subscribers yet")}
        </Text>
      ) : (
        data.map((s) => {
          const isActive = s.status === "active";
          const sessionsLabel =
            s.totalSessions === null
              ? `Unlimited · ${s.usageCount} used`
              : `${s.sessionsRemaining ?? 0}/${s.totalSessions} left · ${s.usageCount} used`;

          return (
            <TouchableOpacity
              key={s.id}
              style={styles.subCard}
              activeOpacity={0.7}
              onPress={() =>
                navigation.navigate("BossSubscriptionDetail", {
                  subscriptionId: s.id,
                })
              }
            >
              <View style={styles.subCardMain}>
                <Text style={styles.subCardName} numberOfLines={1}>
                  {s.playerName}
                </Text>
                <Text style={styles.subCardPkg}>{s.packageName}</Text>
                <Text style={styles.subCardMeta}>{s.playerPhone}</Text>
                <Text style={styles.subCardMeta}>{sessionsLabel}</Text>
                <Text style={styles.subCardMeta}>
                  Purchased: {formatDateShort(s.activatedAt)}
                  {s.lastCheckedIn
                    ? `  ·  Last in: ${formatDateShort(s.lastCheckedIn)}`
                    : "  ·  No check-ins"}
                </Text>
                <View
                  style={[
                    styles.subCardBadge,
                    isActive ? styles.subCardBadgeActive : styles.subCardBadgeExpired,
                  ]}
                >
                  <Text
                    style={
                      isActive
                        ? styles.subCardBadgeActiveText
                        : styles.subCardBadgeExpiredText
                    }
                  >
                    {s.status.toUpperCase()}
                  </Text>
                </View>
              </View>
              <View style={styles.subCardChevron}>
                <Ionicons name="chevron-forward" size={16} color={theme.muted} />
              </View>
            </TouchableOpacity>
          );
        })
      )}
    </>
  );
}
