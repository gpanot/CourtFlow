import React, { useEffect, useState, useMemo, useCallback } from "react";
import {
  View,
  Text,
  TouchableOpacity,
  ScrollView,
  StyleSheet,
  Switch,
  TextInput,
  ActivityIndicator,
  Alert,
  Platform,
} from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { useAppColors } from "../../theme/use-app-colors";
import { useTabletKioskLocale } from "../../hooks/useTabletKioskLocale";
import { api } from "../../lib/api-client";
import type { AppColors } from "../../theme/palettes";

const DAY_NAMES = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

interface AvailabilitySlot {
  id?: string;
  dayOfWeek: number;
  startTime: string;
  endTime: string;
  enabled: boolean;
}

interface HolidayPeriod {
  id?: string;
  startDate: string;
  endDate: string;
  note: string | null;
}

const DEFAULT_SLOTS: AvailabilitySlot[] = [0, 1, 2, 3, 4, 5, 6].map((day) => ({
  dayOfWeek: day,
  startTime: "08:00",
  endTime: "20:00",
  enabled: day >= 1 && day <= 5,
}));

function createStyles(t: AppColors) {
  return StyleSheet.create({
    container: { flex: 1, backgroundColor: t.bg },
    content: { padding: 16, paddingBottom: 80, gap: 12 },

    center: { flex: 1, justifyContent: "center", alignItems: "center" },

    sectionTitle: {
      fontSize: 11,
      fontWeight: "600",
      color: t.subtle,
      textTransform: "uppercase",
      letterSpacing: 0.8,
      marginBottom: 6,
      marginTop: 4,
    },

    slotRow: {
      flexDirection: "row",
      alignItems: "center",
      backgroundColor: t.card,
      borderRadius: 10,
      borderWidth: 1,
      borderColor: t.border,
      paddingHorizontal: 12,
      paddingVertical: 10,
      gap: 10,
    },
    dayName: { fontSize: 13, fontWeight: "600", color: t.text, width: 36 },
    unavailableText: { fontSize: 12, color: t.muted, flex: 1 },

    timeInput: {
      backgroundColor: t.inputBg,
      borderRadius: 8,
      borderWidth: 1,
      borderColor: t.borderLight,
      paddingHorizontal: 10,
      paddingVertical: 6,
      fontSize: 13,
      color: t.text,
      minWidth: 70,
      textAlign: "center",
    },
    timeSep: { fontSize: 12, color: t.muted },

    holidayCard: {
      backgroundColor: t.card,
      borderRadius: 10,
      borderWidth: 1,
      borderColor: t.border,
      padding: 12,
      gap: 8,
    },
    holidayRow: { flexDirection: "row", alignItems: "center", gap: 8 },
    holidayDateInput: {
      flex: 1,
      backgroundColor: t.inputBg,
      borderRadius: 8,
      borderWidth: 1,
      borderColor: t.borderLight,
      paddingHorizontal: 10,
      paddingVertical: 7,
      fontSize: 13,
      color: t.text,
    },
    holidayNoteInput: {
      flex: 1,
      backgroundColor: t.inputBg,
      borderRadius: 8,
      borderWidth: 1,
      borderColor: t.borderLight,
      paddingHorizontal: 10,
      paddingVertical: 7,
      fontSize: 13,
      color: t.text,
    },
    removeBtn: {
      paddingHorizontal: 8,
      paddingVertical: 4,
    },
    addHolidayBtn: {
      flexDirection: "row",
      alignItems: "center",
      gap: 6,
      alignSelf: "flex-start",
      paddingVertical: 4,
    },
    addHolidayText: { color: t.blue400, fontSize: 14, fontWeight: "600" },

    sectionHeader: {
      flexDirection: "row",
      justifyContent: "space-between",
      alignItems: "center",
      marginBottom: 4,
    },

    savedBanner: {
      backgroundColor: "rgba(74,222,128,0.12)",
      borderRadius: 10,
      padding: 12,
      flexDirection: "row",
      alignItems: "center",
      gap: 8,
    },
    savedText: { color: "#4ade80", fontSize: 13, fontWeight: "500" },

    saveBtn: {
      backgroundColor: t.blue500,
      borderRadius: 12,
      height: 50,
      justifyContent: "center",
      alignItems: "center",
      marginTop: 4,
    },
    saveBtnDisabled: { opacity: 0.5 },
    saveBtnText: { color: "#fff", fontSize: 15, fontWeight: "700" },
  });
}

export function CoachAvailabilityScreen() {
  const theme = useAppColors();
  const styles = useMemo(() => createStyles(theme), [theme]);
  const { t } = useTabletKioskLocale();

  const [slots, setSlots] = useState<AvailabilitySlot[]>(DEFAULT_SLOTS);
  const [holidays, setHolidays] = useState<HolidayPeriod[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      try {
        const data = await api.get<{ availabilities: AvailabilitySlot[]; holidays: HolidayPeriod[] }>(
          "/api/admin/coach-portal/availability"
        );
        if (!cancelled) {
          if (data.availabilities.length > 0) setSlots(data.availabilities);
          setHolidays(data.holidays);
        }
      } catch {
        // keep defaults
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => { cancelled = true; };
  }, []);

  const toggleDay = useCallback((dayOfWeek: number) => {
    setSlots((prev) =>
      prev.map((s) => s.dayOfWeek === dayOfWeek ? { ...s, enabled: !s.enabled } : s)
    );
  }, []);

  const updateTime = useCallback(
    (dayOfWeek: number, field: "startTime" | "endTime", value: string) => {
      setSlots((prev) =>
        prev.map((s) => s.dayOfWeek === dayOfWeek ? { ...s, [field]: value } : s)
      );
    },
    []
  );

  const addHoliday = useCallback(() => {
    const today = new Date().toISOString().split("T")[0];
    setHolidays((prev) => [...prev, { startDate: today, endDate: today, note: null }]);
  }, []);

  const removeHoliday = useCallback((index: number) => {
    setHolidays((prev) => prev.filter((_, i) => i !== index));
  }, []);

  const updateHoliday = useCallback(
    (index: number, field: keyof HolidayPeriod, value: string | null) => {
      setHolidays((prev) =>
        prev.map((h, i) => (i === index ? { ...h, [field]: value } : h))
      );
    },
    []
  );

  const handleSave = useCallback(async () => {
    setSaving(true);
    setSaved(false);
    try {
      await api.put("/api/admin/coach-portal/availability", {
        availabilities: slots,
        holidays,
      });
      setSaved(true);
      setTimeout(() => setSaved(false), 3000);
    } catch (err) {
      const msg = err instanceof Error ? err.message : "Failed to save";
      Alert.alert("Error", msg);
    } finally {
      setSaving(false);
    }
  }, [slots, holidays]);

  if (loading) {
    return (
      <View style={styles.center}>
        <ActivityIndicator color={theme.blue400} />
      </View>
    );
  }

  return (
    <ScrollView style={styles.container} contentContainerStyle={styles.content}>
      {/* Weekly schedule */}
      <Text style={styles.sectionTitle}>{t("coachPortalWeeklySchedule")}</Text>
      {slots.map((slot) => (
        <View key={slot.dayOfWeek} style={styles.slotRow}>
          <Switch
            value={slot.enabled}
            onValueChange={() => toggleDay(slot.dayOfWeek)}
            trackColor={{ false: theme.borderLight, true: theme.blue500 }}
            thumbColor="#ffffff"
            style={Platform.OS === "ios" ? { transform: [{ scaleX: 0.8 }, { scaleY: 0.8 }] } : undefined}
          />
          <Text style={styles.dayName}>{DAY_NAMES[slot.dayOfWeek]}</Text>
          {slot.enabled ? (
            <>
              <TextInput
                style={styles.timeInput}
                value={slot.startTime}
                onChangeText={(v) => updateTime(slot.dayOfWeek, "startTime", v)}
                placeholder="08:00"
                placeholderTextColor={theme.dimmed}
                keyboardType="numbers-and-punctuation"
              />
              <Text style={styles.timeSep}>–</Text>
              <TextInput
                style={styles.timeInput}
                value={slot.endTime}
                onChangeText={(v) => updateTime(slot.dayOfWeek, "endTime", v)}
                placeholder="20:00"
                placeholderTextColor={theme.dimmed}
                keyboardType="numbers-and-punctuation"
              />
            </>
          ) : (
            <Text style={styles.unavailableText}>{t("coachPortalUnavailable")}</Text>
          )}
        </View>
      ))}

      {/* Holidays */}
      <View style={styles.sectionHeader}>
        <Text style={styles.sectionTitle}>{t("coachPortalHolidays")}</Text>
        <TouchableOpacity style={styles.addHolidayBtn} onPress={addHoliday} activeOpacity={0.7}>
          <Ionicons name="add-circle-outline" size={16} color={theme.blue400} />
          <Text style={styles.addHolidayText}>Add</Text>
        </TouchableOpacity>
      </View>

      {holidays.length === 0 && (
        <Text style={{ color: theme.muted, fontSize: 13 }}>{t("coachPortalNoHolidays")}</Text>
      )}

      {holidays.map((h, i) => (
        <View key={i} style={styles.holidayCard}>
          <View style={styles.holidayRow}>
            <TextInput
              style={styles.holidayDateInput}
              value={h.startDate}
              onChangeText={(v) => updateHoliday(i, "startDate", v)}
              placeholder="YYYY-MM-DD"
              placeholderTextColor={theme.dimmed}
            />
            <Text style={styles.timeSep}>–</Text>
            <TextInput
              style={styles.holidayDateInput}
              value={h.endDate}
              onChangeText={(v) => updateHoliday(i, "endDate", v)}
              placeholder="YYYY-MM-DD"
              placeholderTextColor={theme.dimmed}
            />
          </View>
          <View style={styles.holidayRow}>
            <TextInput
              style={styles.holidayNoteInput}
              value={h.note ?? ""}
              onChangeText={(v) => updateHoliday(i, "note", v || null)}
              placeholder={t("coachPortalHolidayNote")}
              placeholderTextColor={theme.dimmed}
            />
            <TouchableOpacity
              style={styles.removeBtn}
              onPress={() => removeHoliday(i)}
              activeOpacity={0.7}
            >
              <Ionicons name="trash-outline" size={18} color={theme.red400} />
            </TouchableOpacity>
          </View>
        </View>
      ))}

      {/* Success banner */}
      {saved && (
        <View style={styles.savedBanner}>
          <Ionicons name="checkmark-circle-outline" size={18} color="#4ade80" />
          <Text style={styles.savedText}>{t("coachPortalSavedSuccess")}</Text>
        </View>
      )}

      {/* Save button */}
      <TouchableOpacity
        style={[styles.saveBtn, saving && styles.saveBtnDisabled]}
        onPress={handleSave}
        disabled={saving}
        activeOpacity={0.7}
      >
        {saving ? (
          <ActivityIndicator color="#fff" />
        ) : (
          <Text style={styles.saveBtnText}>Save</Text>
        )}
      </TouchableOpacity>
    </ScrollView>
  );
}
