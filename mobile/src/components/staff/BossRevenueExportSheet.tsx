import React, { useCallback, useMemo, useState } from "react";
import {
  View,
  Text,
  Modal,
  TouchableOpacity,
  StyleSheet,
  Platform,
  Pressable,
} from "react-native";
import DateTimePicker from "@react-native-community/datetimepicker";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import type { AppColors } from "../../theme/palettes";

type Props = {
  visible: boolean;
  onClose: () => void;
  theme: AppColors;
  /** Called with local start-of-day / end-of-day as ISO strings for API `from` / `to`. */
  onExport: (fromIso: string, toIso: string) => void | Promise<void>;
  title: string;
  fromLabel: string;
  toLabel: string;
  exportLabel: string;
  invalidRangeLabel: string;
  cancelLabel: string;
};

function startOfDay(d: Date): Date {
  const x = new Date(d);
  x.setHours(0, 0, 0, 0);
  return x;
}

function endOfDay(d: Date): Date {
  const x = new Date(d);
  x.setHours(23, 59, 59, 999);
  return x;
}

function formatPickLabel(d: Date): string {
  const dd = String(d.getDate()).padStart(2, "0");
  const mm = String(d.getMonth() + 1).padStart(2, "0");
  const yyyy = d.getFullYear();
  return `${dd}/${mm}/${yyyy}`;
}

function createSheetStyles(theme: AppColors) {
  return StyleSheet.create({
    overlay: {
      flex: 1,
      backgroundColor: "rgba(0,0,0,0.55)",
      justifyContent: "flex-end",
    },
    card: {
      backgroundColor: theme.card,
      borderTopLeftRadius: 16,
      borderTopRightRadius: 16,
      paddingHorizontal: 20,
      paddingTop: 18,
      borderTopWidth: 1,
      borderColor: theme.border,
    },
    title: { fontSize: 16, fontWeight: "700", color: theme.text, marginBottom: 14 },
    row: {
      flexDirection: "row",
      justifyContent: "space-between",
      alignItems: "center",
      paddingVertical: 12,
      borderBottomWidth: 1,
      borderBottomColor: theme.border,
    },
    rowLabel: { fontSize: 14, color: theme.muted },
    rowValue: { fontSize: 15, fontWeight: "600", color: theme.text },
    error: { color: "#f87171", fontSize: 13, marginTop: 8 },
    actions: { flexDirection: "row", gap: 10, marginTop: 18 },
    btnGhost: {
      flex: 1,
      paddingVertical: 12,
      borderRadius: 10,
      borderWidth: 1,
      borderColor: theme.border,
      alignItems: "center",
    },
    btnGhostText: { fontSize: 15, fontWeight: "600", color: theme.muted },
    btnPrimary: {
      flex: 1,
      paddingVertical: 12,
      borderRadius: 10,
      backgroundColor: theme.purple400,
      alignItems: "center",
    },
    btnPrimaryText: { fontSize: 15, fontWeight: "700", color: "#fff" },
    doneIos: { alignSelf: "flex-end", marginTop: 4, paddingVertical: 6, paddingHorizontal: 12 },
    doneIosText: { color: theme.purple400, fontWeight: "700", fontSize: 15 },
  });
}

export function BossRevenueExportSheet({
  visible,
  onClose,
  theme,
  onExport,
  title,
  fromLabel,
  toLabel,
  exportLabel,
  invalidRangeLabel,
  cancelLabel,
}: Props) {
  const insets = useSafeAreaInsets();
  const styles = useMemo(() => createSheetStyles(theme), [theme]);
  const [fromDate, setFromDate] = useState(() => {
    const x = new Date();
    x.setDate(x.getDate() - 30);
    return startOfDay(x);
  });
  const [toDate, setToDate] = useState(() => startOfDay(new Date()));
  const [picker, setPicker] = useState<"from" | "to" | null>(null);
  const [error, setError] = useState<string | null>(null);

  const closePicker = useCallback(() => setPicker(null), []);

  const onPick = useCallback(
    (_: unknown, selected?: Date) => {
      if (Platform.OS === "android") closePicker();
      if (!selected) return;
      if (picker === "from") setFromDate(startOfDay(selected));
      if (picker === "to") setToDate(startOfDay(selected));
    },
    [picker, closePicker]
  );

  const handleExport = useCallback(async () => {
    setError(null);
    const from = startOfDay(fromDate);
    const to = endOfDay(toDate);
    if (from.getTime() > to.getTime()) {
      setError(invalidRangeLabel);
      return;
    }
    await onExport(from.toISOString(), to.toISOString());
  }, [fromDate, toDate, invalidRangeLabel, onExport]);

  const pickerValue = picker === "to" ? toDate : fromDate;

  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onClose}>
      <Pressable style={styles.overlay} onPress={onClose}>
        <Pressable style={[styles.card, { paddingBottom: insets.bottom + 16 }]} onPress={(e) => e.stopPropagation()}>
          <Text style={styles.title}>{title}</Text>

          <TouchableOpacity style={styles.row} onPress={() => setPicker("from")} activeOpacity={0.7}>
            <Text style={styles.rowLabel}>{fromLabel}</Text>
            <Text style={styles.rowValue}>{formatPickLabel(fromDate)}</Text>
          </TouchableOpacity>

          <TouchableOpacity style={styles.row} onPress={() => setPicker("to")} activeOpacity={0.7}>
            <Text style={styles.rowLabel}>{toLabel}</Text>
            <Text style={styles.rowValue}>{formatPickLabel(toDate)}</Text>
          </TouchableOpacity>

          {error ? <Text style={styles.error}>{error}</Text> : null}

          {picker ? (
            <DateTimePicker
              value={pickerValue}
              mode="date"
              display={Platform.OS === "ios" ? "spinner" : "default"}
              onChange={onPick}
            />
          ) : null}

          {Platform.OS === "ios" && picker ? (
            <TouchableOpacity style={styles.doneIos} onPress={closePicker}>
              <Text style={styles.doneIosText}>OK</Text>
            </TouchableOpacity>
          ) : null}

          <View style={styles.actions}>
            <TouchableOpacity style={styles.btnGhost} onPress={onClose}>
              <Text style={styles.btnGhostText}>{cancelLabel}</Text>
            </TouchableOpacity>
            <TouchableOpacity style={styles.btnPrimary} onPress={() => void handleExport()}>
              <Text style={styles.btnPrimaryText}>{exportLabel}</Text>
            </TouchableOpacity>
          </View>
        </Pressable>
      </Pressable>
    </Modal>
  );
}
