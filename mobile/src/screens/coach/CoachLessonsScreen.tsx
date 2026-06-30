import React, { useEffect, useState, useMemo } from "react";
import {
  View,
  Text,
  ScrollView,
  StyleSheet,
  ActivityIndicator,
} from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { useAppColors } from "../../theme/use-app-colors";
import { useTabletKioskLocale } from "../../hooks/useTabletKioskLocale";
import { api } from "../../lib/api-client";
import type { AppColors } from "../../theme/palettes";

interface Lesson {
  id: string;
  date: string;
  startTime: string;
  endTime: string;
  status: string;
  paymentStatus: string;
  priceValue: number;
  player: { name: string };
  package: { name: string; lessonType: string } | null;
  court: { label: string } | null;
}

function statusColor(status: string, t: AppColors): string {
  switch (status) {
    case "confirmed":        return t.green400;
    case "pending_approval": return t.amber400;
    case "cancelled":        return t.red400;
    case "completed":        return t.muted;
    default:                 return t.textSecondary;
  }
}

function formatTime(iso: string): string {
  return new Date(iso).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
}

function formatDate(dateStr: string): string {
  const d = new Date(dateStr + "T12:00:00");
  return d.toLocaleDateString([], { weekday: "short", month: "short", day: "numeric" });
}

function formatPrice(value: number): string {
  return value.toLocaleString("vi-VN") + " ₫";
}

function createStyles(t: AppColors) {
  return StyleSheet.create({
    container: { flex: 1, backgroundColor: t.bg },
    content: { padding: 16, paddingBottom: 60, gap: 12 },

    center: { flex: 1, justifyContent: "center", alignItems: "center" },
    emptyText: { color: t.muted, fontSize: 14, textAlign: "center", marginTop: 32 },

    sectionTitle: {
      fontSize: 11,
      fontWeight: "600",
      color: t.subtle,
      textTransform: "uppercase",
      letterSpacing: 0.8,
      marginTop: 4,
      marginBottom: 4,
    },

    card: {
      borderRadius: 12,
      borderWidth: 1,
      borderColor: t.border,
      backgroundColor: t.card,
      padding: 14,
      gap: 6,
    },
    cardTopRow: {
      flexDirection: "row",
      justifyContent: "space-between",
      alignItems: "flex-start",
    },
    playerName: { fontSize: 14, fontWeight: "600", color: t.text, flex: 1, marginRight: 8 },
    statusBadge: { fontSize: 12, fontWeight: "600" },
    dateTimeRow: { fontSize: 13, color: t.textSecondary },
    packageRow: { fontSize: 12, color: t.muted },
    priceRow: { fontSize: 13, fontWeight: "600", color: t.amber400, marginTop: 2 },
  });
}

export function CoachLessonsScreen() {
  const theme = useAppColors();
  const styles = useMemo(() => createStyles(theme), [theme]);
  const { t } = useTabletKioskLocale();

  const [lessons, setLessons] = useState<Lesson[] | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      try {
        const data = await api.get<Lesson[]>("/api/admin/coach-portal/lessons");
        if (!cancelled) setLessons(data);
      } catch {
        if (!cancelled) setLessons([]);
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => { cancelled = true; };
  }, []);

  if (loading) {
    return (
      <View style={styles.center}>
        <ActivityIndicator color={theme.blue400} />
      </View>
    );
  }

  if (!lessons || lessons.length === 0) {
    return (
      <View style={styles.center}>
        <Ionicons name="calendar-outline" size={40} color={theme.dimmed} />
        <Text style={styles.emptyText}>{t("coachPortalNoLessons")}</Text>
      </View>
    );
  }

  const now = new Date();
  const upcoming = lessons.filter(
    (l) => new Date(l.startTime) >= now && l.status !== "cancelled"
  );
  const past = lessons.filter(
    (l) => new Date(l.startTime) < now || l.status === "cancelled"
  );

  function LessonCard({ lesson }: { lesson: Lesson }) {
    return (
      <View style={styles.card}>
        <View style={styles.cardTopRow}>
          <Text style={styles.playerName}>{lesson.player.name}</Text>
          <Text style={[styles.statusBadge, { color: statusColor(lesson.status, theme) }]}>
            {lesson.status.replace("_", " ")}
          </Text>
        </View>
        <Text style={styles.dateTimeRow}>
          {formatDate(lesson.date)} · {formatTime(lesson.startTime)}–{formatTime(lesson.endTime)}
        </Text>
        {lesson.package && (
          <Text style={styles.packageRow}>{lesson.package.name}</Text>
        )}
        {lesson.court && (
          <Text style={styles.packageRow}>Court: {lesson.court.label}</Text>
        )}
        <Text style={styles.priceRow}>{formatPrice(lesson.priceValue)}</Text>
      </View>
    );
  }

  return (
    <ScrollView style={styles.container} contentContainerStyle={styles.content}>
      {upcoming.length > 0 && (
        <>
          <Text style={styles.sectionTitle}>{t("coachPortalUpcoming")}</Text>
          {upcoming.map((l) => <LessonCard key={l.id} lesson={l} />)}
        </>
      )}
      {past.length > 0 && (
        <>
          <Text style={[styles.sectionTitle, { marginTop: upcoming.length > 0 ? 8 : 4 }]}>
            {t("coachPortalPast")}
          </Text>
          {past.map((l) => <LessonCard key={l.id} lesson={l} />)}
        </>
      )}
    </ScrollView>
  );
}
