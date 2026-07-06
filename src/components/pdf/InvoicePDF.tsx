import React from "react";
import {
  Document,
  Page,
  Text,
  View,
  StyleSheet,
  Image,
} from "@react-pdf/renderer";

const BRAND_GREEN = "#22c55e";
const DARK_BG = "#111827";
const BORDER = "#e5e7eb";
const MUTED = "#6b7280";
const BODY_TEXT = "#1f2937";

const styles = StyleSheet.create({
  page: {
    fontFamily: "Helvetica",
    fontSize: 9,
    color: BODY_TEXT,
    backgroundColor: "#ffffff",
    paddingTop: 40,
    paddingBottom: 50,
    paddingHorizontal: 48,
  },
  // ── Header ───────────────────────────────────────────
  header: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "flex-start",
    marginBottom: 28,
    paddingBottom: 20,
    borderBottomWidth: 2,
    borderBottomColor: BRAND_GREEN,
  },
  headerLeft: {
    flex: 1,
  },
  logo: {
    width: 48,
    height: 48,
    marginBottom: 6,
    objectFit: "contain",
  },
  venueName: {
    fontSize: 14,
    fontFamily: "Helvetica-Bold",
    color: DARK_BG,
    marginBottom: 2,
  },
  venueDetail: {
    fontSize: 8,
    color: MUTED,
    lineHeight: 1.5,
  },
  headerRight: {
    alignItems: "flex-end",
    minWidth: 160,
  },
  invoiceLabel: {
    fontSize: 20,
    fontFamily: "Helvetica-Bold",
    color: BRAND_GREEN,
    letterSpacing: 1,
    marginBottom: 4,
  },
  invoiceNumber: {
    fontSize: 10,
    fontFamily: "Helvetica-Bold",
    color: DARK_BG,
    marginBottom: 2,
  },
  invoiceDate: {
    fontSize: 8,
    color: MUTED,
  },
  // ── Bill-to / Meta row ────────────────────────────────
  metaRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    marginBottom: 24,
    gap: 16,
  },
  metaBox: {
    flex: 1,
    padding: 12,
    backgroundColor: "#f9fafb",
    borderRadius: 4,
    borderWidth: 1,
    borderColor: BORDER,
  },
  metaTitle: {
    fontSize: 7,
    fontFamily: "Helvetica-Bold",
    color: MUTED,
    textTransform: "uppercase",
    letterSpacing: 0.6,
    marginBottom: 6,
  },
  metaValue: {
    fontSize: 9,
    color: BODY_TEXT,
    lineHeight: 1.6,
  },
  metaValueBold: {
    fontSize: 9,
    fontFamily: "Helvetica-Bold",
    color: BODY_TEXT,
    lineHeight: 1.6,
  },
  // ── Line-items table ──────────────────────────────────
  table: {
    marginBottom: 20,
  },
  tableHeader: {
    flexDirection: "row",
    backgroundColor: DARK_BG,
    paddingVertical: 7,
    paddingHorizontal: 10,
    borderRadius: 4,
    marginBottom: 1,
  },
  tableHeaderCell: {
    fontSize: 7,
    fontFamily: "Helvetica-Bold",
    color: "#ffffff",
    textTransform: "uppercase",
    letterSpacing: 0.5,
  },
  tableRow: {
    flexDirection: "row",
    paddingVertical: 8,
    paddingHorizontal: 10,
    borderBottomWidth: 1,
    borderBottomColor: BORDER,
  },
  tableRowAlt: {
    backgroundColor: "#f9fafb",
  },
  cellDesc: { flex: 4 },
  cellDate: { flex: 2 },
  cellQty: { flex: 1, textAlign: "right" },
  cellPrice: { flex: 2, textAlign: "right" },
  rowText: { fontSize: 9, color: BODY_TEXT, lineHeight: 1.5 },
  rowTextMuted: { fontSize: 8, color: MUTED, lineHeight: 1.5 },
  // ── Totals ────────────────────────────────────────────
  totalsSection: {
    alignItems: "flex-end",
    marginBottom: 24,
  },
  totalRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    width: 220,
    paddingVertical: 3,
  },
  totalLabel: { fontSize: 9, color: MUTED },
  totalValue: { fontSize: 9, color: BODY_TEXT },
  grandTotalRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    width: 220,
    paddingVertical: 6,
    paddingHorizontal: 10,
    backgroundColor: BRAND_GREEN,
    borderRadius: 4,
    marginTop: 4,
  },
  grandTotalLabel: {
    fontSize: 10,
    fontFamily: "Helvetica-Bold",
    color: "#ffffff",
  },
  grandTotalValue: {
    fontSize: 10,
    fontFamily: "Helvetica-Bold",
    color: "#ffffff",
  },
  // ── Payment status badge ──────────────────────────────
  paidBadge: {
    alignSelf: "flex-start",
    backgroundColor: "#dcfce7",
    borderWidth: 1,
    borderColor: "#86efac",
    paddingHorizontal: 10,
    paddingVertical: 3,
    borderRadius: 20,
    marginBottom: 20,
  },
  paidBadgeText: {
    fontSize: 8,
    fontFamily: "Helvetica-Bold",
    color: "#166534",
    textTransform: "uppercase",
    letterSpacing: 0.5,
  },
  // ── Bank / payment info ────────────────────────────────
  paymentBox: {
    padding: 12,
    backgroundColor: "#f9fafb",
    borderRadius: 4,
    borderWidth: 1,
    borderColor: BORDER,
    marginBottom: 20,
  },
  paymentBoxTitle: {
    fontSize: 7,
    fontFamily: "Helvetica-Bold",
    color: MUTED,
    textTransform: "uppercase",
    letterSpacing: 0.6,
    marginBottom: 6,
  },
  paymentRow: {
    flexDirection: "row",
    gap: 4,
    marginBottom: 2,
  },
  paymentKey: { fontSize: 8, color: MUTED, width: 80 },
  paymentVal: { fontSize: 8, fontFamily: "Helvetica-Bold", color: BODY_TEXT },
  // ── Footer ────────────────────────────────────────────
  footer: {
    position: "absolute",
    bottom: 24,
    left: 48,
    right: 48,
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    borderTopWidth: 1,
    borderTopColor: BORDER,
    paddingTop: 8,
  },
  footerText: { fontSize: 7, color: MUTED },
});

// ── Helpers ──────────────────────────────────────────────────────────────────

function fmtMoney(value: number): string {
  return new Intl.NumberFormat("vi-VN").format(value) + " VND";
}

function fmtDate(iso: string): string {
  const d = new Date(iso);
  return d.toLocaleDateString("en-GB", {
    day: "2-digit",
    month: "short",
    year: "numeric",
  });
}

function fmtTime(iso: string): string {
  const d = new Date(iso);
  return d.toLocaleTimeString("en-GB", { hour: "2-digit", minute: "2-digit" });
}

function fmtPaymentMethod(method: string | null): string {
  if (!method) return "—";
  const map: Record<string, string> = {
    cash: "Cash",
    bank_transfer: "Bank Transfer",
    qr: "QR / Bank Transfer",
    courtpay: "CourtPay",
    free: "Complimentary",
  };
  return map[method.toLowerCase()] ?? method;
}

// ── Data types ──────────────────────────────────────────────────────────────

export interface InvoiceData {
  invoiceNumber: string;
  invoicedAt: string;
  type: "booking" | "openplay" | "lesson";
  // line item
  description: string;
  date: string;
  startTime: string;
  endTime: string;
  quantity: number;
  priceValue: number;
  // player
  playerName: string;
  playerPhone: string;
  // payment
  paymentMethod: string | null;
  paymentRef: string | null;
  // venue
  venueName: string;
  venueLocation: string | null;
  venueLogoUrl: string | null;
  venueBankAccount: string | null;
  venueBankName: string | null;
  venueBankOwnerName: string | null;
  venuePhone: string | null;
}

// ── Component ────────────────────────────────────────────────────────────────

export function InvoicePDF({ data }: { data: InvoiceData }) {
  const typeLabel =
    data.type === "booking"
      ? "Court Booking"
      : data.type === "openplay"
      ? "Open Play"
      : "Coaching Lesson";

  const hasBankInfo =
    data.venueBankAccount || data.venueBankName || data.venueBankOwnerName;

  return (
    <Document
      title={`Invoice ${data.invoiceNumber}`}
      author={data.venueName}
      subject={`${typeLabel} Invoice`}
    >
      <Page size="A4" style={styles.page}>
        {/* ── Header ── */}
        <View style={styles.header}>
          <View style={styles.headerLeft}>
            {data.venueLogoUrl ? (
              <Image src={data.venueLogoUrl} style={styles.logo} />
            ) : null}
            <Text style={styles.venueName}>{data.venueName}</Text>
            {data.venueLocation ? (
              <Text style={styles.venueDetail}>{data.venueLocation}</Text>
            ) : null}
            {data.venuePhone ? (
              <Text style={styles.venueDetail}>{data.venuePhone}</Text>
            ) : null}
          </View>
          <View style={styles.headerRight}>
            <Text style={styles.invoiceLabel}>INVOICE</Text>
            <Text style={styles.invoiceNumber}>{data.invoiceNumber}</Text>
            <Text style={styles.invoiceDate}>
              Issued: {fmtDate(data.invoicedAt)}
            </Text>
          </View>
        </View>

        {/* ── Bill-to / Meta ── */}
        <View style={styles.metaRow}>
          <View style={styles.metaBox}>
            <Text style={styles.metaTitle}>Billed To</Text>
            <Text style={styles.metaValueBold}>{data.playerName}</Text>
            <Text style={styles.metaValue}>{data.playerPhone}</Text>
          </View>
          <View style={styles.metaBox}>
            <Text style={styles.metaTitle}>Invoice Details</Text>
            <Text style={styles.metaValue}>
              <Text style={{ fontFamily: "Helvetica-Bold" }}>Type: </Text>
              {typeLabel}
            </Text>
            {data.paymentRef ? (
              <Text style={styles.metaValue}>
                <Text style={{ fontFamily: "Helvetica-Bold" }}>Ref: </Text>
                {data.paymentRef}
              </Text>
            ) : null}
            <Text style={styles.metaValue}>
              <Text style={{ fontFamily: "Helvetica-Bold" }}>Payment: </Text>
              {fmtPaymentMethod(data.paymentMethod)}
            </Text>
          </View>
        </View>

        {/* ── Paid badge ── */}
        <View style={styles.paidBadge}>
          <Text style={styles.paidBadgeText}>✓  Paid</Text>
        </View>

        {/* ── Line items ── */}
        <View style={styles.table}>
          <View style={styles.tableHeader}>
            <Text style={[styles.tableHeaderCell, styles.cellDesc]}>
              Description
            </Text>
            <Text style={[styles.tableHeaderCell, styles.cellDate]}>Date</Text>
            <Text style={[styles.tableHeaderCell, styles.cellQty]}>Qty</Text>
            <Text style={[styles.tableHeaderCell, styles.cellPrice]}>
              Amount
            </Text>
          </View>
          <View style={styles.tableRow}>
            <View style={styles.cellDesc}>
              <Text style={styles.rowText}>{data.description}</Text>
              <Text style={styles.rowTextMuted}>
                {fmtTime(data.startTime)} – {fmtTime(data.endTime)}
              </Text>
            </View>
            <Text style={[styles.rowText, styles.cellDate]}>
              {fmtDate(data.date)}
            </Text>
            <Text style={[styles.rowText, styles.cellQty]}>{data.quantity}</Text>
            <Text style={[styles.rowText, styles.cellPrice]}>
              {fmtMoney(data.priceValue)}
            </Text>
          </View>
        </View>

        {/* ── Totals ── */}
        <View style={styles.totalsSection}>
          <View style={styles.totalRow}>
            <Text style={styles.totalLabel}>Subtotal</Text>
            <Text style={styles.totalValue}>{fmtMoney(data.priceValue)}</Text>
          </View>
          <View style={styles.totalRow}>
            <Text style={styles.totalLabel}>Tax</Text>
            <Text style={styles.totalValue}>—</Text>
          </View>
          <View style={styles.grandTotalRow}>
            <Text style={styles.grandTotalLabel}>Total</Text>
            <Text style={styles.grandTotalValue}>
              {fmtMoney(data.priceValue)}
            </Text>
          </View>
        </View>

        {/* ── Bank / Payment info ── */}
        {hasBankInfo ? (
          <View style={styles.paymentBox}>
            <Text style={styles.paymentBoxTitle}>Payment Information</Text>
            {data.venueBankName ? (
              <View style={styles.paymentRow}>
                <Text style={styles.paymentKey}>Bank</Text>
                <Text style={styles.paymentVal}>{data.venueBankName}</Text>
              </View>
            ) : null}
            {data.venueBankOwnerName ? (
              <View style={styles.paymentRow}>
                <Text style={styles.paymentKey}>Account Name</Text>
                <Text style={styles.paymentVal}>{data.venueBankOwnerName}</Text>
              </View>
            ) : null}
            {data.venueBankAccount ? (
              <View style={styles.paymentRow}>
                <Text style={styles.paymentKey}>Account Number</Text>
                <Text style={styles.paymentVal}>{data.venueBankAccount}</Text>
              </View>
            ) : null}
            {data.paymentRef ? (
              <View style={styles.paymentRow}>
                <Text style={styles.paymentKey}>Transfer Ref</Text>
                <Text style={styles.paymentVal}>{data.paymentRef}</Text>
              </View>
            ) : null}
          </View>
        ) : null}

        {/* ── Footer ── */}
        <View style={styles.footer} fixed>
          <Text style={styles.footerText}>
            {data.venueName} · {data.invoiceNumber}
          </Text>
          <Text
            style={styles.footerText}
            render={({ pageNumber, totalPages }) =>
              `Page ${pageNumber} of ${totalPages}`
            }
          />
        </View>
      </Page>
    </Document>
  );
}
