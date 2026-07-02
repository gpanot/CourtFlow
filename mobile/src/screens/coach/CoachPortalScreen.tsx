import React, {
  useCallback,
  useEffect,
  useState,
} from "react";
import {
  ActivityIndicator,
  Alert,
  Image,
  Modal,
  Platform,
  RefreshControl,
  ScrollView,
  StyleSheet,
  Switch,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { useFocusEffect, useNavigation } from "@react-navigation/native";
import type { NativeStackNavigationProp } from "@react-navigation/native-stack";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useAuthStore } from "../../stores/auth-store";
import { useCoachPortalStore } from "../../stores/coach-portal-store";
import { api } from "../../lib/api-client";
import { useAppColors } from "../../theme/use-app-colors";
import { useTabletKioskLocale } from "../../hooks/useTabletKioskLocale";
import { resolveMediaUrl } from "../../lib/media-url";
import type { AppColors } from "../../theme/palettes";
import type { CoachPortalStackParamList } from "../../navigation/types";

// ─── Types ────────────────────────────────────────────────────────────────────

interface CoachLesson {
  id: string;
  date: string;
  startTime: string;
  endTime: string;
  status: string;
  player: { id: string; name: string; avatarPhotoPath: string | null } | null;
  package: { id: string; name: string; lessonType: string; durationMin: number } | null;
  court: { id: string; label: string } | null;
}

interface AvailSlot {
  dayOfWeek: number;
  startTime: string;
  endTime: string;
  enabled: boolean;
}

interface Holiday {
  startDate: string;
  endDate: string;
  note: string | null;
}

// ─── Constants ────────────────────────────────────────────────────────────────

const DAY_SHORT = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

const STATUS_LABELS: Record<string, string> = {
  pending_approval: "Pending",
  confirmed: "Confirmed",
  completed: "Completed",
  cancelled: "Cancelled",
  no_show: "No Show",
};

const LANGUAGES = ["English", "Vietnamese", "Thai", "Japanese", "Korean"];
const SPECIALTIES = ["Pickleball", "Tennis", "Badminton", "Ping Pong"];
const FOCUS_LEVELS = ["Beginner", "Advanced", "Pro"];
const YEARS_OPTIONS = ["<2", "2-5", "5+"];
const GROUP_SIZES = ["1-1", "2", "3", "4", "4+"];
const GENDERS = ["Male", "Female", "Other"];

const DEFAULT_SLOTS: AvailSlot[] = [0, 1, 2, 3, 4, 5, 6].map((day) => ({
  dayOfWeek: day,
  startTime: "08:00",
  endTime: "20:00",
  enabled: day >= 1 && day <= 5,
}));

// ─── Helpers ──────────────────────────────────────────────────────────────────

const fmtTime = (iso: string) =>
  new Date(iso).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });

const durationHours = (s: string, e: string) =>
  (new Date(e).getTime() - new Date(s).getTime()) / 3600000;

const isoToday = () => new Date().toISOString().split("T")[0]!;
const isoNDaysFromNow = (n: number) => {
  const d = new Date();
  d.setDate(d.getDate() + n);
  return d.toISOString().split("T")[0]!;
};
const startOfMonth = (offset = 0) => {
  const d = new Date();
  d.setDate(1);
  d.setMonth(d.getMonth() + offset);
  return d.toISOString().split("T")[0]!;
};
const endOfMonth = (offset = 0) => {
  const d = new Date();
  d.setMonth(d.getMonth() + offset + 1);
  d.setDate(0);
  return d.toISOString().split("T")[0]!;
};
const toggleMulti = (arr: string[], v: string) =>
  arr.includes(v) ? arr.filter((x) => x !== v) : [...arr, v];
const toggleSingle = (cur: string, v: string) => (cur === v ? "" : v);

function weekStart(date: Date): Date {
  const d = new Date(date);
  const day = d.getDay();
  d.setDate(d.getDate() + (day === 0 ? -6 : 1 - day));
  d.setHours(0, 0, 0, 0);
  return d;
}

function weekLabel(start: Date): string {
  const now = new Date();
  const thisWeekStart = weekStart(now);
  const nextWeekStart = new Date(thisWeekStart);
  nextWeekStart.setDate(nextWeekStart.getDate() + 7);
  const startIso = start.toISOString().split("T")[0]!;
  if (startIso === thisWeekStart.toISOString().split("T")[0]!) return "This week";
  if (startIso === nextWeekStart.toISOString().split("T")[0]!) return "Next week";
  const end = new Date(start);
  end.setDate(end.getDate() + 6);
  const o: Intl.DateTimeFormatOptions = { month: "short", day: "numeric" };
  return `${start.toLocaleDateString([], o)} – ${end.toLocaleDateString([], o)}`;
}

interface WeekGroup { label: string; weekStartIso: string; lessons: CoachLesson[] }
function groupByWeek(lessons: CoachLesson[]): WeekGroup[] {
  const map = new Map<string, WeekGroup>();
  for (const l of lessons) {
    const ws = weekStart(new Date(l.startTime));
    const key = ws.toISOString().split("T")[0]!;
    if (!map.has(key)) map.set(key, { label: weekLabel(ws), weekStartIso: key, lessons: [] });
    map.get(key)!.lessons.push(l);
  }
  return Array.from(map.values()).sort((a, b) => a.weekStartIso.localeCompare(b.weekStartIso));
}

type PeriodPreset = "this_month" | "last_month" | "all";
function getPresetRange(p: PeriodPreset): { from: string; to: string } {
  if (p === "this_month") return { from: startOfMonth(0), to: endOfMonth(0) };
  if (p === "last_month") return { from: startOfMonth(-1), to: endOfMonth(-1) };
  const d = new Date();
  d.setFullYear(d.getFullYear() - 2);
  return { from: d.toISOString().split("T")[0]!, to: isoToday() };
}

const STATUS_BG: Record<string, string> = {
  pending_approval: "rgba(202,138,4,0.15)",
  confirmed: "rgba(20,184,166,0.15)",
  completed: "rgba(34,197,94,0.15)",
  cancelled: "rgba(115,115,115,0.15)",
  no_show: "rgba(239,68,68,0.15)",
};
const STATUS_TEXT: Record<string, string> = {
  pending_approval: "#eab308",
  confirmed: "#2dd4bf",
  completed: "#4ade80",
  cancelled: "#a3a3a3",
  no_show: "#f87171",
};

// ─── Sub-components ───────────────────────────────────────────────────────────

function StatusBadge({ status }: { status: string }) {
  return (
    <View style={[styles.badge, { backgroundColor: STATUS_BG[status] ?? "rgba(115,115,115,0.15)" }]}>
      <Text style={[styles.badgeText, { color: STATUS_TEXT[status] ?? "#a3a3a3" }]}>
        {STATUS_LABELS[status] ?? status}
      </Text>
    </View>
  );
}

function LessonCard({ lesson, theme }: { lesson: CoachLesson; theme: AppColors }) {
  const dur = durationHours(lesson.startTime, lesson.endTime);
  const start = new Date(lesson.startTime);
  return (
    <View style={[styles.lessonCard, { borderColor: theme.border, backgroundColor: theme.card }]}>
      {/* Date column */}
      <View style={[styles.lessonDateCol, { borderRightColor: theme.border, backgroundColor: theme.cardSurface }]}>
        <Text style={[styles.lessonDayShort, { color: theme.subtle }]}>{DAY_SHORT[start.getDay()]}</Text>
        <Text style={[styles.lessonDayNum, { color: theme.text }]}>{start.getDate()}</Text>
        <Text style={[styles.lessonMonth, { color: theme.dimmed }]}>
          {start.toLocaleDateString([], { month: "short" })}
        </Text>
      </View>
      {/* Info */}
      <View style={styles.lessonInfo}>
        <View style={styles.lessonTopRow}>
          <Text style={[styles.lessonPlayer, { color: theme.text }]} numberOfLines={1}>
            {lesson.player?.name ?? "—"}
          </Text>
          <StatusBadge status={lesson.status} />
        </View>
        <View style={styles.lessonTimeRow}>
          <Ionicons name="time-outline" size={11} color={theme.dimmed} />
          <Text style={[styles.lessonTime, { color: theme.muted }]}>
            {fmtTime(lesson.startTime)} – {fmtTime(lesson.endTime)} · {dur.toFixed(1)}h
          </Text>
        </View>
        {lesson.package && (
          <Text style={[styles.lessonPackage, { color: theme.subtle }]}>
            {lesson.package.lessonType}{lesson.court ? ` · ${lesson.court.label}` : ""}
          </Text>
        )}
      </View>
    </View>
  );
}

function HistoryCard({ lesson, theme }: { lesson: CoachLesson; theme: AppColors }) {
  const dur = durationHours(lesson.startTime, lesson.endTime);
  return (
    <View style={[styles.historyCard, { borderColor: theme.border, backgroundColor: theme.card }]}>
      <View style={styles.historyInfo}>
        <View style={styles.lessonTopRow}>
          <Text style={[styles.lessonPlayer, { color: theme.text }]} numberOfLines={1}>
            {lesson.player?.name ?? "—"}
          </Text>
          <StatusBadge status={lesson.status} />
        </View>
        <Text style={[styles.lessonTime, { color: theme.subtle }]}>
          {new Date(lesson.startTime).toLocaleDateString([], { weekday: "short", month: "short", day: "numeric" })} · {fmtTime(lesson.startTime)} – {fmtTime(lesson.endTime)} ({dur.toFixed(1)}h)
        </Text>
      </View>
    </View>
  );
}

function PillGroup({
  options,
  selected,
  onToggle,
  theme,
}: {
  options: string[];
  selected: string[];
  onToggle: (v: string) => void;
  theme: AppColors;
}) {
  return (
    <View style={styles.pillRow}>
      {options.map((opt) => {
        const active = selected.includes(opt);
        return (
          <TouchableOpacity
            key={opt}
            onPress={() => onToggle(opt)}
            activeOpacity={0.7}
            style={[
              styles.pill,
              {
                borderColor: active ? "#2dd4bf" : theme.border,
                backgroundColor: active ? "rgba(20,184,166,0.15)" : "transparent",
              },
            ]}
          >
            <Text style={[styles.pillText, { color: active ? "#2dd4bf" : theme.muted }]}>{opt}</Text>
          </TouchableOpacity>
        );
      })}
    </View>
  );
}

// ─── Tab: Upcoming ────────────────────────────────────────────────────────────

function UpcomingTab({
  lessons,
  loading,
  loadingMore,
  windowWeeks,
  onLoadMore,
  theme,
}: {
  lessons: CoachLesson[];
  loading: boolean;
  loadingMore: boolean;
  windowWeeks: number;
  onLoadMore: () => void;
  theme: AppColors;
  // onRefresh is handled by the parent ScrollView's RefreshControl
}) {
  const weekGroups = groupByWeek(lessons);

  if (loading) {
    return (
      <View style={styles.centeredPad}>
        <ActivityIndicator color={theme.blue400} />
      </View>
    );
  }

  if (weekGroups.length === 0) {
    return (
      <View style={styles.centeredPad}>
        <Ionicons name="calendar-outline" size={40} color={theme.dimmed} />
        <Text style={[styles.emptyText, { color: theme.subtle }]}>
          No upcoming lessons in the next {windowWeeks} weeks.
        </Text>
        <TouchableOpacity
          style={[styles.outlineBtn, { borderColor: theme.border, backgroundColor: theme.card }]}
          onPress={onLoadMore}
          disabled={loadingMore}
          activeOpacity={0.7}
        >
          {loadingMore
            ? <ActivityIndicator size="small" color={theme.muted} />
            : <Text style={[styles.outlineBtnText, { color: theme.textSecondary }]}>Look further ahead</Text>}
        </TouchableOpacity>
      </View>
    );
  }

  return (
    <View style={styles.tabContent}>
      {weekGroups.map((group) => (
        <View key={group.weekStartIso}>
          <View style={styles.weekLabelRow}>
            <Text style={[
              styles.weekLabel,
              {
                color: group.label === "This week"
                  ? "#2dd4bf"
                  : group.label === "Next week"
                    ? theme.textSecondary
                    : theme.subtle,
              },
            ]}>
              {group.label}
            </Text>
            <View style={[styles.countBadge, { backgroundColor: theme.cardSurface }]}>
              <Text style={[styles.countBadgeText, { color: theme.muted }]}>{group.lessons.length}</Text>
            </View>
          </View>
          {group.lessons.map((l) => (
            <View key={l.id} style={{ marginBottom: 8 }}>
              <LessonCard lesson={l} theme={theme} />
            </View>
          ))}
        </View>
      ))}
      <TouchableOpacity
        style={[styles.loadMoreBtn, { borderColor: theme.border, backgroundColor: theme.cardSurface }]}
        onPress={onLoadMore}
        disabled={loadingMore}
        activeOpacity={0.7}
      >
        {loadingMore
          ? <><ActivityIndicator size="small" color={theme.muted} style={{ marginRight: 8 }} /><Text style={[styles.loadMoreText, { color: theme.muted }]}>Loading…</Text></>
          : <><Ionicons name="calendar-outline" size={16} color={theme.muted} /><Text style={[styles.loadMoreText, { color: theme.muted }]}>  Load next 3 weeks</Text></>}
      </TouchableOpacity>
    </View>
  );
}

// ─── Time options for Schedule picker (half-hour slots 06:00 – 23:00) ─────────

const TIME_OPTIONS: string[] = [];
for (let h = 6; h <= 23; h++) {
  TIME_OPTIONS.push(`${String(h).padStart(2, "0")}:00`);
  if (h < 23) TIME_OPTIONS.push(`${String(h).padStart(2, "0")}:30`);
}

// ─── Tab: Schedule ────────────────────────────────────────────────────────────

function ScheduleTab({ token, theme }: { token: string; theme: AppColors }) {
  const [slots, setSlots] = useState<AvailSlot[]>(DEFAULT_SLOTS);
  const [holidays, setHolidays] = useState<Holiday[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [showHolidays, setShowHolidays] = useState(false);
  const [newHoliday, setNewHoliday] = useState({ startDate: "", endDate: "", note: "" });
  const [pickerState, setPickerState] = useState<{
    day: number;
    slotIdx: number;
    field: "startTime" | "endTime";
  } | null>(null);
  const { t } = useTabletKioskLocale();

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      try {
        const data = await api.get<{ availabilities: AvailSlot[]; holidays: Holiday[] }>(
          "/api/admin/coach-portal/availability"
        );
        if (!cancelled) {
          if (data.availabilities.length > 0) setSlots(data.availabilities);
          setHolidays(data.holidays);
        }
      } catch { /* keep defaults */ }
      finally { if (!cancelled) setLoading(false); }
    })();
    return () => { cancelled = true; };
  }, []);

  // ── Multi-slot helpers (mirrors web CoachAvailabilityEditor) ──

  const slotsForDay = useCallback((day: number) => slots.filter((s) => s.dayOfWeek === day), [slots]);

  const isDayEnabled = useCallback((day: number) => {
    const ds = slots.filter((s) => s.dayOfWeek === day);
    return ds.length > 0 && ds.some((s) => s.enabled);
  }, [slots]);

  const toggleDay = useCallback((day: number) => {
    const ds = slots.filter((s) => s.dayOfWeek === day);
    if (ds.length === 0) {
      setSlots((prev) => [...prev, { dayOfWeek: day, startTime: "08:00", endTime: "20:00", enabled: true }]);
    } else {
      const newEnabled = !isDayEnabled(day);
      setSlots((prev) => prev.map((s) => s.dayOfWeek === day ? { ...s, enabled: newEnabled } : s));
    }
  }, [slots, isDayEnabled]);

  const addSlotToDay = useCallback((day: number) => {
    setSlots((prev) => [...prev, { dayOfWeek: day, startTime: "08:00", endTime: "20:00", enabled: true }]);
  }, []);

  const removeSlot = useCallback((day: number, idxWithinDay: number) => {
    let counter = 0;
    setSlots((prev) => prev.filter((s) => {
      if (s.dayOfWeek !== day) return true;
      const keep = counter !== idxWithinDay;
      counter++;
      return keep;
    }));
  }, []);

  const updateSlotTime = useCallback((day: number, idxWithinDay: number, field: "startTime" | "endTime", val: string) => {
    let counter = 0;
    setSlots((prev) => prev.map((s) => {
      if (s.dayOfWeek !== day) return s;
      const updated = counter === idxWithinDay ? { ...s, [field]: val } : s;
      counter++;
      return updated;
    }));
  }, []);

  const handleSave = useCallback(async () => {
    setSaving(true);
    setSaved(false);
    try {
      await api.put("/api/admin/coach-portal/availability", { availabilities: slots, holidays });
      setSaved(true);
      setTimeout(() => setSaved(false), 2500);
    } catch (e) {
      Alert.alert("Error", e instanceof Error ? e.message : "Failed to save");
    } finally {
      setSaving(false);
    }
  }, [slots, holidays]);

  const addHoliday = () => {
    if (!newHoliday.startDate || !newHoliday.endDate) return;
    setHolidays((p) => [...p, { ...newHoliday, note: newHoliday.note || null }]);
    setNewHoliday({ startDate: "", endDate: "", note: "" });
  };

  if (loading) {
    return <View style={styles.centeredPad}><ActivityIndicator color={theme.blue400} /></View>;
  }

  // Time picker modal
  const activePicker = pickerState;
  const activeSlots = activePicker ? slotsForDay(activePicker.day) : [];
  const currentPickerValue = activePicker
    ? (activeSlots[activePicker.slotIdx]?.[activePicker.field] ?? "08:00")
    : "08:00";

  return (
    <View style={styles.tabContent}>
      <Text style={[styles.scheduleHint, { color: theme.subtle }]}>{t("coachPortalWeeklySchedule")}</Text>

      {/* Weekly slots — one card per day, supporting multiple time ranges */}
      {DAY_SHORT.map((dayLabel, dayIdx) => {
        const daySlots = slotsForDay(dayIdx);
        const enabled = isDayEnabled(dayIdx);

        return (
          <View key={dayIdx} style={[styles.dayCard, { borderColor: theme.border, backgroundColor: theme.card }]}>
            {/* Day header row */}
            <View style={styles.dayCardHeader}>
              <Switch
                value={enabled}
                onValueChange={() => toggleDay(dayIdx)}
                trackColor={{ false: theme.borderLight, true: "#14b8a6" }}
                thumbColor="#ffffff"
                style={Platform.OS === "ios" ? { transform: [{ scaleX: 0.8 }, { scaleY: 0.8 }] } : undefined}
              />
              <Text style={[styles.dayLabel, { color: theme.text }]}>{dayLabel}</Text>
              {!enabled && (
                <Text style={[styles.unavailText, { color: theme.subtle }]}>{t("coachPortalUnavailable")}</Text>
              )}
            </View>

            {/* Time slots */}
            {enabled && (
              <View style={styles.daySlotList}>
                {daySlots.map((slot, slotIdx) => {
                  const isLast = slotIdx === daySlots.length - 1;
                  return (
                    <View key={slotIdx} style={styles.slotTimeRow}>
                      {/* Start time picker */}
                      <TouchableOpacity
                        style={[styles.timePickerBtn, { borderColor: theme.borderLight, backgroundColor: theme.inputBg }]}
                        onPress={() => setPickerState({ day: dayIdx, slotIdx, field: "startTime" })}
                        activeOpacity={0.7}
                      >
                        <Text style={[styles.timePickerText, { color: theme.text }]}>{slot.startTime}</Text>
                      </TouchableOpacity>
                      <Text style={[styles.timeSep, { color: theme.dimmed }]}>–</Text>
                      {/* End time picker */}
                      <TouchableOpacity
                        style={[styles.timePickerBtn, { borderColor: theme.borderLight, backgroundColor: theme.inputBg }]}
                        onPress={() => setPickerState({ day: dayIdx, slotIdx, field: "endTime" })}
                        activeOpacity={0.7}
                      >
                        <Text style={[styles.timePickerText, { color: theme.text }]}>{slot.endTime}</Text>
                      </TouchableOpacity>

                      {/* + add slot — only on last slot */}
                      {isLast && (
                        <TouchableOpacity
                          style={styles.slotActionBtn}
                          onPress={() => addSlotToDay(dayIdx)}
                          activeOpacity={0.7}
                          hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
                        >
                          <Text style={styles.slotAddText}>＋</Text>
                        </TouchableOpacity>
                      )}

                      {/* × remove — only when 2+ slots */}
                      {daySlots.length > 1 && (
                        <TouchableOpacity
                          style={styles.slotActionBtn}
                          onPress={() => removeSlot(dayIdx, slotIdx)}
                          activeOpacity={0.7}
                          hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
                        >
                          <Text style={styles.slotRemoveText}>✕</Text>
                        </TouchableOpacity>
                      )}
                    </View>
                  );
                })}
              </View>
            )}
          </View>
        );
      })}

      {/* Holidays toggle */}
      <TouchableOpacity
        style={[styles.holidayToggle, { borderColor: theme.border, backgroundColor: theme.cardSurface }]}
        onPress={() => setShowHolidays((v) => !v)}
        activeOpacity={0.7}
      >
        <View style={styles.holidayToggleLeft}>
          <Ionicons name="calendar-outline" size={16} color={theme.muted} />
          <Text style={[styles.holidayToggleText, { color: theme.muted }]}>
            {t("coachPortalHolidaysTitle")}
            {holidays.length > 0 && (
              <Text style={{ color: theme.subtle }}> ({holidays.length})</Text>
            )}
          </Text>
        </View>
        <Ionicons name={showHolidays ? "chevron-up" : "chevron-down"} size={16} color={theme.dimmed} />
      </TouchableOpacity>

      {showHolidays && (
        <View style={[styles.holidayPanel, { borderColor: theme.border }]}>
          {holidays.map((h, i) => (
            <View key={i} style={[styles.holidayItem, { borderColor: theme.border }]}>
              <Text style={[styles.holidayItemText, { color: theme.textSecondary }]}>
                {h.startDate} → {h.endDate}{h.note ? ` · ${h.note}` : ""}
              </Text>
              <TouchableOpacity onPress={() => setHolidays((p) => p.filter((_, j) => j !== i))} activeOpacity={0.7}>
                <Ionicons name="close" size={18} color={theme.subtle} />
              </TouchableOpacity>
            </View>
          ))}

          {/* Add new */}
          <View style={[styles.addHolidayBox, { borderColor: theme.border }]}>
            <Text style={[styles.addHolidayLabel, { color: theme.subtle }]}>{t("coachPortalAddTimeOff")}</Text>
            <View style={styles.holidayDateRow}>
              <TextInput
                style={[styles.holidayDateInput, { borderColor: theme.borderLight, backgroundColor: theme.inputBg, color: theme.text }]}
                value={newHoliday.startDate}
                onChangeText={(v) => setNewHoliday((x) => ({ ...x, startDate: v }))}
                placeholder="YYYY-MM-DD"
                placeholderTextColor={theme.dimmed}
              />
              <TextInput
                style={[styles.holidayDateInput, { borderColor: theme.borderLight, backgroundColor: theme.inputBg, color: theme.text }]}
                value={newHoliday.endDate}
                onChangeText={(v) => setNewHoliday((x) => ({ ...x, endDate: v }))}
                placeholder="YYYY-MM-DD"
                placeholderTextColor={theme.dimmed}
              />
            </View>
            <TextInput
              style={[styles.holidayNoteInput, { borderColor: theme.borderLight, backgroundColor: theme.inputBg, color: theme.text }]}
              value={newHoliday.note}
              onChangeText={(v) => setNewHoliday((x) => ({ ...x, note: v }))}
              placeholder={t("coachPortalHolidayNote")}
              placeholderTextColor={theme.dimmed}
            />
            <TouchableOpacity
              style={[styles.addHolidayBtn, { backgroundColor: theme.borderLight, opacity: (!newHoliday.startDate || !newHoliday.endDate) ? 0.4 : 1 }]}
              onPress={addHoliday}
              disabled={!newHoliday.startDate || !newHoliday.endDate}
              activeOpacity={0.7}
            >
              <Text style={[styles.addHolidayBtnText, { color: theme.textSecondary }]}>Add</Text>
            </TouchableOpacity>
          </View>
        </View>
      )}

      {/* Save button */}
      <TouchableOpacity
        style={[styles.saveBtn, { backgroundColor: saved ? "#16a34a" : "#14b8a6", opacity: saving ? 0.6 : 1 }]}
        onPress={handleSave}
        disabled={saving}
        activeOpacity={0.8}
      >
        {saving
          ? <ActivityIndicator color="#fff" />
          : <><Ionicons name="save-outline" size={18} color="#fff" style={{ marginRight: 8 }} />
            <Text style={styles.saveBtnText}>{saved ? t("coachPortalSavedSuccess") : t("coachPortalSaveAvailability")}</Text></>}
      </TouchableOpacity>

      {/* Time picker bottom sheet */}
      <Modal
        visible={!!activePicker}
        transparent
        animationType="slide"
        onRequestClose={() => setPickerState(null)}
      >
        <TouchableOpacity
          style={styles.timePickerBackdrop}
          activeOpacity={1}
          onPress={() => setPickerState(null)}
        />
        <View style={[styles.timePickerSheet, { backgroundColor: theme.card, borderColor: theme.border }]}>
          <View style={styles.timePickerHeader}>
            <Text style={[styles.timePickerTitle, { color: theme.textSecondary }]}>
              {activePicker?.field === "startTime" ? "Start time" : "End time"}
            </Text>
            <TouchableOpacity onPress={() => setPickerState(null)} activeOpacity={0.7}>
              <Ionicons name="close" size={20} color={theme.subtle} />
            </TouchableOpacity>
          </View>
          <ScrollView style={styles.timePickerList} showsVerticalScrollIndicator={false}>
            {TIME_OPTIONS.map((t) => {
              const selected = t === currentPickerValue;
              return (
                <TouchableOpacity
                  key={t}
                  style={[
                    styles.timePickerOption,
                    selected && { backgroundColor: "rgba(20,184,166,0.15)" },
                  ]}
                  onPress={() => {
                    if (activePicker) {
                      updateSlotTime(activePicker.day, activePicker.slotIdx, activePicker.field, t);
                    }
                    setPickerState(null);
                  }}
                  activeOpacity={0.7}
                >
                  <Text style={[styles.timePickerOptionText, { color: selected ? "#2dd4bf" : theme.text }]}>
                    {t}
                  </Text>
                  {selected && <Ionicons name="checkmark" size={16} color="#2dd4bf" />}
                </TouchableOpacity>
              );
            })}
          </ScrollView>
        </View>
      </Modal>
    </View>
  );
}

// ─── Tab: History ─────────────────────────────────────────────────────────────

function HistoryTab({ token, coachId, theme, refreshKey }: { token: string; coachId: string; theme: AppColors; refreshKey?: number }) {
  const [preset, setPreset] = useState<PeriodPreset>("this_month");
  const [statusFilter, setStatusFilter] = useState<"completed" | "all">("completed");
  const [lessons, setLessons] = useState<CoachLesson[]>([]);
  const [loading, setLoading] = useState(false);
  const { from, to } = getPresetRange(preset);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const params = new URLSearchParams({ from, to });
      if (statusFilter !== "all") params.set("status", statusFilter);
      const data = await api.get<CoachLesson[]>(`/api/admin/coach-portal/lessons?${params}`);
      const ft = new Date(from).setHours(0, 0, 0, 0);
      const tt = new Date(to).setHours(23, 59, 59, 999);
      setLessons(data.filter((l) => { const t = new Date(l.startTime).getTime(); return t >= ft && t <= tt; }));
    } catch { setLessons([]); }
    finally { setLoading(false); }
  }, [from, to, statusFilter]);

  useEffect(() => { void load(); }, [load]);

  // Re-fetch when parent triggers a refresh (pull-to-refresh or notification tap)
  useEffect(() => {
    if (refreshKey === undefined || refreshKey === 0) return;
    void load();
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [refreshKey]);

  const completedLessons = lessons.filter((l) => l.status === "completed");
  const totalHours = completedLessons.reduce((s, l) => s + durationHours(l.startTime, l.endTime), 0);

  const presetLabels: Record<PeriodPreset, string> = {
    this_month: "This month",
    last_month: "Last month",
    all: "All time",
  };

  return (
    <View style={styles.tabContent}>
      {/* Filters */}
      <View style={styles.historyFilters}>
        {/* Period picker */}
        <View style={[styles.presetBtnGroup, { borderColor: theme.border, backgroundColor: theme.card }]}>
          {(["this_month", "last_month", "all"] as PeriodPreset[]).map((p) => (
            <TouchableOpacity
              key={p}
              onPress={() => setPreset(p)}
              activeOpacity={0.7}
              style={[styles.presetBtn, preset === p && { backgroundColor: "#14b8a6" }]}
            >
              <Text style={[styles.presetBtnText, { color: preset === p ? "#fff" : theme.muted }]}>
                {presetLabels[p]}
              </Text>
            </TouchableOpacity>
          ))}
        </View>

        {/* Done / All toggle */}
        <View style={[styles.filterToggle, { borderColor: theme.border, backgroundColor: theme.card }]}>
          <TouchableOpacity
            onPress={() => setStatusFilter("completed")}
            activeOpacity={0.7}
            style={[styles.filterToggleBtn, statusFilter === "completed" && { backgroundColor: "#14b8a6" }]}
          >
            <Text style={[styles.filterToggleBtnText, { color: statusFilter === "completed" ? "#fff" : theme.muted }]}>Done</Text>
          </TouchableOpacity>
          <TouchableOpacity
            onPress={() => setStatusFilter("all")}
            activeOpacity={0.7}
            style={[styles.filterToggleBtn, statusFilter === "all" && { backgroundColor: "#14b8a6" }]}
          >
            <Text style={[styles.filterToggleBtnText, { color: statusFilter === "all" ? "#fff" : theme.muted }]}>All</Text>
          </TouchableOpacity>
        </View>
      </View>

      {/* Stats banner */}
      {completedLessons.length > 0 && (
        <View style={styles.statsBanner}>
          <View style={styles.statsIconWrap}>
            <Ionicons name="time-outline" size={22} color="#2dd4bf" />
          </View>
          <View>
            <Text style={styles.statsHours}>{totalHours.toFixed(1)}h</Text>
            <Text style={styles.statsCount}>
              {completedLessons.length} completed lesson{completedLessons.length !== 1 ? "s" : ""}
            </Text>
          </View>
        </View>
      )}

      {/* Lesson list */}
      {loading ? (
        <View style={styles.centeredPad}><ActivityIndicator color={theme.blue400} /></View>
      ) : lessons.length === 0 ? (
        <View style={styles.centeredPad}>
          <Ionicons name="calendar-outline" size={36} color={theme.dimmed} />
          <Text style={[styles.emptyText, { color: theme.subtle }]}>
            No lessons for {presetLabels[preset].toLowerCase()}.
          </Text>
        </View>
      ) : (
        <View>{lessons.map((l) => <HistoryCard key={l.id} lesson={l} theme={theme} />)}</View>
      )}
    </View>
  );
}

// ─── Main Screen ──────────────────────────────────────────────────────────────

export function CoachPortalScreen() {
  const theme = useAppColors();
  const { t } = useTabletKioskLocale();
  const insets = useSafeAreaInsets();
  const navigation = useNavigation<NativeStackNavigationProp<CoachPortalStackParamList>>();

  const token = useAuthStore((s) => s.token ?? "");
  const staffId = useAuthStore((s) => s.staffId ?? "");
  const staffName = useAuthStore((s) => s.staffName);
  const refreshTick = useCoachPortalStore((s) => s.refreshTick);

  const [activeTab, setActiveTab] = useState<"upcoming" | "availability" | "history">("upcoming");
  const [coachPhoto, setCoachPhoto] = useState<string | null>(null);
  const [calendarConnected, setCalendarConnected] = useState(false);

  const [upcomingLessons, setUpcomingLessons] = useState<CoachLesson[]>([]);
  const [upcomingLoading, setUpcomingLoading] = useState(true);
  const [upcomingMoreLoading, setUpcomingMoreLoading] = useState(false);
  const [windowWeeks, setWindowWeeks] = useState(3);
  const [refreshing, setRefreshing] = useState(false);
  const [historyRefreshKey, setHistoryRefreshKey] = useState(0);

  // Refresh coach photo when screen is focused (e.g. after profile edit)
  useFocusEffect(
    useCallback(() => {
      if (!token) return;
      void api.get<{ coachPhoto: string | null }>("/api/admin/coach-portal/profile")
        .then((d) => setCoachPhoto(d.coachPhoto ?? null))
        .catch(() => {});
    }, [token])
  );

  const fetchUpcoming = useCallback(async (weeks: number, isMore = false) => {
    if (isMore) setUpcomingMoreLoading(true);
    else setUpcomingLoading(true);
    try {
      const from = isoToday();
      const to = isoNDaysFromNow(weeks * 7);
      const data = await api.get<CoachLesson[]>(`/api/admin/coach-portal/lessons?from=${from}&to=${to}`);
      setUpcomingLessons(data.filter((l) => ["confirmed", "pending_approval"].includes(l.status)));
    } finally {
      if (isMore) setUpcomingMoreLoading(false);
      else setUpcomingLoading(false);
    }
  }, []);

  useEffect(() => { void fetchUpcoming(3); }, [fetchUpcoming]);

  const handleLoadMore = useCallback(async () => {
    const newWeeks = windowWeeks + 3;
    setWindowWeeks(newWeeks);
    await fetchUpcoming(newWeeks, true);
  }, [windowWeeks, fetchUpcoming]);

  const handleRefresh = useCallback(async () => {
    setRefreshing(true);
    try {
      if (activeTab === "upcoming") {
        await fetchUpcoming(windowWeeks);
      } else if (activeTab === "history") {
        setHistoryRefreshKey((k) => k + 1);
      }
    } finally {
      setRefreshing(false);
    }
  }, [activeTab, fetchUpcoming, windowWeeks]);

  // Refresh both tabs when a coach notification is tapped (refreshTick incremented from App.tsx)
  useEffect(() => {
    if (refreshTick === 0) return;
    void fetchUpcoming(windowWeeks);
    setHistoryRefreshKey((k) => k + 1);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [refreshTick]);

  const TABS = [
    { key: "upcoming" as const, label: "Upcoming" },
    { key: "availability" as const, label: "Schedule" },
    { key: "history" as const, label: "History" },
  ];

  // Initials for avatar
  const initials = (staffName ?? "C")
    .split(" ")
    .map((w) => w[0])
    .join("")
    .slice(0, 2)
    .toUpperCase();

  return (
    <View style={[styles.container, { backgroundColor: theme.bg }]}>
      {/* ── Sticky header ── */}
      <View style={[styles.header, { paddingTop: insets.top + 8, borderBottomColor: theme.border, backgroundColor: theme.bg }]}>
        <View style={styles.headerInner}>
          {/* Avatar + title */}
          <TouchableOpacity
            style={styles.avatarBtn}
            onPress={() => navigation.navigate("CoachProfile")}
            activeOpacity={0.8}
          >
            <View style={styles.avatarRing}>
              {resolveMediaUrl(coachPhoto)
                ? <Image source={{ uri: resolveMediaUrl(coachPhoto)! }} style={styles.avatarImg} />
                : <Text style={styles.avatarInitials}>{initials}</Text>}
            </View>
          </TouchableOpacity>
          <View style={styles.headerText}>
            <Text style={styles.portalLabel}>Coach Portal</Text>
            <Text style={[styles.coachName, { color: theme.text }]}>{staffName ?? "Coach"}</Text>
          </View>
        </View>

        {/* Tab bar */}
        <View style={[styles.tabBar, { borderBottomColor: theme.border }]}>
          {TABS.map((tab) => (
            <TouchableOpacity
              key={tab.key}
              onPress={() => setActiveTab(tab.key)}
              activeOpacity={0.7}
              style={[
                styles.tabBtn,
                activeTab === tab.key && styles.tabBtnActive,
              ]}
            >
              <Text
                style={[
                  styles.tabBtnText,
                  { color: activeTab === tab.key ? "#2dd4bf" : theme.subtle },
                ]}
              >
                {tab.label}
              </Text>
            </TouchableOpacity>
          ))}
        </View>
      </View>

      {/* ── Scrollable content ── */}
      <ScrollView
        style={{ flex: 1 }}
        contentContainerStyle={[styles.scrollContent, { paddingBottom: insets.bottom + 32 }]}
        showsVerticalScrollIndicator={false}
        refreshControl={
          <RefreshControl
            refreshing={refreshing}
            onRefresh={handleRefresh}
            tintColor="#2dd4bf"
            colors={["#2dd4bf"]}
          />
        }
      >
        {calendarConnected && (
          <View style={styles.calendarBanner}>
            <Ionicons name="calendar-outline" size={16} color="#2dd4bf" />
            <Text style={styles.calendarBannerText}>
              {t("coachPortalCalendarBanner")}
            </Text>
          </View>
        )}

        {activeTab === "upcoming" && (
          <UpcomingTab
            lessons={upcomingLessons}
            loading={upcomingLoading}
            loadingMore={upcomingMoreLoading}
            windowWeeks={windowWeeks}
            onLoadMore={handleLoadMore}
            theme={theme}
          />
        )}
        {activeTab === "availability" && (
          <ScheduleTab token={token} theme={theme} />
        )}
        {activeTab === "history" && (
          <HistoryTab token={token} coachId={staffId} theme={theme} refreshKey={historyRefreshKey} />
        )}
      </ScrollView>
    </View>
  );
}

// ─── Styles ───────────────────────────────────────────────────────────────────

const styles = StyleSheet.create({
  container: { flex: 1 },

  header: {
    borderBottomWidth: 1,
    paddingHorizontal: 16,
  },
  headerInner: {
    flexDirection: "row",
    alignItems: "center",
    paddingBottom: 10,
    gap: 10,
  },
  avatarBtn: {},
  avatarRing: {
    width: 48,
    height: 48,
    borderRadius: 24,
    borderWidth: 2,
    borderColor: "rgba(45,212,191,0.4)",
    backgroundColor: "#262626",
    justifyContent: "center",
    alignItems: "center",
    overflow: "hidden",
  },
  avatarImg: { width: 48, height: 48, borderRadius: 24 },
  avatarInitials: { fontSize: 16, fontWeight: "700", color: "#2dd4bf" },

  headerText: { flex: 1 },
  portalLabel: { fontSize: 9, fontWeight: "700", color: "#2dd4bf", textTransform: "uppercase", letterSpacing: 1.5 },
  coachName: { fontSize: 15, fontWeight: "700", lineHeight: 19 },

  tabBar: {
    flexDirection: "row",
    borderBottomWidth: 1,
  },
  tabBtn: {
    flex: 1,
    paddingBottom: 10,
    paddingTop: 4,
    alignItems: "center",
    borderBottomWidth: 2,
    borderBottomColor: "transparent",
  },
  tabBtnActive: {
    borderBottomColor: "#2dd4bf",
  },
  tabBtnText: { fontSize: 13, fontWeight: "600" },

  scrollContent: { padding: 16 },

  calendarBanner: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: "rgba(45,212,191,0.2)",
    backgroundColor: "rgba(45,212,191,0.1)",
    paddingHorizontal: 14,
    paddingVertical: 10,
    marginBottom: 14,
  },
  calendarBannerText: { color: "#2dd4bf", fontSize: 13, flex: 1 },

  tabContent: { gap: 10 },

  centeredPad: { alignItems: "center", paddingVertical: 48, gap: 12 },
  emptyText: { fontSize: 13, textAlign: "center", maxWidth: 240 },

  outlineBtn: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    borderWidth: 1,
    borderRadius: 12,
    paddingHorizontal: 16,
    paddingVertical: 10,
  },
  outlineBtnText: { fontSize: 13, fontWeight: "500" },

  weekLabelRow: { flexDirection: "row", alignItems: "center", gap: 6, marginBottom: 8, marginTop: 4 },
  weekLabel: { fontSize: 11, fontWeight: "700", textTransform: "uppercase", letterSpacing: 0.8 },
  countBadge: { borderRadius: 10, paddingHorizontal: 6, paddingVertical: 2 },
  countBadgeText: { fontSize: 11, fontWeight: "600" },

  loadMoreBtn: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    borderWidth: 1,
    borderRadius: 14,
    paddingVertical: 14,
    marginTop: 4,
  },
  loadMoreText: { fontSize: 13, fontWeight: "500" },

  // Lesson card
  lessonCard: {
    flexDirection: "row",
    borderWidth: 1,
    borderRadius: 14,
    overflow: "hidden",
  },
  lessonDateCol: {
    width: 52,
    alignItems: "center",
    justifyContent: "center",
    paddingVertical: 10,
    borderRightWidth: 1,
  },
  lessonDayShort: { fontSize: 10, fontWeight: "700", textTransform: "uppercase", letterSpacing: 0.5 },
  lessonDayNum: { fontSize: 22, fontWeight: "700", lineHeight: 26 },
  lessonMonth: { fontSize: 10 },
  lessonInfo: { flex: 1, paddingHorizontal: 12, paddingVertical: 10, gap: 4 },
  lessonTopRow: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", gap: 8 },
  lessonPlayer: { fontSize: 14, fontWeight: "600", flex: 1 },
  lessonTimeRow: { flexDirection: "row", alignItems: "center", gap: 4 },
  lessonTime: { fontSize: 12 },
  lessonPackage: { fontSize: 12 },

  // Badge
  badge: { borderRadius: 20, paddingHorizontal: 8, paddingVertical: 2 },
  badgeText: { fontSize: 9, fontWeight: "700", textTransform: "uppercase", letterSpacing: 0.5 },

  // History card
  historyCard: {
    flexDirection: "row",
    alignItems: "center",
    borderWidth: 1,
    borderRadius: 12,
    paddingHorizontal: 12,
    paddingVertical: 10,
    marginBottom: 6,
  },
  historyInfo: { flex: 1 },

  // Schedule
  scheduleHint: { fontSize: 12, lineHeight: 17, marginBottom: 6 },
  dayCard: {
    borderWidth: 1,
    borderRadius: 12,
    paddingHorizontal: 12,
    paddingVertical: 10,
    gap: 6,
  },
  dayCardHeader: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
  },
  daySlotList: {
    paddingLeft: 44,
    gap: 6,
  },
  slotTimeRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
  },
  timePickerBtn: {
    flex: 1,
    borderWidth: 1,
    borderRadius: 10,
    paddingHorizontal: 10,
    paddingVertical: 8,
    alignItems: "center",
  },
  timePickerText: { fontSize: 13, fontWeight: "500" },
  slotActionBtn: {
    width: 28,
    height: 28,
    alignItems: "center",
    justifyContent: "center",
  },
  slotAddText: { fontSize: 16, color: "#2dd4bf", fontWeight: "700" },
  slotRemoveText: { fontSize: 13, color: "#f87171", fontWeight: "700" },
  dayLabel: { fontSize: 13, fontWeight: "600", width: 34 },
  timeSep: { fontSize: 13 },
  unavailText: { fontSize: 12, flex: 1 },

  // Time picker modal
  timePickerBackdrop: {
    flex: 1,
    backgroundColor: "rgba(0,0,0,0.5)",
  },
  timePickerSheet: {
    borderTopWidth: 1,
    borderTopLeftRadius: 20,
    borderTopRightRadius: 20,
    maxHeight: 360,
  },
  timePickerHeader: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: 16,
    paddingVertical: 14,
  },
  timePickerTitle: { fontSize: 14, fontWeight: "600" },
  timePickerList: { paddingHorizontal: 8 },
  timePickerOption: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: 12,
    paddingVertical: 12,
    borderRadius: 10,
  },
  timePickerOptionText: { fontSize: 15, fontWeight: "500" },

  // legacy — kept for holiday rows
  slotRow: {
    flexDirection: "row",
    alignItems: "center",
    borderWidth: 1,
    borderRadius: 10,
    paddingHorizontal: 10,
    paddingVertical: 9,
    gap: 8,
    marginBottom: 4,
  },
  timeGroup: { flex: 1, flexDirection: "row", alignItems: "center", gap: 6 },
  timeInput: {
    flex: 1,
    borderWidth: 1,
    borderRadius: 8,
    paddingHorizontal: 10,
    paddingVertical: 5,
    fontSize: 13,
    textAlign: "center",
  },

  holidayToggle: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    borderWidth: 1,
    borderRadius: 12,
    paddingHorizontal: 14,
    paddingVertical: 12,
    marginTop: 4,
  },
  holidayToggleLeft: { flexDirection: "row", alignItems: "center", gap: 8 },
  holidayToggleText: { fontSize: 13 },
  holidayPanel: {
    borderWidth: 1,
    borderRadius: 12,
    overflow: "hidden",
    marginTop: 2,
  },
  holidayItem: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: 14,
    paddingVertical: 10,
    borderBottomWidth: 1,
  },
  holidayItemText: { flex: 1, fontSize: 12 },
  addHolidayBox: {
    padding: 12,
    gap: 8,
  },
  addHolidayLabel: { fontSize: 11, fontWeight: "600" },
  holidayDateRow: { flexDirection: "row", gap: 8 },
  holidayDateInput: {
    flex: 1,
    borderWidth: 1,
    borderRadius: 10,
    paddingHorizontal: 10,
    paddingVertical: 7,
    fontSize: 13,
  },
  holidayNoteInput: {
    borderWidth: 1,
    borderRadius: 10,
    paddingHorizontal: 10,
    paddingVertical: 7,
    fontSize: 13,
  },
  addHolidayBtn: {
    borderRadius: 10,
    paddingVertical: 8,
    alignItems: "center",
  },
  addHolidayBtnText: { fontSize: 13, fontWeight: "600" },

  saveBtn: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    borderRadius: 16,
    paddingVertical: 14,
    marginTop: 4,
  },
  saveBtnText: { color: "#fff", fontSize: 14, fontWeight: "700" },

  // History
  historyFilters: { gap: 8, marginBottom: 4 },
  presetBtnGroup: {
    flexDirection: "row",
    borderWidth: 1,
    borderRadius: 14,
    overflow: "hidden",
  },
  presetBtn: {
    flex: 1,
    paddingVertical: 9,
    alignItems: "center",
  },
  presetBtnText: { fontSize: 12, fontWeight: "600" },
  filterToggle: {
    flexDirection: "row",
    borderWidth: 1,
    borderRadius: 14,
    overflow: "hidden",
    alignSelf: "flex-start",
  },
  filterToggleBtn: {
    paddingHorizontal: 18,
    paddingVertical: 9,
  },
  filterToggleBtnText: { fontSize: 12, fontWeight: "600" },

  statsBanner: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: "rgba(45,212,191,0.2)",
    backgroundColor: "rgba(45,212,191,0.08)",
    paddingHorizontal: 14,
    paddingVertical: 12,
    marginBottom: 8,
  },
  statsIconWrap: {
    width: 40,
    height: 40,
    borderRadius: 10,
    backgroundColor: "rgba(45,212,191,0.15)",
    justifyContent: "center",
    alignItems: "center",
  },
  statsHours: { fontSize: 20, fontWeight: "700", color: "#2dd4bf", lineHeight: 24 },
  statsCount: { fontSize: 12, color: "rgba(45,212,191,0.7)", marginTop: 1 },

  // Pill
  pillRow: { flexDirection: "row", flexWrap: "wrap", gap: 8 },
  pill: {
    borderWidth: 1,
    borderRadius: 20,
    paddingHorizontal: 14,
    paddingVertical: 7,
  },
  pillText: { fontSize: 13, fontWeight: "500" },
});
