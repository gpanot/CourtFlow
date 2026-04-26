import * as FileSystem from "expo-file-system/legacy";
import * as Sharing from "expo-sharing";

export type CsvCell = string | number | boolean | null | undefined;

function escapeCsvCell(value: CsvCell): string {
  if (value === null || value === undefined) return "";
  const s = typeof value === "string" ? value : String(value);
  if (/[",\n\r]/.test(s)) return `"${s.replace(/"/g, '""')}"`;
  return s;
}

/** Build CSV string (UTF-8) from headers and row data. */
export function buildCsvString(headers: string[], rows: CsvCell[][]): string {
  const lines = [
    headers.map(escapeCsvCell).join(","),
    ...rows.map((row) => row.map(escapeCsvCell).join(",")),
  ];
  return lines.join("\n");
}

/** Write CSV to cache and open the native share sheet. */
export async function exportToCSV(
  filename: string,
  headers: string[],
  rows: CsvCell[][]
): Promise<void> {
  const content = buildCsvString(headers, rows);
  const base = FileSystem.cacheDirectory;
  if (!base) throw new Error("cacheDirectory unavailable");
  const path = `${base}${filename.replace(/^\/+/, "")}`;
  await FileSystem.writeAsStringAsync(path, content, { encoding: "utf8" });
  const canShare = await Sharing.isAvailableAsync();
  if (!canShare) throw new Error("Sharing is not available on this device");
  await Sharing.shareAsync(path, {
    mimeType: "text/csv",
    dialogTitle: "Export CSV",
    UTI: "public.comma-separated-values-text",
  });
}

/** DD/MM/YYYY in local timezone (Vietnamese-friendly). */
export function formatDateDDMMYYYY(iso: string | null | undefined): string {
  if (!iso) return "";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "";
  const dd = String(d.getDate()).padStart(2, "0");
  const mm = String(d.getMonth() + 1).padStart(2, "0");
  const yyyy = d.getFullYear();
  return `${dd}/${mm}/${yyyy}`;
}

/** HH:mm (24h) local */
export function formatTimeHHmm(iso: string | null | undefined): string {
  if (!iso) return "";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "";
  const hh = String(d.getHours()).padStart(2, "0");
  const min = String(d.getMinutes()).padStart(2, "0");
  return `${hh}:${min}`;
}

/** DD/MM/YYYY HH:mm local */
export function formatDateTimeDDMMYYYYHHmm(iso: string | null | undefined): string {
  if (!iso) return "";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "";
  return `${formatDateDDMMYYYY(iso)} ${formatTimeHHmm(iso)}`;
}

/** YYYY-MM-DD local for filenames */
export function formatFilenameDateLocal(d: Date): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

/** session_YYYY-MM-DD_HH-mm.csv from session openedAt */
export function sessionExportFilename(openedAtIso: string): string {
  const d = new Date(openedAtIso);
  if (Number.isNaN(d.getTime())) {
    const fallback = formatFilenameDateLocal(new Date());
    return `session_${fallback}_00-00.csv`;
  }
  const y = d.getFullYear();
  const mo = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  const hh = String(d.getHours()).padStart(2, "0");
  const mm = String(d.getMinutes()).padStart(2, "0");
  return `session_${y}-${mo}-${day}_${hh}-${mm}.csv`;
}
