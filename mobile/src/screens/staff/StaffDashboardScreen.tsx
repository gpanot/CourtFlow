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
  Image,
} from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { useNavigation } from "@react-navigation/native";
import type { NativeStackNavigationProp } from "@react-navigation/native-stack";
import { api } from "../../lib/api-client";
import { useAuthStore } from "../../stores/auth-store";
import { useAppColors } from "../../theme/use-app-colors";
import type { AppColors } from "../../theme/palettes";
import type { StaffStackParamList } from "../../navigation/types";
import { SubscribersList } from "../../components/SubscribersList";
import { resolveMediaUrl } from "../../lib/media-url";

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
    playerCardGender: { fontSize: 13, color: t.muted },
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
    playerCardCheckinCount: {
      fontSize: 20,
      fontWeight: "700",
      color: t.text,
    },
    playerCardCheckinLabel: { fontSize: 10, color: t.muted, textAlign: "center" },
  });
}

export function StaffDashboardScreen() {
  const navigation =
    useNavigation<NativeStackNavigationProp<StaffStackParamList>>();
  const venueId = useAuthStore((s) => s.venueId);
  const theme = useAppColors();
  const styles = useMemo(() => createStyles(theme), [theme]);

  const [tab, setTab] = useState<Tab>("subscribers");

  // Players state
  const [playersLoading, setPlayersLoading] = useState(false);
  const [playersRefreshing, setPlayersRefreshing] = useState(false);
  const [playersData, setPlayersData] = useState<PlayersData | null>(null);
  const [genderFilter, setGenderFilter] = useState<GenderFilter>("all");
  const [playerSearch, setPlayerSearch] = useState("");
  const [searchVisible, setSearchVisible] = useState(false);
  const searchRef = useRef<TextInput>(null);

  // Subscribers tab refresh signal
  const [subsRefreshKey, setSubsRefreshKey] = useState(0);
  const [subsRefreshing, setSubsRefreshing] = useState(false);

  // Track which tabs have been loaded — never re-fetch on tab switch
  const loadedTabs = useRef(new Set<Tab>());

  useLayoutEffect(() => {
    navigation.setOptions({
      title: "Staff Dashboard",
      headerStyle: { backgroundColor: theme.bg },
      headerTintColor: theme.text,
      headerTitleStyle: { color: theme.text, fontWeight: "700" },
    });
  }, [navigation, theme]);

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

  const handleSubsRefresh = () => {
    setSubsRefreshing(true);
    // bump the key to remount SubscribersList (forces re-fetch from page 0)
    setSubsRefreshKey((k) => k + 1);
    // give a tiny delay so the refreshControl feels responsive
    setTimeout(() => setSubsRefreshing(false), 600);
  };

  return (
    <View style={styles.screen}>
      {/* Tab bar */}
      <View style={styles.tabs}>
        {(
          [
            { id: "subscribers" as const, label: "Subscribers" },
            { id: "players" as const, label: "Players" },
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
      <ScrollView
        style={[
          StyleSheet.absoluteFillObject,
          { opacity: tab === "subscribers" ? 1 : 0 },
        ]}
        pointerEvents={tab === "subscribers" ? "auto" : "none"}
        contentContainerStyle={styles.body}
        refreshControl={
          <RefreshControl
            refreshing={subsRefreshing}
            onRefresh={handleSubsRefresh}
            tintColor={theme.blue400}
          />
        }
      >
        <SubscribersList key={subsRefreshKey} showSearch />
      </ScrollView>

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
                  <Text style={styles.statLabel}>Total players</Text>
                  <Text style={styles.statValue}>
                    {playersData.stats.totalPlayers}
                  </Text>
                </View>
                <View style={styles.statCard}>
                  <Text style={styles.statLabel}>New this week</Text>
                  <Text style={[styles.statValue, styles.statPurple]}>
                    {playersData.stats.newThisWeek}
                  </Text>
                </View>
                <View style={styles.statCard}>
                  <Text style={styles.statLabel}>With subscription</Text>
                  <Text style={styles.statValue}>
                    {playersData.stats.activeSubscriptions}
                  </Text>
                </View>
                <View style={styles.statCard}>
                  <Text style={styles.statLabel}>Avg visits / player</Text>
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
                      {g.charAt(0).toUpperCase() + g.slice(1)} ({count})
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
                  placeholder="Search by name or phone…"
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
              <Text style={styles.empty}>No players found.</Text>
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
                    <Text style={styles.empty}>No players found.</Text>
                  );
                }

                return filtered.map((p) => {
                  const photoUri = resolveMediaUrl(
                    p.avatarPhotoPath ?? p.facePhotoPath ?? null
                  );
                  const initials = p.name.trim().charAt(0).toUpperCase();
                  const isCourtPay = p.source === "courtpay";
                  const genderIcon =
                    p.gender?.toLowerCase() === "female"
                      ? "♀"
                      : p.gender?.toLowerCase() === "male"
                      ? "♂"
                      : "?";

                  return (
                    <View
                      key={`${p.source}-${p.id}`}
                      style={styles.playerCard}
                    >
                      <View style={styles.playerAvatarWrap}>
                        {photoUri ? (
                          <Image
                            source={{ uri: photoUri }}
                            style={styles.playerAvatar}
                            resizeMode="cover"
                          />
                        ) : (
                          <View style={styles.playerAvatarFallback}>
                            <Text style={styles.playerAvatarInitials}>
                              {initials}
                            </Text>
                          </View>
                        )}
                      </View>

                      <View style={styles.playerCardMain}>
                        <View style={styles.playerCardNameRow}>
                          <Text
                            style={styles.playerCardName}
                            numberOfLines={1}
                          >
                            {p.name}
                          </Text>
                          <Text style={styles.playerCardGender}>
                            {genderIcon}
                          </Text>
                        </View>
                        <Text style={styles.playerCardPhone}>{p.phone}</Text>
                        <View style={styles.playerCardTagRow}>
                          <View style={styles.playerTagVenue}>
                            <Ionicons
                              name="location-outline"
                              size={10}
                              color={theme.muted}
                            />
                            <Text
                              style={styles.playerTagVenueText}
                              numberOfLines={1}
                            >
                              {p.venueName}
                            </Text>
                          </View>
                          <View
                            style={[
                              styles.playerTagSource,
                              isCourtPay
                                ? styles.playerTagSourceCP
                                : styles.playerTagSourceSelf,
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
                                {p.skillLevel.charAt(0).toUpperCase() +
                                  p.skillLevel.slice(1)}
                              </Text>
                            </View>
                          )}
                        </View>
                        {p.lastSeenAt && (
                          <Text style={styles.playerCardLastSeen}>
                            Last seen: {formatDateShort(p.lastSeenAt)}
                          </Text>
                        )}
                      </View>

                      <View style={styles.playerCardRight}>
                        <Text
                          style={[
                            styles.playerCardCheckinCount,
                            p.checkInCount > 0 ? styles.statYellow : undefined,
                          ]}
                        >
                          {p.checkInCount > 0 ? p.checkInCount : "—"}
                        </Text>
                        <Text style={styles.playerCardCheckinLabel}>
                          visits
                        </Text>
                      </View>
                    </View>
                  );
                });
              })()
            )}
          </ScrollView>
        )}
      </View>

      </View>{/* end relative container */}
    </View>
  );
}
