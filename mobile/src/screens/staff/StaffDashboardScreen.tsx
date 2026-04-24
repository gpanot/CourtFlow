import React, {
  useCallback,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import {
  View,
  Text,
  ScrollView,
  TouchableOpacity,
  StyleSheet,
  ActivityIndicator,
  RefreshControl,
  TextInput,
  Modal,
  Share,
} from "react-native";
import { Ionicons } from "@expo/vector-icons";
import QRCode from "react-native-qrcode-svg";
import { useNavigation } from "@react-navigation/native";
import type { NativeStackNavigationProp } from "@react-navigation/native-stack";
import { api } from "../../lib/api-client";
import { useAuthStore } from "../../stores/auth-store";
import { ENV } from "../../config/env";
import { useAppColors } from "../../theme/use-app-colors";
import type { AppColors } from "../../theme/palettes";
import type { StaffStackParamList } from "../../navigation/types";
import { SubscribersList } from "../../components/SubscribersList";
import { useTabletKioskLocale } from "../../hooks/useTabletKioskLocale";
import { PlayerCard } from "../../components/PlayerCard";

type Tab = "subscribers" | "players";
type GenderFilter = "all" | "male" | "female";

interface PlayerRow {
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

interface PlayersData {
  players: PlayerRow[];
  stats: {
    totalPlayers: number;
    newThisWeek: number;
    activeSubscriptions: number;
    venueAvgReturn: number | null;
    maleCount: number;
    femaleCount: number;
    /** avg check-in count per player (times they returned) */
    venueAvgCheckIns?: number | null;
  };
}

function createStyles(t: AppColors) {
  return StyleSheet.create({
    screen: { flex: 1, backgroundColor: t.bg },
    tabs: {
      flexDirection: "row",
      gap: 4,
      paddingHorizontal: 12,
      paddingVertical: 10,
      borderBottomWidth: 1,
      borderBottomColor: t.border,
    },
    tab: { flex: 1, paddingVertical: 10, borderRadius: 8, alignItems: "center" },
    tabOn: { backgroundColor: "rgba(37,99,235,0.18)" },
    tabText: { fontSize: 13, fontWeight: "600", color: t.muted },
    tabTextOn: { color: t.blue400 },
    body: { padding: 16, paddingBottom: 40 },

    // ── Stats grid ───────────────────────────────────────────────────────────
    grid: { flexDirection: "row", flexWrap: "wrap", gap: 10, marginBottom: 16 },
    statCard: {
      width: "48%",
      borderRadius: 12,
      borderWidth: 1,
      borderColor: t.border,
      backgroundColor: t.card,
      padding: 14,
    },
    statLabel: { fontSize: 11, color: t.muted, marginBottom: 4 },
    statValue: { fontSize: 22, fontWeight: "700", color: t.text },
    statPurple: { color: t.purple400 },
    statYellow: { color: t.amber400 },

    empty: { textAlign: "center", color: t.muted, paddingVertical: 24, fontSize: 14 },

    // ── Players tab ──────────────────────────────────────────────────────────
    playerFilterRow: {
      flexDirection: "row",
      alignItems: "center",
      gap: 6,
      marginBottom: 10,
      flexWrap: "wrap",
    },
    filterChip: {
      paddingHorizontal: 10,
      paddingVertical: 5,
      borderRadius: 16,
      borderWidth: 1,
      borderColor: t.border,
      backgroundColor: t.card,
    },
    filterChipActive: {
      borderColor: t.blue400,
      backgroundColor: "rgba(37,99,235,0.15)",
    },
    filterChipText: { fontSize: 12, fontWeight: "600", color: t.muted },
    filterChipTextActive: { color: t.blue400 },
    searchIconBtn: {
      marginLeft: "auto" as never,
      padding: 6,
    },
    searchContainer: {
      flexDirection: "row",
      alignItems: "center",
      borderRadius: 10,
      borderWidth: 1,
      borderColor: t.border,
      backgroundColor: t.card,
      paddingHorizontal: 10,
      paddingVertical: 7,
      marginBottom: 10,
    },
    searchInput: {
      flex: 1,
      fontSize: 14,
      color: t.text,
      padding: 0,
    },
    // ── Share card (subscribers tab) ─────────────────────────────────────
    shareCard: {
      borderRadius: 12,
      borderWidth: 1,
      borderColor: t.border,
      backgroundColor: t.card,
      padding: 14,
      marginBottom: 12,
    },
    shareCardTitle: { fontSize: 13, fontWeight: "700", color: t.text, marginBottom: 6 },
    shareCardDesc: { fontSize: 12, color: t.muted, marginBottom: 10, lineHeight: 17 },
    shareBtn: {
      flexDirection: "row",
      alignItems: "center",
      justifyContent: "center",
      gap: 6,
      backgroundColor: "#9333ea",
      paddingVertical: 10,
      borderRadius: 9,
    },
    shareBtnText: { color: "#fff", fontWeight: "700", fontSize: 13 },
    shareModalOverlay: { flex: 1, backgroundColor: "rgba(0,0,0,0.6)", justifyContent: "flex-end" },
    shareModalCard: {
      backgroundColor: t.bg,
      borderTopLeftRadius: 20,
      borderTopRightRadius: 20,
      borderWidth: 1,
      borderColor: t.border,
      padding: 24,
      paddingBottom: 40,
    },
    shareModalTitle: { fontSize: 16, fontWeight: "700", color: t.text, marginBottom: 6 },
    shareModalSub: { fontSize: 13, color: t.muted, marginBottom: 16, lineHeight: 18 },
    shareModalUrl: {
      backgroundColor: t.inputBg,
      borderRadius: 10,
      borderWidth: 1,
      borderColor: t.border,
      padding: 12,
      fontSize: 12,
      color: t.purple400,
      marginBottom: 16,
      lineHeight: 18,
    },
    shareModalActions: { flexDirection: "row", gap: 10 },
    shareModalClose: {
      flex: 1,
      paddingVertical: 12,
      borderRadius: 10,
      borderWidth: 1,
      borderColor: t.border,
      alignItems: "center",
    },
    shareModalCloseText: { color: t.muted, fontWeight: "600", fontSize: 14 },
    shareModalShare: {
      flex: 2,
      paddingVertical: 12,
      borderRadius: 10,
      backgroundColor: "#9333ea",
      alignItems: "center",
    },
    shareModalShareText: { color: "#fff", fontWeight: "700", fontSize: 14 },
    shareQrWrap: {
      alignItems: "center",
      justifyContent: "center",
      padding: 12,
      borderRadius: 12,
      backgroundColor: "#fff",
      alignSelf: "center",
      marginBottom: 16,
    },
  });
}

export function StaffDashboardScreen() {
  const navigation =
    useNavigation<NativeStackNavigationProp<StaffStackParamList>>();
  const venueId = useAuthStore((s) => s.venueId);
  const theme = useAppColors();
  const styles = useMemo(() => createStyles(theme), [theme]);
  const { t } = useTabletKioskLocale();

  const [tab, setTab] = useState<Tab>("subscribers");
  const [showShareModal, setShowShareModal] = useState(false);

  const balanceUrl = venueId ? `${ENV.API_BASE_URL}/my-balance/${venueId}` : "";

  // Players state
  const [playersLoading, setPlayersLoading] = useState(false);
  const [playersRefreshing, setPlayersRefreshing] = useState(false);
  const [playersData, setPlayersData] = useState<PlayersData | null>(null);
  const [genderFilter, setGenderFilter] = useState<GenderFilter>("all");
  const [playerSearch, setPlayerSearch] = useState("");
  const [searchVisible, setSearchVisible] = useState(false);
  const searchRef = useRef<TextInput>(null);


  // Track which tabs have been loaded — never re-fetch on tab switch
  const loadedTabs = useRef(new Set<Tab>());

  useLayoutEffect(() => {
    navigation.setOptions({
      title: t("staffDashboardTitle"),
      headerStyle: { backgroundColor: theme.bg },
      headerTintColor: theme.text,
      headerTitleStyle: { color: theme.text, fontWeight: "700" },
    });
  }, [navigation, theme, t]);

  const fetchPlayers = useCallback(
    async (force = false) => {
      if (!venueId) return;
      if (!force && loadedTabs.current.has("players")) return;

      setPlayersLoading(true);
      try {
        const data = await api.get<PlayersData>(
          `/api/courtpay/staff/boss/players?venueId=${venueId}`
        );
        setPlayersData(data);
        loadedTabs.current.add("players");
      } catch {
        /* ignore */
      } finally {
        setPlayersLoading(false);
        setPlayersRefreshing(false);
      }
    },
    [venueId]
  );

  // Fetch players only when players tab is active and not yet loaded
  useEffect(() => {
    if (tab === "players") {
      void fetchPlayers();
    }
  }, [tab, fetchPlayers]);

  const handlePlayersRefresh = () => {
    setPlayersRefreshing(true);
    loadedTabs.current.delete("players");
    void fetchPlayers(true);
  };


  return (
    <View style={styles.screen}>
      {/* Tab bar */}
      <View style={styles.tabs}>
        {(
          [
            { id: "subscribers" as const, label: t("staffDashboardTabSubscribers") },
            { id: "players" as const, label: t("staffDashboardTabPlayers") },
          ] as const
        ).map(({ id, label }) => (
          <TouchableOpacity
            key={id}
            style={[styles.tab, tab === id && styles.tabOn]}
            onPress={() => setTab(id)}
          >
            <Text style={[styles.tabText, tab === id && styles.tabTextOn]}>
              {label}
            </Text>
          </TouchableOpacity>
        ))}
      </View>

      {/*
       * Both tab bodies stay mounted inside a relative container so state
       * (scroll position, loaded data) is preserved when switching tabs.
       * The inactive tab is hidden via opacity:0 + pointerEvents:"none"
       * placed absolutely behind the active tab.
       */}
      <View style={{ flex: 1, position: "relative" }}>

      {/* ── Subscribers tab ──────────────────────────────────────────────── */}
      <View
        style={[
          StyleSheet.absoluteFillObject,
          { opacity: tab === "subscribers" ? 1 : 0, padding: 16, paddingBottom: 0 },
        ]}
        pointerEvents={tab === "subscribers" ? "auto" : "none"}
      >
        {venueId ? (
          <View style={styles.shareCard}>
            <Text style={styles.shareCardTitle}>{t("staffDashboardShareTitle")}</Text>
            <Text style={styles.shareCardDesc}>
              {t("staffDashboardShareDesc")}
            </Text>
            <TouchableOpacity
              style={styles.shareBtn}
              onPress={() => setShowShareModal(true)}
              activeOpacity={0.8}
            >
              <Ionicons name="share-outline" size={16} color="#fff" />
              <Text style={styles.shareBtnText}>{t("staffDashboardShareBtn")}</Text>
            </TouchableOpacity>
          </View>
        ) : null}
        <SubscribersList showSearch />
      </View>

      {/* ── Players tab ──────────────────────────────────────────────────── */}
      <View
        style={[
          StyleSheet.absoluteFillObject,
          { opacity: tab === "players" ? 1 : 0 },
        ]}
        pointerEvents={tab === "players" ? "auto" : "none"}
      >
        {playersLoading && !playersData ? (
          <View style={{ paddingTop: 40 }}>
            <ActivityIndicator color={theme.blue400} />
          </View>
        ) : (
          <ScrollView
            contentContainerStyle={styles.body}
            refreshControl={
              <RefreshControl
                refreshing={playersRefreshing}
                onRefresh={handlePlayersRefresh}
                tintColor={theme.blue400}
              />
            }
          >
            {/* KPI stats */}
            {playersData && (
              <View style={styles.grid}>
                <View style={styles.statCard}>
                  <Text style={styles.statLabel}>{t("staffDashboardTotalPlayers")}</Text>
                  <Text style={styles.statValue}>
                    {playersData.stats.totalPlayers}
                  </Text>
                </View>
                <View style={styles.statCard}>
                  <Text style={styles.statLabel}>{t("staffDashboardNewThisWeek")}</Text>
                  <Text style={[styles.statValue, styles.statPurple]}>
                    {playersData.stats.newThisWeek}
                  </Text>
                </View>
                <View style={styles.statCard}>
                  <Text style={styles.statLabel}>{t("staffDashboardWithSub")}</Text>
                  <Text style={styles.statValue}>
                    {playersData.stats.activeSubscriptions}
                  </Text>
                </View>
                <View style={styles.statCard}>
                  <Text style={styles.statLabel}>{t("staffDashboardAvgVisits")}</Text>
                  <Text style={[styles.statValue, styles.statYellow]}>
                    {(() => {
                      // Prefer venueAvgCheckIns from API if available,
                      // otherwise compute from player list
                      const apiAvg = playersData.stats.venueAvgCheckIns;
                      if (apiAvg != null) return apiAvg.toFixed(1);
                      if (playersData.players.length === 0) return "—";
                      const total = playersData.players.reduce(
                        (sum, p) => sum + p.checkInCount,
                        0
                      );
                      return (total / playersData.players.length).toFixed(1);
                    })()}
                  </Text>
                </View>
              </View>
            )}

            {/* Filter + search bar */}
            <View style={styles.playerFilterRow}>
                {(["all", "male", "female"] as GenderFilter[]).map((g) => {
                const count =
                  g === "all"
                    ? (playersData?.stats.totalPlayers ?? 0)
                    : g === "male"
                    ? (playersData?.stats.maleCount ?? 0)
                    : (playersData?.stats.femaleCount ?? 0);
                const gLabel = g === "all" ? t("bossDashboardAll") : g === "male" ? t("bossDashboardMale") : t("bossDashboardFemale");
                return (
                  <TouchableOpacity
                    key={g}
                    style={[
                      styles.filterChip,
                      genderFilter === g && styles.filterChipActive,
                    ]}
                    onPress={() => setGenderFilter(g)}
                  >
                    <Text
                      style={[
                        styles.filterChipText,
                        genderFilter === g && styles.filterChipTextActive,
                      ]}
                    >
                      {gLabel} ({count})
                    </Text>
                  </TouchableOpacity>
                );
              })}
              <TouchableOpacity
                style={styles.searchIconBtn}
                onPress={() => {
                  setSearchVisible((v) => {
                    if (!v) setTimeout(() => searchRef.current?.focus(), 100);
                    return !v;
                  });
                  if (searchVisible) setPlayerSearch("");
                }}
              >
                <Ionicons
                  name={searchVisible ? "close" : "search"}
                  size={18}
                  color={theme.muted}
                />
              </TouchableOpacity>
            </View>

            {searchVisible && (
              <View style={styles.searchContainer}>
                <Ionicons
                  name="search"
                  size={14}
                  color={theme.muted}
                  style={{ marginRight: 6 }}
                />
                <TextInput
                  ref={searchRef}
                  style={styles.searchInput}
                  placeholder={t("bossDashboardSearchPlaceholder")}
                  placeholderTextColor={theme.muted}
                  value={playerSearch}
                  onChangeText={setPlayerSearch}
                  autoCapitalize="none"
                  returnKeyType="search"
                />
                {playerSearch.length > 0 && (
                  <TouchableOpacity onPress={() => setPlayerSearch("")}>
                    <Ionicons
                      name="close-circle"
                      size={16}
                      color={theme.muted}
                    />
                  </TouchableOpacity>
                )}
              </View>
            )}

            {/* Player list */}
            {!playersData ? (
              <Text style={styles.empty}>{t("staffDashboardNoPlayers")}</Text>
            ) : (
              (() => {
                const q = playerSearch.toLowerCase().trim();
                const filtered = playersData.players.filter((p) => {
                  const matchGender =
                    genderFilter === "all" ||
                    p.gender?.toLowerCase() === genderFilter;
                  const matchSearch =
                    !q ||
                    p.name.toLowerCase().includes(q) ||
                    (p.phone ?? "").includes(q);
                  return matchGender && matchSearch;
                });

                if (filtered.length === 0) {
                  return (
                    <Text style={styles.empty}>{t("staffDashboardNoPlayers")}</Text>
                  );
                }

                return filtered.map((p) => (
                  <PlayerCard
                    key={`${p.source}-${p.id}`}
                    player={p}
                    statKey="checkInCount"
                    statLabel={t("staffDashboardVisits")}
                    lastSeenLabel={t("staffDashboardLastSeen")}
                    onPress={() =>
                      navigation.navigate("StaffPlayerDetail", {
                        playerId: p.id,
                        source: p.source,
                      })
                    }
                  />
                ));
              })()
            )}
          </ScrollView>
        )}
      </View>

      </View>{/* end relative container */}

      {/* ── Share balance link modal ──────────────────────────────────────── */}
      <Modal
        visible={showShareModal}
        animationType="slide"
        transparent
        onRequestClose={() => setShowShareModal(false)}
      >
        <TouchableOpacity
          style={styles.shareModalOverlay}
          activeOpacity={1}
          onPress={() => setShowShareModal(false)}
        >
          <TouchableOpacity activeOpacity={1} onPress={() => {}}>
            <View style={styles.shareModalCard}>
              <Text style={styles.shareModalTitle}>{t("staffDashboardShareModalTitle")}</Text>
              <Text style={styles.shareModalSub}>
                {t("staffDashboardShareModalDesc")}
              </Text>
              {balanceUrl ? (
                <View style={styles.shareQrWrap}>
                  <QRCode value={balanceUrl} size={160} backgroundColor="#fff" color="#000" />
                </View>
              ) : null}
              <Text style={styles.shareModalUrl} selectable>
                {balanceUrl}
              </Text>
              <View style={styles.shareModalActions}>
                <TouchableOpacity
                  style={styles.shareModalClose}
                  onPress={() => setShowShareModal(false)}
                >
                  <Text style={styles.shareModalCloseText}>{t("staffDashboardShareModalClose")}</Text>
                </TouchableOpacity>
                <TouchableOpacity
                  style={styles.shareModalShare}
                  onPress={async () => {
                    try {
                      await Share.share({
                        message: `Check your session balance at ${balanceUrl}`,
                        url: balanceUrl,
                      });
                    } catch {
                      /* ignore */
                    }
                  }}
                >
                  <Text style={styles.shareModalShareText}>{t("staffDashboardShareModalShare")}</Text>
                </TouchableOpacity>
              </View>
            </View>
          </TouchableOpacity>
        </TouchableOpacity>
      </Modal>
    </View>
  );
}
