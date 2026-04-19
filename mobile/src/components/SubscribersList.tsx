/**
 * SubscribersList
 *
 * Reusable component rendering the CourtPay subscriber list with:
 * - Enhanced subscription cards (name, package, phone, sessions, dates, status badge)
 * - Tap to navigate to BossSubscriptionDetail
 * - Optional search bar (enabled when showSearch={true})
 * - Self-managed mode: fetches paginated data (30 per page) with infinite scroll
 * - External mode: accepts `externalData` + `externalLoading` (e.g. Boss Dashboard tab)
 */
import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  View,
  Text,
  TouchableOpacity,
  StyleSheet,
  ActivityIndicator,
  TextInput,
  FlatList,
  RefreshControl,
  type ListRenderItem,
} from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { useFocusEffect, useNavigation } from "@react-navigation/native";
import type { NativeStackNavigationProp } from "@react-navigation/native-stack";
import { api } from "../lib/api-client";
import { useAuthStore } from "../stores/auth-store";
import { useAppColors } from "../theme/use-app-colors";
import type { AppColors } from "../theme/palettes";
import type { StaffStackParamList } from "../navigation/types";

const PAGE_SIZE = 30;

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
  /** If provided, the component uses this data instead of fetching (no pagination). */
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
    loadingMore: { paddingVertical: 16, alignItems: "center" },
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

  const isSelfManaged = externalData === undefined;

  // ── Self-managed pagination state ──────────────────────────────────────────
  const [search, setSearch] = useState("");
  const [internalData, setInternalData] = useState<SubscriberRow[]>([]);
  const [internalLoading, setInternalLoading] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const [loadingMore, setLoadingMore] = useState(false);
  const [page, setPage] = useState(0);
  const [hasMore, setHasMore] = useState(true);
  // debounce search to avoid spamming the API
  const searchDebounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const fetchPage = useCallback(
    async (pageIndex: number, searchTerm: string, replace: boolean) => {
      if (!venueId || !isSelfManaged) return;
      if (replace) setInternalLoading(true);
      else setLoadingMore(true);
      try {
        const params = new URLSearchParams({
          venueId,
          limit: String(PAGE_SIZE),
          offset: String(pageIndex * PAGE_SIZE),
        });
        if (searchTerm.trim()) params.set("search", searchTerm.trim());
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
        const rows = (raw.subscribers ?? []).map((s) => ({
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
        }));
        setHasMore(rows.length === PAGE_SIZE);
        setInternalData((prev) => (replace ? rows : [...prev, ...rows]));
        setPage(pageIndex);
      } catch {
        /* ignore */
      } finally {
        setInternalLoading(false);
        setLoadingMore(false);
      }
    },
    [venueId, isSelfManaged]
  );

  // Initial load + search change
  useEffect(() => {
    if (!isSelfManaged) return;
    if (searchDebounceRef.current) clearTimeout(searchDebounceRef.current);
    searchDebounceRef.current = setTimeout(() => {
      void fetchPage(0, search, true);
    }, 300);
    return () => {
      if (searchDebounceRef.current) clearTimeout(searchDebounceRef.current);
    };
  }, [search, isSelfManaged, fetchPage]);

  const handleLoadMore = () => {
    if (!isSelfManaged || loadingMore || !hasMore || internalLoading) return;
    void fetchPage(page + 1, search, false);
  };

  const handleRefresh = useCallback(() => {
    if (!isSelfManaged) return;
    setRefreshing(true);
    void fetchPage(0, search, true).finally(() => setRefreshing(false));
  }, [isSelfManaged, fetchPage, search]);

  // When coming back from subscription detail, re-fetch current list
  useFocusEffect(
    useCallback(() => {
      if (!isSelfManaged) return;
      void fetchPage(0, search, true);
    }, [isSelfManaged, fetchPage, search])
  );

  // ── Derived values ─────────────────────────────────────────────────────────
  const loading = isSelfManaged ? internalLoading : (externalLoading ?? false);
  const data = isSelfManaged ? internalData : (externalData ?? []);

  // ── Render helpers ─────────────────────────────────────────────────────────
  const renderItem: ListRenderItem<SubscriberRow> = useCallback(
    ({ item: s }) => {
      const isActive = s.status === "active";
      const sessionsLabel =
        s.totalSessions === null
          ? `Unlimited · ${s.usageCount} used`
          : `${s.sessionsRemaining ?? 0}/${s.totalSessions} left · ${s.usageCount} used`;

      return (
        <TouchableOpacity
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
    },
    [styles, theme, navigation]
  );

  const listFooter = useMemo(() => {
    if (!isSelfManaged) return null;
    if (loadingMore)
      return (
        <View style={styles.loadingMore}>
          <ActivityIndicator color={theme.purple400} />
        </View>
      );
    return null;
  }, [isSelfManaged, loadingMore, styles, theme]);

  // ── External data mode: plain list (no pagination) ────────────────────────
  if (!isSelfManaged) {
    if (loading) {
      return (
        <View style={{ paddingVertical: 32 }}>
          <ActivityIndicator color={theme.purple400} />
        </View>
      );
    }
    return (
      <>
        {data.length === 0 ? (
          <Text style={styles.empty}>
            {emptyLabel ?? "No subscribers yet"}
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

  // ── Self-managed mode: FlatList with pagination ───────────────────────────
  if (loading && data.length === 0) {
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
      <FlatList
        data={data}
        keyExtractor={(item) => item.id}
        renderItem={renderItem}
        ListEmptyComponent={
          <Text style={styles.empty}>
            {emptyLabel ?? (search.trim() ? "No subscribers found" : "No subscribers yet")}
          </Text>
        }
        ListFooterComponent={listFooter}
        onEndReached={handleLoadMore}
        onEndReachedThreshold={0.3}
        refreshControl={
          <RefreshControl
            refreshing={refreshing}
            onRefresh={handleRefresh}
            tintColor={theme.purple400}
          />
        }
      />
    </>
  );
}
