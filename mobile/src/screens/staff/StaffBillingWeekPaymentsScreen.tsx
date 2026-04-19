import React, { useCallback, useEffect, useLayoutEffect, useMemo, useState } from "react";
import {
  ActivityIndicator,
  FlatList,
  RefreshControl,
  StyleSheet,
  Text,
  View,
} from "react-native";
import { useNavigation, useRoute } from "@react-navigation/native";
import type { NativeStackNavigationProp } from "@react-navigation/native-stack";
import type { RouteProp } from "@react-navigation/native";
import { api } from "../../lib/api-client";
import { useAppColors } from "../../theme/use-app-colors";
import type { AppColors } from "../../theme/palettes";
import type { StaffStackParamList } from "../../navigation/types";

interface WeeklyPayment {
  id: string;
  playerName: string;
  playerPhone: string;
  amount: number;
  paymentRef: string | null;
  paymentMethod: string;
  type: string;
  status: string;
  confirmedAt: string;
  confirmedBy: string | null;
  cancelReason: string | null;
}

interface WeeklyPaymentsData {
  payments: WeeklyPayment[];
  summary: {
    totalPayments: number;
    totalAmount: number;
    sepayPayments: number;
    cancelledPayments: number;
    subscriptionPayments: number;
  };
}

function formatVND(amount: number) {
  return new Intl.NumberFormat("vi-VN").format(amount);
}

function paymentMethodLabel(method: string) {
  if (method === "cash") return "CASH";
  if (method === "subscription") return "SUB";
  return "QR";
}

function stylesForTheme(t: AppColors) {
  return StyleSheet.create({
    screen: { flex: 1, backgroundColor: t.bg },
    loading: { flex: 1, justifyContent: "center", alignItems: "center" },
    summary: {
      margin: 12,
      borderRadius: 12,
      borderWidth: 1,
      borderColor: t.border,
      backgroundColor: t.card,
      padding: 12,
      gap: 4,
    },
    summaryTitle: { color: t.text, fontSize: 14, fontWeight: "700" },
    summaryText: { color: t.muted, fontSize: 12 },
    listContent: { paddingHorizontal: 12, paddingBottom: 24, gap: 8 },
    card: {
      borderRadius: 12,
      borderWidth: 1,
      borderColor: t.border,
      backgroundColor: t.card,
      padding: 12,
      gap: 6,
    },
    row: { flexDirection: "row", justifyContent: "space-between", gap: 12 },
    name: { color: t.text, fontSize: 14, fontWeight: "700", flex: 1 },
    phone: { color: t.muted, fontSize: 12 },
    amount: { color: t.purple400, fontSize: 14, fontWeight: "700" },
    badges: { flexDirection: "row", gap: 6, flexWrap: "wrap" },
    badge: { borderRadius: 6, paddingHorizontal: 6, paddingVertical: 2 },
    badgeText: { fontSize: 10, fontWeight: "700" },
    meta: { color: t.muted, fontSize: 12 },
    ref: { color: t.subtle, fontSize: 10 },
    empty: { color: t.muted, textAlign: "center", paddingTop: 36 },
  });
}

export function StaffBillingWeekPaymentsScreen() {
  const navigation =
    useNavigation<NativeStackNavigationProp<StaffStackParamList>>();
  const route =
    useRoute<RouteProp<StaffStackParamList, "StaffBillingWeekPayments">>();
  const { venueId, weekStart, weekEnd } = route.params;
  const theme = useAppColors();
  const styles = useMemo(() => stylesForTheme(theme), [theme]);
  const [data, setData] = useState<WeeklyPaymentsData | null>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  useLayoutEffect(() => {
    const title = `${new Date(weekStart).toLocaleDateString(undefined, {
      day: "numeric",
      month: "short",
    })} → ${new Date(weekEnd).toLocaleDateString(undefined, {
      day: "numeric",
      month: "short",
    })}`;
    navigation.setOptions({
      title: `Week payments · ${title}`,
      headerStyle: { backgroundColor: theme.bg },
      headerTintColor: theme.text,
      headerTitleStyle: { color: theme.text },
      headerShadowVisible: false,
    });
  }, [navigation, theme, weekStart, weekEnd]);

  const fetchWeekPayments = useCallback(async () => {
    try {
      const res = await api.get<WeeklyPaymentsData>(
        `/api/staff/boss-dashboard/billing/week-payments?venueId=${venueId}&weekStart=${weekStart}&weekEnd=${weekEnd}`
      );
      setData(res);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [venueId, weekStart, weekEnd]);

  useEffect(() => {
    void fetchWeekPayments();
  }, [fetchWeekPayments]);

  if (loading) {
    return (
      <View style={styles.loading}>
        <ActivityIndicator color={theme.purple400} />
      </View>
    );
  }

  return (
    <View style={styles.screen}>
      {data && (
        <View style={styles.summary}>
          <Text style={styles.summaryTitle}>{data.summary.totalPayments} payments</Text>
          <Text style={styles.summaryText}>
            {formatVND(data.summary.totalAmount)} VND · {data.summary.sepayPayments} SePay ·{" "}
            {data.summary.cancelledPayments} cancelled
          </Text>
        </View>
      )}
      <FlatList
        data={data?.payments ?? []}
        keyExtractor={(item) => item.id}
        refreshControl={
          <RefreshControl
            refreshing={refreshing}
            onRefresh={() => {
              setRefreshing(true);
              void fetchWeekPayments();
            }}
            tintColor={theme.purple400}
          />
        }
        contentContainerStyle={styles.listContent}
        renderItem={({ item }) => (
          <View style={styles.card}>
            <View style={styles.row}>
              <View style={{ flex: 1 }}>
                <Text style={styles.name}>{item.playerName}</Text>
                <Text style={styles.phone}>{item.playerPhone}</Text>
              </View>
              <Text style={styles.amount}>{formatVND(item.amount)} VND</Text>
            </View>
            <View style={styles.badges}>
              <View style={[styles.badge, { backgroundColor: "rgba(37,99,235,0.18)" }]}>
                <Text style={[styles.badgeText, { color: theme.blue400 }]}>
                  {paymentMethodLabel(item.paymentMethod)}
                </Text>
              </View>
              <View style={[styles.badge, { backgroundColor: "rgba(217,70,239,0.2)" }]}>
                <Text style={[styles.badgeText, { color: theme.fuchsia300 }]}>COURTPAY</Text>
              </View>
              <View style={[styles.badge, { backgroundColor: "rgba(22,163,74,0.18)" }]}>
                <Text style={[styles.badgeText, { color: theme.green400 }]}>
                  {item.confirmedBy === "sepay" ? "SEPAY" : "MANUAL"}
                </Text>
              </View>
              {item.status === "cancelled" && (
                <View style={[styles.badge, { backgroundColor: "rgba(239,68,68,0.2)" }]}>
                  <Text style={[styles.badgeText, { color: theme.red400 }]}>CANCELLED</Text>
                </View>
              )}
            </View>
            <Text style={styles.meta}>
              {item.type} · {new Date(item.confirmedAt).toLocaleString()}
            </Text>
            {item.cancelReason ? (
              <Text style={[styles.meta, { color: theme.red400 }]}>
                Cancel reason: {item.cancelReason}
              </Text>
            ) : null}
            {item.paymentRef ? <Text style={styles.ref}>{item.paymentRef}</Text> : null}
          </View>
        )}
        ListEmptyComponent={<Text style={styles.empty}>No payments for this week.</Text>}
      />
    </View>
  );
}
